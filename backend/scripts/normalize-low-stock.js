'use strict';
/**
 * One-off, idempotent data update for the FIXED low-stock threshold (10).
 *   1. Recomputes Sku.stockStatus from `available` with the fixed threshold (SKUs saved under the old default of 5 or a
 *      per-SKU threshold may carry a stale "ok").
 *   2. Removes the legacy per-SKU Sku.lowStockThreshold field (it is no longer used or editable).
 * Nothing else is touched: stock, reserved stock, prices and stock history are left exactly as they are.
 *
 *   node scripts/normalize-low-stock.js            # dry run: prints what would change
 *   node scripts/normalize-low-stock.js --apply    # writes
 */
const { connectDB, disconnectDB } = require('../src/config/db');
const Sku = require('../src/models/Sku');
const { LOW_STOCK_THRESHOLD } = require('../src/constants/inventory');

(async () => {
  const apply = process.argv.includes('--apply');
  await connectDB();
  const T = LOW_STOCK_THRESHOLD;
  const expected = [
    { status: 'out', filter: { available: { $lte: 0 } } },
    { status: 'low', filter: { available: { $gt: 0, $lte: T } } },
    { status: 'ok', filter: { available: { $gt: T } } },
  ];
  let wrong = 0;
  for (const e of expected) {
    const filter = { ...e.filter, stockStatus: { $ne: e.status } };
    const n = await Sku.countDocuments(filter);
    wrong += n;
    console.log(`${n} SKU(s) should be "${e.status}" but are not`);
    if (apply && n) await Sku.updateMany(filter, { $set: { stockStatus: e.status } });
  }
  const legacy = await Sku.countDocuments({ lowStockThreshold: { $exists: true } });
  console.log(`${legacy} SKU(s) carry a legacy per-SKU lowStockThreshold`);
  if (apply && legacy) await Sku.updateMany({ lowStockThreshold: { $exists: true } }, { $unset: { lowStockThreshold: '' } });
  console.log(apply ? `Applied (${wrong} status fixes, ${legacy} legacy fields removed).` : 'Dry run only. Re-run with --apply to write.');
  await disconnectDB();
})().catch((e) => { console.error(e.message); process.exit(1); });
