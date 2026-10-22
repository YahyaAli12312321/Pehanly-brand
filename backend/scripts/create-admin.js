'use strict';

/*
 * Creates (or promotes) the owner account.
 *
 *   ADMIN_EMAIL=owner@example.com ADMIN_PHONE=03001234567 \
 *   ADMIN_NAME="Owner" ADMIN_PASSWORD='a-long-secret' npm run create-admin
 *
 * The password is read from the environment, never from the command line
 * history of a shared machine, and is never printed.
 */

const bcrypt = require('bcryptjs');

const { config } = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');
const { normalizeEmail, normalizePhone } = require('../src/utils/identity');

async function main() {
  const { ADMIN_EMAIL, ADMIN_PHONE, ADMIN_NAME, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PHONE || !ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_EMAIL, ADMIN_PHONE and ADMIN_PASSWORD (optional: ADMIN_NAME).');
  }

  if (ADMIN_PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  }

  const email = normalizeEmail(ADMIN_EMAIL);
  const phone = normalizePhone(ADMIN_PHONE);

  if (!phone) {
    throw new Error('ADMIN_PHONE is not a valid phone number.');
  }

  await connectDB();

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, config.auth.bcryptRounds);
  // Maximum one admin (unique_single_admin). Re-running for the SAME account is fine; a second admin is refused.
  const otherAdmin = await User.findOne({ role: 'admin', email: { $ne: email }, phone: { $ne: phone } }).select('email');
  if (otherAdmin) throw new Error(`An admin account already exists (${otherAdmin.email}). Only one admin is allowed.`);

  const existing = await User.findOne({ $or: [{ email }, { phone }] }).select('+tokenVersion');

  if (existing) {
    existing.role = 'admin';
    existing.isActive = true;
    existing.passwordHash = passwordHash;
    existing.tokenVersion = (existing.tokenVersion ?? 0) + 1; // end old sessions
    await existing.save();
    console.log(`Updated existing account ${email} to admin.`);
  } else {
    await User.create({
      name: ADMIN_NAME || 'Owner',
      email,
      phone,
      passwordHash,
      role: 'admin',
    });
    console.log(`Created admin account ${email}.`);
  }
}

main()
  .catch((error) => {
    console.error(`create-admin failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
