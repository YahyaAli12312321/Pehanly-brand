'use strict';

/*
 * Product audience backfill (DRY RUN by default).
 *
 * Product.audience is optional. A product without one already inherits the audience of its
 * category (or nearest ancestor), so NOTHING has to be run for the storefront to keep working.
 * This script only makes that inherited audience explicit, which is handy before an admin starts
 * re-categorising products.
 *
 *   node scripts/backfill-product-audience.js           # report only
 *   node scripts/backfill-product-audience.js --apply   # stamp product.audience from the category
 *
 * Rules (it never guesses):
 *  - only products whose audience is unset are considered;
 *  - audience is copied from the nearest category (self, then ancestors) that has men/women/unisex;
 *  - products with no resolvable audience are listed and left untouched (set them in the admin);
 *  - nothing is ever turned into Unisex unless its category is Unisex.
 * Take a database backup before --apply.
 */

const { connectDB, disconnectDB } = require('../src/config/db');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const { AUDIENCES } = require('../src/services/audience');

const apply = process.argv.includes('--apply');

async function main() {
  await connectDB();

  const cats = await Category.find({}).select('_id parent audience').lean();
  const byId = new Map(cats.map((c) => [String(c._id), c]));
  const resolve = (id) => {
    const seen = new Set();
    let cur = byId.get(String(id));
    while (cur && !seen.has(String(cur._id))) {
      seen.add(String(cur._id));
      const a = String(cur.audience || '').toLowerCase();
      if (AUDIENCES.includes(a)) return a;
      cur = cur.parent ? byId.get(String(cur.parent)) : null;
    }
    return null;
  };

  const products = await Product.find({ $or: [{ audience: null }, { audience: { $exists: false } }] })
    .select('_id name category')
    .lean();

  const plan = { men: [], women: [], unisex: [] };
  const unresolved = [];
  for (const p of products) {
    const a = resolve(p.category);
    if (a) plan[a].push(p._id);
    else unresolved.push(p);
  }

  console.log(`Products without an explicit audience: ${products.length}`);
  for (const a of AUDIENCES) console.log(`  -> ${a}: ${plan[a].length}`);
  console.log(`  unresolved (category has no audience): ${unresolved.length}`);
  unresolved.slice(0, 25).forEach((p) => console.log(`     ${p._id}  ${p.name}`));

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write.');
  } else {
    for (const a of AUDIENCES) {
      if (!plan[a].length) continue;
      const r = await Product.updateMany({ _id: { $in: plan[a] } }, { $set: { audience: a } });
      console.log(`Updated ${r.modifiedCount ?? r.nModified ?? 0} product(s) -> ${a}`);
    }
  }
  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err);
  try { await disconnectDB(); } catch (_) { /* ignore */ }
  process.exit(1);
});
