'use strict';

/*
 * Stock reconciliation (DRY RUN by default).
 *
 * Before the stock lifecycle was unified, reservations were never converted
 * into physical deductions, so reservedStock may include units that belong to
 * orders already shipped or delivered. This script recomputes, per SKU:
 *
 *   expectedReserved = units held by OPEN orders
 *                      (retail / wholesale, status pending|confirmed|processing,
 *                       stock not yet committed)
 *
 * and compares it with Sku.reservedStock.
 *
 *   node scripts/reconcile-stock.js           # report only
 *   node scripts/reconcile-stock.js --apply   # set reservedStock/available to the expected value
 *
 * It NEVER touches Sku.stock (physical count). Whether shipped orders were
 * already deducted from physical stock by a manual adjustment cannot be
 * determined from the database, so review the report and adjust stock through
 * the inventory screen if needed. Take a database backup before --apply.
 */

const { connectDB, disconnectDB } = require('../src/config/db');
const Order = require('../src/models/order.model');
const Sku = require('../src/models/Sku');
const { stockStatus } = require('../src/utils/stock');

const apply = process.argv.includes('--apply');

async function main() {
  await connectDB();

  const rows = await Order.aggregate([
    {
      $match: {
        orderType: { $in: ['retail', 'wholesale'] },
        orderStatus: { $in: ['pending', 'confirmed', 'processing'] },
        stockCommittedAt: null,
      },
    },
    { $unwind: '$items' },
    { $match: { 'items.sku': { $ne: null } } },
    { $group: { _id: '$items.sku', quantity: { $sum: '$items.quantity' } } },
  ]);

  const expected = new Map(rows.map((row) => [String(row._id), row.quantity]));

  let drift = 0;
  let fixed = 0;

  for await (const sku of Sku.find({}).cursor()) {
    const want = expected.get(String(sku._id)) || 0;

    if (sku.reservedStock === want) continue;

    drift += 1;

    console.log(
      `${sku.sku}: reserved ${sku.reservedStock} -> expected ${want}` +
        ` (stock ${sku.stock}, available ${sku.available} -> ${Math.max(0, sku.stock - want)})`,
    );

    if (apply) {
      const available = Math.max(0, sku.stock - want);

      await Sku.updateOne(
        { _id: sku._id, reservedStock: sku.reservedStock },
        {
          $set: {
            reservedStock: want,
            available,
            stockStatus: stockStatus({ available, lowStockThreshold: sku.lowStockThreshold }),
          },
        },
      );
      fixed += 1;
    }
  }

  console.log(
    apply
      ? `Done. ${drift} SKU(s) with drift, ${fixed} corrected.`
      : `Dry run. ${drift} SKU(s) with drift. Re-run with --apply to correct reservedStock/available.`,
  );
}

main()
  .catch((error) => {
    console.error(`reconcile-stock failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
