'use strict';

/*
 * Creates and verifies the "only one admin" unique partial index on users.
 *
 *   npm run ensure-admin-index
 *
 * Safe by design:
 *   - it first COUNTS existing admins; with more than one it stops and prints them, because the unique index
 *     cannot be built over duplicates. It never deletes or changes any user: you decide which one to demote.
 *   - it then creates the index (idempotent) and reads it back from MongoDB to prove it exists and is
 *     { unique: true, partialFilterExpression: { role: 'admin' } }.
 *
 * autoIndex is OFF in production, so run this once per environment (or `npm run sync-indexes`).
 */

const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');

const INDEX_NAME = 'unique_single_admin';

async function main() {
  await connectDB();

  const admins = await User.find({ role: 'admin' }).select('email phone createdAt').sort({ createdAt: 1 }).lean();
  console.log(`Existing admin accounts: ${admins.length}`);
  if (admins.length > 1) {
    admins.forEach((a, i) => console.log(`  ${i + 1}. ${a.email} (${a.phone}) created ${a.createdAt?.toISOString?.() || 'n/a'}`));
    throw new Error('More than one admin exists, so the one-admin unique index cannot be built. Demote the extra admins yourself (nothing was changed), then re-run.');
  }

  await User.collection.createIndex(
    { role: 1 },
    { name: INDEX_NAME, unique: true, partialFilterExpression: { role: 'admin' } },
  );

  const idx = (await User.collection.indexes()).find((i) => i.name === INDEX_NAME);
  const ok = idx && idx.unique === true && JSON.stringify(idx.partialFilterExpression) === JSON.stringify({ role: 'admin' });
  if (!ok) throw new Error(`Index ${INDEX_NAME} is missing or has the wrong definition: ${JSON.stringify(idx)}`);
  console.log(`OK: index ${INDEX_NAME} exists -> ${JSON.stringify({ key: idx.key, unique: idx.unique, partialFilterExpression: idx.partialFilterExpression })}`);
}

main()
  .catch((error) => {
    console.error(`ensure-admin-index failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
