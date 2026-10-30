'use strict';

/* Unisex audience filtering semantics + the 25-image product limit. Models stubbed (no MongoDB). */
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

/* ---- a tiny evaluator for the subset of Mongo operators the audience filter emits ---- */
const eq = (a, b) => String(a) === String(b);
function matchField(value, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && '$in' in cond) {
    return cond.$in.some((c) => (c === null ? value == null : eq(value, c)));
  }
  return eq(value, cond);
}
function matches(doc, filter) {
  return Object.entries(filter).every(([k, v]) => {
    if (k === '$and') return v.every((f) => matches(doc, f));
    if (k === '$or') return v.some((f) => matches(doc, f));
    return matchField(doc[k], v);
  });
}

// Category tree: tops(men) > tee ; wmn(women) > dress ; uni(unisex) ; plain(no audience) > plainChild
const cats = [
  { _id: oid(1), name: 'Mens', slug: 'mens', audience: 'men', parent: null, isActive: true },
  { _id: oid(2), name: 'Mens tees', slug: 'mens-tees', parent: oid(1), isActive: true },
  { _id: oid(3), name: 'Womens', slug: 'womens', audience: 'women', parent: null, isActive: true },
  { _id: oid(4), name: 'Dresses', slug: 'dresses', parent: oid(3), isActive: true },
  { _id: oid(5), name: 'Everyday', slug: 'everyday', audience: 'unisex', parent: null, isActive: true },
  { _id: oid(6), name: 'Misc', slug: 'misc', parent: null, isActive: true },
];
const subtree = (id) => {
  const out = [String(id)];
  cats.filter((c) => c.parent && eq(c.parent, id)).forEach((c) => out.push(...subtree(c._id)));
  return out;
};
const fakeCategoryService = { subtreeIds: async (id) => subtree(id) };

function stubCategory() {
  const Category = load('models', 'Category.js');
  Category.find = (q = {}) => {
    const rows = cats.filter((c) => matches(c, q.audience ? { audience: q.audience } : {}));
    const chain = { select: () => chain, sort: () => chain, lean: async () => rows };
    return chain;
  };
}

const products = [
  { _id: oid(101), name: 'Men tee', audience: 'men', category: oid(2) },
  { _id: oid(102), name: 'Women dress', audience: 'women', category: oid(4) },
  { _id: oid(103), name: 'Unisex hoodie', audience: 'unisex', category: oid(6) },
  { _id: oid(104), name: 'Legacy in men category (no audience)', audience: null, category: oid(2) },
  { _id: oid(105), name: 'Legacy in women category (field missing)', category: oid(4) },
  { _id: oid(106), name: 'Legacy in unisex category', category: oid(5) },
  { _id: oid(107), name: 'Legacy in category without audience', category: oid(6) },
  { _id: oid(108), name: 'Explicit women in a men category', audience: 'women', category: oid(2) },
];
const names = async (aud) => {
  stubCategory();
  const { audienceCondition } = load('services', 'audience.js');
  const cond = await audienceCondition(aud, fakeCategoryService);
  return products.filter((p) => matches(p, cond)).map((p) => p._id.toString().slice(-3));
};

test('Men shows men + unisex (explicit or inherited), never women-only', async () => {
  assert.deepEqual(await names('men'), ['101', '103', '104', '106']);
});

test('Women shows women + unisex (explicit or inherited), never men-only', async () => {
  assert.deepEqual(await names('women'), ['102', '103', '105', '106', '108']);
});

test('Unisex view shows only unisex', async () => {
  assert.deepEqual(await names('unisex'), ['103', '106']);
});

test('explicit product audience wins over the category audience; unset products inherit it', async () => {
  const men = await names('men');
  const women = await names('women');
  assert.ok(!men.includes('108') && women.includes('108')); // women product inside a men category
  assert.ok(men.includes('104') && !women.includes('104')); // legacy product follows its category
});

test('a product with no audience in a category with none is not claimed by Men or Women (never silently Unisex)', async () => {
  assert.ok(!(await names('men')).includes('107'));
  assert.ok(!(await names('women')).includes('107'));
});

test('invalid audience yields no condition', async () => {
  const { audienceCondition } = load('services', 'audience.js');
  assert.equal(await audienceCondition('kids', fakeCategoryService), null);
});

test('listProducts applies the audience filter alongside search without clobbering it', async () => {
  stubCategory();
  const Product = load('models', 'Product.js');
  let seen;
  Product.countDocuments = async (f) => { seen = f; return 0; };
  Product.find = (f) => { seen = f; const c = { sort: () => c, skip: () => c, limit: () => c, populate: () => c, lean: async () => [] }; return c; };
  const ProductVariant = load('models', 'ProductVariant.js');
  const Sku = load('models', 'Sku.js');
  ProductVariant.find = () => ({ sort: () => ({ lean: async () => [] }), lean: async () => [] });
  Sku.find = () => ({ sort: () => ({ lean: async () => [] }), lean: async () => [] });
  const svc = load('services', 'catalog.service.js');
  await svc.listProducts({ page: 1, limit: 12, sort: 'newest', audience: 'women', search: 'dress' });
  assert.ok(seen.$or, 'search $or kept');
  assert.ok(Array.isArray(seen.$and) && seen.$and.length === 1, 'audience $and present');
  assert.ok(seen.status === 'active');
});

/* ---- validators ---- */
const pv = () => load('validators', 'product.validators.js');
const media = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://res.cloudinary.com/x/image/upload/p${i}.jpg`, publicId: `p${i}`, alt: `a${i}`, sortOrder: i }));
const imageIssues = (schema, n) => (schema.safeParse({ generalImages: media(n) }).error?.issues || []).filter((i) => i.path[0] === 'generalImages');

test('image limit constant is 25', () => assert.equal(pv().PRODUCT_IMAGE_LIMIT, 25));

test('create accepts exactly 1 main image and rejects 2 (create-only limit)', () => {
  assert.equal(pv().PRODUCT_CREATE_IMAGE_LIMIT, 1);
  assert.equal(imageIssues(pv().createProductBody, 0).length, 0);
  assert.equal(imageIssues(pv().createProductBody, 1).length, 0);
  assert.ok(imageIssues(pv().createProductBody, 2).length > 0);
  assert.ok(imageIssues(pv().createProductBody, 25).length > 0);
});

test('update accepts 25 images and rejects 26 (create and edit agree)', () => {
  assert.equal(imageIssues(pv().updateProductBody, 25).length, 0);
  assert.ok(imageIssues(pv().updateProductBody, 26).length > 0);
});

test('image order and metadata survive validation', () => {
  const r = pv().updateProductBody.safeParse({ generalImages: media(25) });
  assert.equal(r.success, true);
  assert.deepEqual(r.data.generalImages.map((m) => [m.publicId, m.alt, m.sortOrder]), media(25).map((m) => [m.publicId, m.alt, m.sortOrder]));
});

test('variant images keep their own limit of 12 (only product galleries moved to 25)', () => {
  const src = require('node:fs').readFileSync(path.join(SRC, 'validators', 'product.validators.js'), 'utf8');
  assert.match(src, /max\(12\)/);
});

test('audience accepted on create/update, invalid value rejected, null clears it', () => {
  const issue = (schema, audience) => (schema.safeParse({ audience }).error?.issues || []).some((i) => i.path[0] === 'audience');
  for (const a of ['men', 'women', 'unisex']) {
    assert.equal(issue(pv().createProductBody, a), false);
    assert.equal(issue(pv().updateProductBody, a), false);
  }
  assert.equal(issue(pv().updateProductBody, null), false);
  assert.equal(issue(pv().createProductBody, 'kids'), true);
});

test('Product model: audience is an enum with no default (existing products are not reclassified)', () => {
  const p = load('models', 'Product.js').schema.path('audience');
  assert.deepEqual(p.enumValues, ['men', 'women', 'unisex']);
  assert.equal(p.defaultValue, undefined);
});

test('Product document: men/women/unisex/null save cleanly, anything else fails validation, unset stays unset', () => {
  const Product = load('models', 'Product.js');
  const errs = (audience) => new Product({ name: 'x', slug: 'x', category: oid(1), audience }).validateSync()?.errors?.audience;
  for (const a of ['men', 'women', 'unisex', null, undefined]) assert.equal(errs(a), undefined, String(a));
  assert.ok(errs('kids'));
  assert.equal(new Product({ name: 'x', slug: 'x', category: oid(1) }).audience, undefined);
});
