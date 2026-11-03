'use strict';

/* Wholesale-only products stay out of every retail surface; the low-stock threshold is a fixed 10. Models stubbed. */
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-unit-test-secret-1234';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_unit_test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const load = (...p) => require(path.join(SRC, ...p));
const oid = (n) => String(n).padStart(24, '0');
const ch = load('constants', 'salesChannel.js');

/* ---------- effective channel (no migration needed for old products) ---------- */
test('a product with no salesChannel keeps its old behaviour: wholesale enabled -> both, otherwise retail', () => {
  assert.equal(ch.effectiveChannel({ wholesale: { isEnabled: true } }), 'both');
  assert.equal(ch.effectiveChannel({ wholesale: { isEnabled: false } }), 'retail');
  assert.equal(ch.effectiveChannel({}), 'retail');
  assert.equal(ch.effectiveChannel({ salesChannel: 'wholesale', wholesale: { isEnabled: true } }), 'wholesale');
  assert.equal(ch.isRetailVisible({ wholesale: { isEnabled: true } }), true); // legacy wholesale products are still in the shop
  assert.equal(ch.isRetailVisible({ salesChannel: 'wholesale' }), false);
  assert.equal(ch.isWholesaleSellable({ salesChannel: 'retail', wholesale: { isEnabled: false } }), false);
});

test('the retail filter matches legacy documents (field missing) and excludes only wholesale-only', () => {
  assert.deepEqual(ch.RETAIL_VISIBLE_FILTER, { salesChannel: { $ne: 'wholesale' } }); // $ne also matches a missing field
  assert.deepEqual(ch.channelFilter('wholesale'), { salesChannel: 'wholesale' });
});

/* ---------- product create/update keeps channel and wholesale flag consistent ---------- */
const { resolveChannel } = load('services', 'product.service.js')._internals;
const wsOn = { isEnabled: true, moq: 12 };

test('wholesale-only and both force wholesale on (MOQ required); retail forces it off', () => {
  assert.deepEqual(resolveChannel({ salesChannel: 'wholesale', wholesale: wsOn }, null), { salesChannel: 'wholesale', wholesale: wsOn });
  assert.equal(resolveChannel({ salesChannel: 'both', wholesale: wsOn }, null).wholesale.isEnabled, true);
  assert.equal(resolveChannel({ salesChannel: 'retail' }, { salesChannel: 'both', wholesale: { isEnabled: true, moq: 5 } }).wholesale.isEnabled, false);
  assert.throws(() => resolveChannel({ salesChannel: 'wholesale' }, null), (e) => e.code === 'WHOLESALE_MOQ_REQUIRED');
  assert.throws(() => resolveChannel({ salesChannel: 'wholesale', wholesale: { isEnabled: false } }, null), (e) => e.code === 'SALES_CHANNEL_CONFLICT');
  assert.throws(() => resolveChannel({ salesChannel: 'retail', wholesale: wsOn }, null), (e) => e.code === 'SALES_CHANNEL_CONFLICT');
});

test('an older admin build that only sends `wholesale` still works, but cannot strand a wholesale-only product', () => {
  assert.equal(resolveChannel({ wholesale: wsOn }, { wholesale: { isEnabled: false } }).salesChannel, 'both');
  assert.equal(resolveChannel({ wholesale: { isEnabled: false } }, { wholesale: { isEnabled: true, moq: 3 } }).salesChannel, 'retail');
  assert.throws(() => resolveChannel({ wholesale: { isEnabled: false } }, { salesChannel: 'wholesale', wholesale: { isEnabled: true, moq: 3 } }), (e) => e.code === 'SALES_CHANNEL_CONFLICT');
  assert.deepEqual(resolveChannel({ name: 'x' }, { wholesale: { isEnabled: true } }), {}); // untouched when neither is sent
});

test('product validators accept salesChannel and the admin channel filter, reject unknown values', () => {
  const pv = load('validators', 'product.validators.js');
  assert.ok(pv.createProductBody.safeParse({ name: 'Cap', category: oid(1), salesChannel: 'wholesale', wholesale: wsOn }).success);
  assert.equal(pv.createProductBody.safeParse({ name: 'Cap', category: oid(1), salesChannel: 'everyone' }).success, false);
  assert.ok(pv.updateProductBody.safeParse({ salesChannel: 'retail' }).success);
});

/* ---------- retail surfaces never return wholesale-only products ---------- */
function stubCatalog() {
  const Category = load('models', 'Category.js');
  Category.find = (q = {}) => (q.dedicatedSection ? { select: () => ({ lean: async () => [] }) } : { select: () => ({ lean: async () => [{ _id: oid(1) }] }), lean: async () => [{ _id: oid(1) }] });
  const Product = load('models', 'Product.js');
  const seen = {};
  Product.countDocuments = async (f) => { seen.count = f; return 0; };
  Product.find = (f) => { seen.filter = f; const c = { sort: () => c, skip: () => c, limit: () => c, populate: () => c, select: () => c, lean: async () => [] }; return c; };
  Product.findOne = (f) => { seen.one = f; const c = { populate: () => c, lean: async () => null }; return c; };
  load('models', 'ProductVariant.js').find = () => ({ sort: () => ({ lean: async () => [] }), lean: async () => [] });
  load('models', 'Sku.js').find = () => ({ sort: () => ({ lean: async () => [] }), lean: async () => [] });
  return seen;
}

test('retail listing, search, sorting and counts all carry the wholesale-only exclusion', async () => {
  const seen = stubCatalog();
  const svc = load('services', 'catalog.service.js');
  await svc.listProducts({ page: 1, limit: 12, sort: 'newest' });
  assert.deepEqual(seen.filter.salesChannel, { $ne: 'wholesale' });
  assert.deepEqual(seen.count.salesChannel, { $ne: 'wholesale' });
  await svc.listProducts({ page: 1, limit: 12, sort: 'newest', search: 'cap' });
  assert.deepEqual(seen.filter.salesChannel, { $ne: 'wholesale' });
  assert.ok(seen.filter.$or, 'search still applies');
  await svc.listProducts({ page: 1, limit: 12, sort: 'price_asc' });
  assert.deepEqual(seen.filter.salesChannel, { $ne: 'wholesale' });
  await svc.listProducts({ page: 1, limit: 12, sort: 'newest', newArrival: true, featured: true });
  assert.deepEqual(seen.filter.salesChannel, { $ne: 'wholesale' });
});

test('a retail product page is not served for a wholesale-only slug', async () => {
  const seen = stubCatalog();
  await assert.rejects(() => load('services', 'catalog.service.js').getProductBySlug('wholesale-cap'), (e) => e.statusCode === 404);
  assert.deepEqual(seen.one.salesChannel, { $ne: 'wholesale' });
  assert.equal(seen.one.status, 'active');
});

test('retail checkout refuses a wholesale-only SKU even if the id is sent directly; a normal product passes', async () => {
  const Sku = load('models', 'Sku.js');
  const Product = load('models', 'Product.js');
  const ProductVariant = load('models', 'ProductVariant.js');
  const chain = (rows) => { const q = { session: () => q, select: () => q, lean: async () => rows }; return q; };
  const sku = { _id: oid(10), product: oid(1), variant: oid(2), sku: 'CAP-BLK-M', price: 500, available: 20, isEnabled: true };
  const variant = { _id: oid(2), product: oid(1), isEnabled: true };
  Sku.find = () => chain([sku]);
  ProductVariant.find = () => chain([variant]);
  const { loadCheckoutItems } = load('services', 'order.service.js')._internals;
  Product.find = () => chain([{ _id: oid(1), name: 'Wholesale Cap', status: 'active', salesChannel: 'wholesale', wholesale: { isEnabled: true } }]);
  await assert.rejects(() => loadCheckoutItems([{ sku: oid(10), quantity: 1 }], null), (e) => e.code === 'ITEM_UNAVAILABLE' && /not sold in the retail store/.test(e.message));
  Product.find = () => chain([{ _id: oid(1), name: 'Tee', status: 'active', wholesale: { isEnabled: true } }]); // legacy "both"
  const ok = await loadCheckoutItems([{ sku: oid(10), quantity: 1 }], null);
  assert.equal(ok.length, 1);
});

/* ---------- fixed low-stock threshold ---------- */
test('the low-stock threshold is the single constant 10: 1..10 low, 0 out, 11+ ok', () => {
  const { LOW_STOCK_THRESHOLD } = load('constants', 'inventory.js');
  const { stockStatus } = load('utils', 'stock.js');
  assert.equal(LOW_STOCK_THRESHOLD, 10);
  assert.equal(stockStatus({ available: 11 }), 'ok');
  assert.equal(stockStatus({ available: 10 }), 'low');
  assert.equal(stockStatus({ available: 1 }), 'low');
  assert.equal(stockStatus({ available: 0 }), 'out');
  assert.equal(stockStatus({ available: -3 }), 'out');
});

test('a per-SKU threshold (legacy data / old admin build) can no longer change the status', () => {
  const { stockStatus } = load('utils', 'stock.js');
  assert.equal(stockStatus({ available: 8, lowStockThreshold: 2 }), 'low');
  assert.equal(stockStatus({ available: 40, lowStockThreshold: 100 }), 'ok');
  assert.equal(stockStatus({ available: 7, lowStockThreshold: 0 }), 'low');
});

test('SKU views report the fixed threshold, never a stored one; the old alias still points at the same constant', () => {
  const { variantView } = load('utils', 'presenter.js');
  const v = variantView({ _id: oid(2), color: { name: 'Red' }, images: [] }, [{ _id: oid(3), variant: oid(2), size: 'M', sku: 'A-M', price: 1, stock: 20, reservedStock: 0, available: 20, lowStockThreshold: 3, stockStatus: 'ok', isEnabled: true }]);
  assert.equal(v.sizes[0].lowStockThreshold, 10);
  assert.equal(load('constants', 'inventory.js').DEFAULT_LOW_STOCK_THRESHOLD, 10);
});

test('no source file hard-codes its own low-stock number (threshold lives only in constants/inventory.js)', () => {
  const fs = require('node:fs');
  const hits = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!p.endsWith('.js') || p.endsWith(path.join('constants', 'inventory.js'))) return;
    const src = fs.readFileSync(p, 'utf8');
    if (/(lowStockThreshold|LOW_STOCK_THRESHOLD)\s*(=|:|\?\?)\s*\d/.test(src)) hits.push(path.relative(SRC, p));
  });
  walk(SRC);
  assert.deepEqual(hits, []);
});
