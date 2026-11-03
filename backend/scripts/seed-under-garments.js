'use strict';
/**
 * Creates the Under Garments dedicated section and its four starting sub-categories, ONLY where they do not exist yet
 * (matched by slug). Existing categories are never changed, so it is safe to run again. Everything created here can be
 * renamed, deactivated or re-ordered from Admin -> Categories afterwards; nothing in the storefront is hardcoded.
 *
 *   node scripts/seed-under-garments.js            # dry run
 *   node scripts/seed-under-garments.js --apply    # writes
 *
 * Undo: delete the categories in Admin -> Categories (or deactivate them) while they have no products.
 */
const { connectDB, disconnectDB } = require('../src/config/db');
const Category = require('../src/models/Category');

const ROOT = {
  name: 'Under Garments',
  slug: 'under-garments',
  description: 'Essentials for every day: underwear and socks for men, women and kids.',
  dedicatedSection: true,
  sortOrder: 90,
};
const CHILDREN = [
  { name: "Men's Underwear", slug: 'mens-underwear', audience: 'men', sortOrder: 1 },
  { name: "Women's Underwear", slug: 'womens-underwear', audience: 'women', sortOrder: 2 },
  { name: "Kids' Underwear", slug: 'kids-underwear', audience: 'kids', sortOrder: 3 },
  { name: 'Socks', slug: 'socks', sortOrder: 4 },
];

(async () => {
  const apply = process.argv.includes('--apply');
  await connectDB();
  let root = await Category.findOne({ slug: ROOT.slug });
  if (root) {
    console.log(`= "${ROOT.name}" already exists (left untouched${root.dedicatedSection ? '' : '; NOTE: it is not flagged as a dedicated section: edit it in Admin -> Categories'})`);
  } else {
    console.log(`+ create "${ROOT.name}" (dedicated section)`);
    if (apply) root = await Category.create({ ...ROOT, isActive: true });
  }
  for (const c of CHILDREN) {
    if (await Category.exists({ slug: c.slug })) {
      console.log(`= "${c.name}" already exists (left untouched)`);
    } else {
      console.log(`+ create "${c.name}"`);
      if (apply && root) await Category.create({ ...c, parentCategory: root._id, isActive: true });
    }
  }
  console.log(apply ? 'Applied.' : 'Dry run only. Re-run with --apply to write.');
  await disconnectDB();
})().catch((e) => { console.error(e.message); process.exit(1); });
