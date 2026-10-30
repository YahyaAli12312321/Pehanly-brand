'use strict';

/* Round 3 regressions: New Arrivals filter, parent-only categories, create-only single image. Models stubbed. */
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-unit-test-secret-1234';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_unit_test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');

const SRC = path.join(__dirname, '..', 'src');
const load = (...p) => require(path.join(SRC, ...p));
const oid = (n) => new mongoose.Types.ObjectId(String(n).padStart(24, '0'));

/* ---------- validators ---------- */
const cv = () => load('validators', 'catalog.validators.js');

test('productsQuery parses newArrival strictly', () => {
  assert.equal(cv().productsQuery.parse({ newArrival: 'true' }).newArrival, true);
  assert.equal(cv().productsQuery.parse({ newArrival: 'false' }).newArrival, false);
  assert.equal(cv().productsQuery.parse({}).newArrival, undefined);
  assert.ok(!cv().productsQuery.safeParse({ newArrival: 'yes' }).success);
});

test('categoriesQuery parses parentOnly strictly', () => {
  assert.equal(cv().categoriesQuery.parse({ parentOnly: 'true' }).parentOnly, true);
  assert.equal(cv().categoriesQuery.parse({}).parentOnly, undefined);
  assert.ok(!cv().categoriesQuery.safeParse({ parentOnly: '1' }).success);
});

/* ---------- product list: New Arrivals ---------- */
function stubProductQueries() {
  const Category = load('models', 'Category.js');
  Category.find = () => ({ select: () => ({ lean: async () => [{ _id: oid(1) }] }), lean: async () => [{ _id: oid(1) }] });
  const Product = load('models', 'Product.js');
  const seen = {};
  Product.countDocuments = async (f) => { seen.filter = f; return 0; };
  Product.find = (f) => { seen.filter = f; const c = { sort: () => c, skip: () => c, limit: () => c, populate: () => c, select: () => c, lean: async () => [] }; return c; };
  load('models', 'ProductVariant.js').find = () => ({ sort: () => ({ lean: async () => [] }), lean: async () => [] });
  load('models', 'Sku.js').find = () => ({ sort: () => ({ lean: async () => [] }), lean: async () => [] });
  return seen;
}

test('newArrival=true filters on the real isNewArrival === true field (not createdAt)', async () => {
  const seen = stubProductQueries();
  await load('services', 'catalog.service.js').listProducts({ page: 1, limit: 4, sort: 'newest', newArrival: true });
  assert.equal(seen.filter.isNewArrival, true);
  assert.equal(seen.filter.status, 'active');
  assert.ok(!('createdAt' in seen.filter));
});

test('newArrival omitted adds no isNewArrival condition; false excludes flagged products', async () => {
  let seen = stubProductQueries();
  const svc = load('services', 'catalog.service.js');
  await svc.listProducts({ page: 1, limit: 12, sort: 'newest' });
  assert.ok(!('isNewArrival' in seen.filter));
  await svc.listProducts({ page: 1, limit: 12, sort: 'newest', newArrival: false });
  assert.deepEqual(seen.filter.isNewArrival, { $ne: true });
});

test('Product schema: isNewArrival is a Boolean defaulting to false (missing/unset never counts as new)', () => {
  const p = load('models', 'Product.js').schema.path('isNewArrival');
  assert.equal(p.instance, 'Boolean');
  assert.equal(p.defaultValue, false);
});

test('card view exposes isNewArrival as given; a toggled-off product is false', () => {
  const { productCardView } = load('services', 'catalog.service.js');
  const base = { _id: oid(5), name: 'x', slug: 'x', generalImages: [] };
  assert.equal(productCardView({ ...base, isNewArrival: true }, [], []).isNewArrival, true);
  assert.equal(productCardView({ ...base, isNewArrival: false }, [], []).isNewArrival, false);
  assert.equal(Boolean(productCardView({ ...base }, [], []).isNewArrival), false);
});

/* ---------- categories: parent-only ---------- */
const catRows = [
  { _id: oid(1), name: 'Men', slug: 'men', parentCategory: null, isActive: true },
  { _id: oid(2), name: 'Tees', slug: 'tees', parentCategory: oid(1), isActive: true },
  { _id: oid(3), name: 'Legacy', slug: 'legacy', isActive: true }, // parentCategory missing entirely
];
function stubCategories() {
  const Category = load('models', 'Category.js');
  const seen = {};
  Category.find = (f) => {
    seen.filter = f;
    const rows = catRows.filter((r) => ('parentCategory' in f ? (r.parentCategory ?? null) === f.parentCategory : true));
    const c = { sort: () => c, lean: async () => rows };
    return c;
  };
  return seen;
}

test('parentOnly returns top-level categories (null and missing parent), never children', async () => {
  const seen = stubCategories();
  const out = await load('services', 'catalog.service.js').listCategories({ parentOnly: true });
  assert.equal(seen.filter.parentCategory, null);
  assert.deepEqual(out.map((c) => c.slug).sort(), ['legacy', 'men']);
  assert.ok(out.every((c) => c.parentId === null));
});

test('without parentOnly the full tree is still returned (subcategories not hidden globally)', async () => {
  const seen = stubCategories();
  const out = await load('services', 'catalog.service.js').listCategories({});
  assert.ok(!('parentCategory' in seen.filter));
  assert.equal(out.length, 3);
  assert.equal(out.find((c) => c.slug === 'tees').parentId, String(oid(1)));
});

/* ---------- create-only single image ---------- */
const media = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://res.cloudinary.com/x/image/upload/p${i}.jpg`, publicId: `p${i}`, alt: `a${i}`, sortOrder: i }));
const issues = (schema, n) => (schema.safeParse({ generalImages: media(n) }).error?.issues || []).filter((i) => i.path[0] === 'generalImages');
const pv = () => load('validators', 'product.validators.js');

test('create: 1 image ok, 2+ rejected; update/edit keeps the 25 limit and multi-image products stay editable', () => {
  assert.equal(issues(pv().createProductBody, 1).length, 0);
  assert.ok(issues(pv().createProductBody, 2).length > 0);
  assert.equal(issues(pv().updateProductBody, 2).length, 0);
  assert.equal(issues(pv().updateProductBody, 25).length, 0);
  assert.ok(issues(pv().updateProductBody, 26).length > 0);
});

test('a card cover for an existing multi-image product is still generalImages[0]', () => {
  const { productCardView } = load('services', 'catalog.service.js');
  const imgs = media(4).map((m) => ({ ...m }));
  const out = productCardView({ _id: oid(9), name: 'm', slug: 'm', generalImages: imgs }, [], []);
  assert.equal(out.image.url, imgs[0].url);
});
