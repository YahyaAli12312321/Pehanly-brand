'use strict';

/*
 * Builds every index declared in the Mongoose schemas.
 *
 * autoIndex is OFF in production, so run this on every deployment that
 * changes a schema:
 *
 *   npm run sync-indexes             # creates missing indexes, reports drift
 *   npm run sync-indexes -- --prune  # ALSO drops indexes that are no longer declared
 *
 * Without --prune nothing is ever dropped. Creating a unique index fails when
 * existing data already violates it; the error names the collection so you can
 * clean the data first (see docs/DEPLOYMENT.md).
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { connectDB, disconnectDB } = require('../src/config/db');

const prune = process.argv.includes('--prune');

async function main() {
  await connectDB();

  const modelsDir = path.join(__dirname, '..', 'src', 'models');

  for (const file of fs.readdirSync(modelsDir)) {
    if (file.endsWith('.js')) require(path.join(modelsDir, file));
  }

  let failed = 0;

  for (const name of mongoose.modelNames().sort()) {
    const model = mongoose.model(name);

    try {
      const diff = await model.diffIndexes();

      if (diff.toDrop.length && !prune) {
        console.log(`${name}: extra indexes present (not dropped): ${diff.toDrop.join(', ')}`);
      }

      if (prune) {
        await model.syncIndexes();
        console.log(`${name}: synced (pruned ${diff.toDrop.length}, created ${diff.toCreate.length})`);
      } else {
        await model.createIndexes();
        console.log(`${name}: ensured (${diff.toCreate.length} new)`);
      }
    } catch (error) {
      failed += 1;
      console.error(`${name}: FAILED - ${error.message}`);
    }
  }

  if (failed) {
    process.exitCode = 1;
    console.error(`${failed} collection(s) failed. Fix the data and re-run.`);
  }
}

main()
  .catch((error) => {
    console.error(`sync-indexes failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
