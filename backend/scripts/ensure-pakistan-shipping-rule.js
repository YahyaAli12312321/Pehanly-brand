'use strict';

/*
 * Makes delivery Pakistan-wide: makes sure an ACTIVE flat PKR ShippingRule for Pakistan exists. City rules and
 * free-shipping rules still win over it (flat is only the fallback for cities without their own rate).
 *
 *   npm run ensure-pakistan-shipping-rule -- --rate=450
 *
 * The delivery charge is a business decision, so --rate is REQUIRED: this script never invents a price and
 * never creates a free rule by accident (use --rate=0 only if the business really wants free delivery).
 * Idempotent: if an active Pakistan flat PKR rule already exists nothing is changed.
 */

const { connectDB, disconnectDB } = require('../src/config/db');
const ShippingRule = require('../src/models/ShippingRule');
const shippingRuleService = require('../src/services/shippingRule.service');

const arg = (name) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

async function main() {
  await connectDB();

  const existing = await ShippingRule.find({ isActive: true, type: 'flat' }).lean();
  const pk = existing.find(
    (r) => String(r.country || '').trim().toLowerCase() === 'pakistan' && (r.currency || 'PKR') === 'PKR' && typeof r.flatRate === 'number',
  );
  if (pk) {
    console.log(`OK: Pakistan-wide flat rule already active: "${pk.name}" = Rs. ${pk.flatRate}. Nothing changed.`);
    return;
  }

  const raw = arg('rate');
  const rate = Number(raw);
  if (raw === undefined || raw === '' || !Number.isFinite(rate) || rate < 0) {
    throw new Error('No active Pakistan-wide flat rule exists. Re-run with the delivery charge you want, e.g. --rate=450 (nothing was created).');
  }

  const rule = await shippingRuleService.create({
    name: 'Pakistan-wide delivery',
    type: 'flat',
    country: 'Pakistan',
    currency: 'PKR',
    flatRate: rate,
    priority: 100,
    isActive: true,
  });
  console.log(`CREATED: "${rule.name}" flat Rs. ${rule.flatRate} for Pakistan (id ${rule._id}).`);
}

main()
  .catch((err) => {
    console.error(`FAILED: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB().catch(() => {}));
