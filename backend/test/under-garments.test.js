'use strict';

/*
 * Under Garments = a "dedicated section" category. Models are replaced by a tiny in-memory fake that understands the
 * Mongo operators the catalog uses ($in, $nin, $ne, $or, $and, regex), so these tests check what is really RETURNED,
 * not just how a filter is shaped. No real MongoDB is involved.
 */
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-unit-test-secret-1234';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_unit_test';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');

const SRC = path.join(__dirname, '..', 'src');
const load = (...p) => require(path.join(SRC, ...p));
const oid = (n) => new mongoose.Types.ObjectId(String(n).padStart(24, '0'));
const same = (a, b) => String(a) === String(b);

/* ---- mini matcher ---- */
function matchValue(actual, cond) {
  if (cond instanceof RegExp) return cond.test(String(actual ?? ''));
  if (cond && typeof cond === 'object' && !(cond instanceof mongoose.Types.ObjectId) && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, v]) => {
      if (op === '$in') return v.some((x) => same(x, actual));
      if (op === '$nin') return !v.some((x) => same(x, actual));
      if (op === '$ne') return !same(actual, v);
      throw new Error(`fake matcher: unsupported ${op}`);
    });
  }
  return same(actual ?? null, cond ?? null) || (cond === null && actual === undefined);
}
function matches(doc, f = {}) {
  return Object.entries(f).every(([k, v]) => {
    if (k === '$or') return v.some((sub) => matches(doc, sub));
    if (k === '$and') return v.every((sub) => matches(doc, sub));
    return matchValue(doc[k], v);
  });
}
const query = (rows) => {
  let out = rows; const q = {};
  q.sort = (s) => { const [[k, d] = []] = Object.entries(s || {}); if (k) out = [...out].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (d < 0 ? -1 : 1)); return q; };
  q.skip = (n) => { out = out.slice(n); return q; };
  q.limit = (n) => { out = out.slice(0, n); return q; };
  q.select = () => q; q.session = () => q;
  q.populate = (field) => { out = out.map((r) => ({ ...r, [field]: cats.find((c) => same(c._id, r[field])) || r[field] })); return q; };
  q.lean = async () => out;
  q.then = (res, rej) => Promise.resolve(out).then(res, rej);
  return q;
};

/* ---- data ---- */
const UG = oid(10); const MEN_UW = oid(11); const WOMEN_UW = oid(12); const KIDS_UW = oid(13); const SOCKS = oid(14); const SHOP_MEN = oid(1);
const cats = [
  { _id: SHOP_MEN, name: 'Hoodies', slug: 'hoodies', isActive: true, parentCategory: null, sortOrder: 1 },
  { _id: UG, name: 'Under Garments', slug: 'under-garments', isActive: true, parentCategory: null, dedicatedSection: true, sortOrder: 5 },
  { _id: MEN_UW, name: "Men's Underwear", slug: 'mens-underwear', isActive: true, parentCategory: UG, sortOrder: 1 },
  { _id: WOMEN_UW, name: "Women's Underwear", slug: 'womens-underwear', isActive: true, parentCategory: UG, sortOrder: 2 },
  { _id: KIDS_UW, name: "Kids' Underwear", slug: 'kids-underwear', isActive: true, parentCategory: UG, sortOrder: 3 },
  { _id: SOCKS, name: 'Socks', slug: 'socks', isActive: false, parentCategory: UG, sortOrder: 4 },
];
const P = (n, name, category, extra = {}) => ({ _id: oid(100 + n), name, slug: name.toLowerCase().replace(/\W+/g, '-'), category, status: 'active', createdAt: new Date(2026, 0, n), generalImages: [], ...extra });
const products = [
  P(1, 'Boxy Hoodie', SHOP_MEN),
  P(2, 'Cotton Boxer', MEN_UW),
  P(3, 'Brief Pack', MEN_UW, { salesChannel: 'wholesale' }), // wholesale-only: never retail
  P(4, 'Lace Bralette', WOMEN_UW),
  P(5, 'Kids Vest', KIDS_UW),
  P(6, 'Ankle Socks', SOCKS), // inactive sub-category
  P(7, 'Draft Boxer', MEN_UW, { status: 'draft' }),
];
const variants = [
  { _id: oid(201), product: oid(101), isEnabled: true, color: { name: 'Black', hexCode: '#000' }, images: [] },
  { _id: oid(202), product: oid(102), isEnabled: true, color: { name: 'Black', hexCode: '#000' }, images: [] },
  { _id: oid(203), product: oid(102), isEnabled: true, color: { name: 'Grey', hexCode: '#888' }, images: [] },
  { _id: oid(204), product: oid(104), isEnabled: true, color: { name: 'Nude', hexCode: '#e8c4a0' }, images: [] },
  { _id: oid(205), product: oid(105), isEnabled: true, color: { name: 'White', hexCode: '#fff' }, images: [] },
];
const sku = (n, product, variant, size, price, available) => ({ _id: oid(300 + n), product: oid(product), variant: oid(variant), size, sku: `S${n}`, price, available, isEnabled: true, sortOrder: n });
const skus = [
  sku(1, 101, 201, 'M', 5000, 5),
  sku(2, 102, 202, '32', 700, 4), sku(3, 102, 202, '34', 700, 0), sku(4, 102, 203, '32', 800, 9),
  sku(5, 104, 204, 'S', 1500, 3), sku(6, 104, 204, 'M', 1500, 3),
  sku(7, 105, 205, 'X-Small', 400, 2),
];

let svc; let categories;
before(() => {
  load('models', 'Category.js').find = (f) => query(cats.filter((c) => matches(c, f)));
  load('models', 'Category.js').findOne = (f) => query(cats.filter((c) => matches(c, f)).slice(0, 1)).lean().then((r) => r[0] || null) && { select: () => ({ lean: async () => cats.find((c) => matches(c, f)) || null }), lean: async () => cats.find((c) => matches(c, f)) || null };
  load('models', 'Category.js').findById = (id) => ({ select: () => ({ lean: async () => cats.find((c) => same(c._id, id)) || null }) });
  load('models', 'Product.js').find = (f) => query(products.filter((p) => matches(p, f)));
  load('models', 'Product.js').countDocuments = async (f) => products.filter((p) => matches(p, f)).length;
  load('models', 'Product.js').findOne = (f) => ({ populate: () => ({ lean: async () => { const p = products.find((x) => matches(x, f)); return p ? { ...p, category: cats.find((c) => same(c._id, p.category)) } : null; } }) });
  load('models', 'ProductVariant.js').find = (f) => query(variants.filter((v) => matches(v, f)));
  load('models', 'Sku.js').find = (f) => query(skus.filter((s) => matches(s, f)));
  svc = load('services', 'catalog.service.js');
  categories = load('services', 'category.service.js');
});

const base = { page: 1, limit: 24, sort: 'newest' };
const names = (r) => r.items.map((i) => i.name).sort();

test('the general Shop listing never returns Under Garments products (no filter, search, audience, newArrival, parent or child slug)', async () => {
  assert.deepEqual(names(await svc.listProducts(base)), ['Boxy Hoodie']);
  assert.deepEqual(names(await svc.listProducts({ ...base, search: 'boxer' })), []);
  assert.deepEqual(names(await svc.listProducts({ ...base, search: 'cotton' })), []);
  assert.deepEqual(names(await svc.listProducts({ ...base, category: 'under-garments' })), []);
  assert.deepEqual(names(await svc.listProducts({ ...base, category: 'mens-underwear' })), []);
  assert.deepEqual(names(await svc.listProducts({ ...base, sort: 'price_asc' })), ['Boxy Hoodie']);
  assert.deepEqual(names(await svc.listProducts({ ...base, size: '32' })), []);
});

test('the flag `section` alone unlocks nothing outside a dedicated section', async () => {
  assert.deepEqual(names(await svc.listProducts({ ...base, section: true, category: 'hoodies' })), []);
  assert.deepEqual(names(await svc.listProducts({ ...base, section: true })), []);
  assert.deepEqual(names(await svc.listProducts({ ...base, section: true, category: 'nope' })), []);
});

test('the section page returns active, published, retail products of the section and its ACTIVE sub-categories only', async () => {
  const all = await svc.listProducts({ ...base, section: true, category: 'under-garments' });
  assert.deepEqual(names(all), ['Cotton Boxer', 'Kids Vest', 'Lace Bralette']); // not: wholesale-only Brief Pack, inactive-subcategory Socks, draft Boxer, shop hoodie
  assert.deepEqual(names(await svc.listProducts({ ...base, section: true, category: 'mens-underwear' })), ['Cotton Boxer']);
  assert.deepEqual(names(await svc.listProducts({ ...base, section: true, category: 'socks' })), []); // inactive sub-category
  assert.equal(all.meta.total, 3);
});

test('search, sort and pagination work inside the section', async () => {
  assert.deepEqual(names(await svc.listProducts({ ...base, section: true, category: 'under-garments', search: 'lace' })), ['Lace Bralette']);
  const asc = await svc.listProducts({ ...base, section: true, category: 'under-garments', sort: 'price_asc' });
  assert.deepEqual(asc.items.map((i) => i.name), ['Kids Vest', 'Cotton Boxer', 'Lace Bralette']);
  const desc = await svc.listProducts({ ...base, section: true, category: 'under-garments', sort: 'price_desc' });
  assert.equal(desc.items[0].name, 'Lace Bralette');
  const page2 = await svc.listProducts({ ...base, limit: 2, page: 2, section: true, category: 'under-garments' });
  assert.equal(page2.items.length, 1);
  assert.deepEqual([page2.meta.total, page2.meta.totalPages], [3, 2]);
});

test('size, colour, price and availability refinements filter on real SKU data (with exact totals)', async () => {
  const q = { ...base, section: true, category: 'under-garments' };
  assert.deepEqual(names(await svc.listProducts({ ...q, size: '32' })), ['Cotton Boxer']);
  assert.deepEqual(names(await svc.listProducts({ ...q, size: '34' })), []); // 34 exists but has no stock
  assert.deepEqual(names(await svc.listProducts({ ...q, size: 'm' })), ['Lace Bralette']); // case-insensitive
  assert.deepEqual(names(await svc.listProducts({ ...q, color: 'nude' })), ['Lace Bralette']);
  assert.deepEqual(names(await svc.listProducts({ ...q, minPrice: 1000 })), ['Lace Bralette']);
  assert.deepEqual(names(await svc.listProducts({ ...q, maxPrice: 500 })), ['Kids Vest']);
  assert.deepEqual(names(await svc.listProducts({ ...q, minPrice: 600, maxPrice: 900 })), ['Cotton Boxer']);
  assert.deepEqual(names(await svc.listProducts({ ...q, inStock: true })), ['Cotton Boxer', 'Kids Vest', 'Lace Bralette']);
  const none = await svc.listProducts({ ...q, size: 'XXL' });
  assert.equal(none.meta.total, 0);
});

test('categories: the general list hides the section and its sub-categories; the section list shows only active ones', async () => {
  const general = await svc.listCategories({});
  assert.deepEqual(general.map((c) => c.slug), ['hoodies']);
  assert.deepEqual((await svc.listCategories({ parentOnly: true })).map((c) => c.slug), ['hoodies']);
  const section = await svc.listCategories({ section: 'under-garments' });
  assert.deepEqual(section.map((c) => c.slug).sort(), ['kids-underwear', 'mens-underwear', 'under-garments', 'womens-underwear']); // socks (inactive) absent
  assert.deepEqual(await svc.listCategories({ section: 'hoodies' }), []); // not a dedicated section
  assert.deepEqual(await svc.listCategories({ section: 'nope' }), []);
});

test('facets only describe data that exists, and list active sub-categories with counts', async () => {
  const f = await svc.categoryFacets({ category: 'under-garments', section: true });
  assert.equal(f.total, 3);
  assert.deepEqual(f.sizes.sort(), ['32', 'M', 'S', 'X-Small'].sort());
  assert.deepEqual(f.colors.map((c) => c.name).sort(), ['Grey', 'Black', 'Nude', 'White'].sort());
  assert.equal(f.priceMin, 400);
  assert.equal(f.priceMax, 1500);
  assert.deepEqual(f.subcategories.map((s) => [s.slug, s.count]), [['mens-underwear', 1], ['womens-underwear', 1], ['kids-underwear', 1]]);
  const empty = await svc.categoryFacets({ category: 'hoodies', section: true });
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.sizes, []);
});

test('a direct product URL still works for an Under Garments product', async () => {
  const p = await svc.getProductBySlug('cotton-boxer');
  assert.equal(p.name, 'Cotton Boxer');
});

test('category rules: inactive categories cannot receive products; only a top-level category can be a section; duplicate names are refused', async () => {
  await assert.rejects(() => categories.assertAssignable(SOCKS), (e) => e.code === 'CATEGORY_INACTIVE');
  await categories.assertAssignable(MEN_UW); // active under an active parent
  const Category = load('models', 'Category.js');
  const exists = Category.exists;
  Category.exists = async ({ name, ...rest }) => cats.some((c) => matches(c, rest) && name.test(c.name));
  await assert.rejects(() => categories.create({ name: 'socks', parentCategory: UG.toString() }), (e) => e.code === 'NAME_CONFLICT');
  Category.exists = exists;
  const v = load('validators', 'category.validators.js');
  assert.equal(v.createBody.parse({ name: 'Under Garments', dedicatedSection: true }).dedicatedSection, true);
  assert.equal(v.updateBody.parse({ dedicatedSection: false }).dedicatedSection, false);
});

test('validators accept the new refinement params and reject junk', () => {
  const cv = load('validators', 'catalog.validators.js');
  const q = cv.productsQuery.parse({ section: 'true', category: 'under-garments', size: 'M', color: 'Black', minPrice: '100', maxPrice: '900', inStock: 'true' });
  assert.deepEqual([q.section, q.minPrice, q.maxPrice, q.inStock], [true, 100, 900, true]);
  assert.ok(!cv.productsQuery.safeParse({ minPrice: '-1' }).success);
  assert.ok(!cv.productsQuery.safeParse({ section: 'maybe' }).success);
  assert.equal(cv.facetsQuery.parse({ category: 'under-garments', section: 'true' }).section, true);
  assert.ok(!cv.facetsQuery.safeParse({}).success);
});
