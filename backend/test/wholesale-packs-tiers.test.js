'use strict';

/* Wholesale: flat/quote-only tiers, allocation contract, admin-managed Ready Pack presentation. Models stubbed. */
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
const chain = (rows) => { const q = { sort: () => q, select: () => q, limit: () => q, session: () => q, lean: async () => rows }; return q; };
const oid = (n) => String(n).padStart(24, '0');

function fixture({ tiers = [], moq = 10 } = {}) {
  const Sku = load('models', 'Sku.js');
  const Product = load('models', 'Product.js');
  const ProductVariant = load('models', 'ProductVariant.js');
  const StoreSettings = load('models', 'StoreSettings.js');
  const product = { _id: oid(1), name: 'Tee', slug: 'tee', status: 'active', wholesale: { isEnabled: true, moq, tiers } };
  const variants = [
    { _id: oid(2), product: oid(1), color: { name: 'Black' }, isEnabled: true },
    { _id: oid(3), product: oid(1), color: { name: 'Sand' }, isEnabled: true },
  ];
  const skus = [];
  variants.forEach((v, vi) => ['S', 'M'].forEach((size, si) => skus.push({ _id: oid(10 + vi * 2 + si), product: oid(1), variant: v._id, sku: `T-${vi}-${size}`, size, wholesalePrice: 1000, price: 1500, available: 50, isEnabled: true })));
  Product.find = () => chain([product]);
  ProductVariant.find = () => chain(variants);
  Sku.find = (q) => chain(q?._id?.$in ? skus.filter((s) => q._id.$in.map(String).includes(String(s._id))) : skus);
  StoreSettings.findOneAndUpdate = () => ({ lean: async () => ({ key: 'default' }) });
  return { skus };
}
const svc = () => load('services', 'wholesale.service.js');

test('a flat unitPrice tier replaces the SKU price; a discount tier still works', async () => {
  const { skus } = fixture({ tiers: [{ minQuantity: 10, unitPrice: 900 }, { minQuantity: 25, discountPercent: 20 }] });
  const a = await svc().previewItems([{ sku: skus[0]._id, quantity: 12 }]);
  assert.equal(a.items[0].wholesalePrice, 900);
  assert.equal(a.pricing.subtotal, 10800);
  const b = await svc().previewItems([{ sku: skus[0]._id, quantity: 26 }]);
  assert.equal(b.items[0].wholesalePrice, 800);
});

test('a quote-only tier is flagged and priced at the best priced tier below it', async () => {
  const { skus } = fixture({ tiers: [{ minQuantity: 10, unitPrice: 900 }, { minQuantity: 100, quoteOnly: true }] });
  const r = await svc().previewItems([{ sku: skus[0]._id, quantity: 60 }, { sku: skus[1]._id, quantity: 50 }]);
  assert.equal(r.quoteRequired, true);
  assert.equal(r.items[0].wholesalePrice, 900);
  assert.equal(r.items[0]._quoteOnly, undefined);
  const below = await svc().previewItems([{ sku: skus[0]._id, quantity: 20 }]);
  assert.equal(below.quoteRequired, false);
});

test('catalog tier matrix carries base price, retail comparison and computed tier prices', async () => {
  fixture({ tiers: [{ minQuantity: 10, discountPercent: 10 }, { minQuantity: 100, quoteOnly: true }] });
  const [p] = await svc().listWholesaleCatalog();
  assert.equal(p.basePrice, 1000);
  assert.equal(p.retailPrice, 1500);
  assert.equal(p.tiers[0].unitPrice, 900);
  assert.equal(p.tiers[1].quoteOnly, true);
  assert.equal(p.tiers[1].unitPrice, null);
});

test('allocation must equal the ordered quantity - reported in preview, enforced on create', async () => {
  const { skus } = fixture({ moq: 1 });
  const bad = await svc().previewItems([{ sku: skus[0]._id, quantity: 3 }, { sku: skus[1]._id, quantity: 4 }], { ordered: [{ product: oid(1), ordered: 10 }] });
  assert.equal(bad.allocation.matched, false);
  assert.equal(bad.allocation.mismatches[0].remaining, 3);
  const over = await svc().previewItems([{ sku: skus[0]._id, quantity: 8 }, { sku: skus[1]._id, quantity: 4 }], { ordered: [{ product: oid(1), ordered: 10 }] });
  assert.equal(over.allocation.mismatches[0].remaining, -2);
  const ok = await svc().previewItems([{ sku: skus[0]._id, quantity: 6 }, { sku: skus[1]._id, quantity: 4 }], { ordered: [{ product: oid(1), ordered: 10 }] });
  assert.equal(ok.allocation.matched, true);
  assert.equal(svc().checkAllocation([{ product: oid(1), quantity: 5 }], [{ product: oid(1), ordered: 5 }]).mismatches.length, 0);
});

test('createCustomRequest rejects a short/over allocation before writing anything', async () => {
  const { skus } = fixture({ moq: 1 });
  const mongoose = require('mongoose');
  mongoose.startSession = async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} });
  await assert.rejects(
    () => svc().createCustomRequest({ customer: { name: 'A', email: 'a@b.co', phone: '03001234567' }, items: [{ sku: skus[0]._id, quantity: 3 }], ordered: [{ product: oid(1), ordered: 5 }] }),
    (e) => e.code === 'ALLOCATION_MISMATCH' && e.statusCode === 400,
  );
});

test('Ready Pack presentation is computed from live backend data (totals, assortment, size curve, per piece)', async () => {
  const { skus } = fixture({ moq: 1 });
  const pack = { _id: oid(99), name: 'Tee Pack', slug: 'tee-pack', items: [
    { sku: skus[0]._id, quantity: 10 }, { sku: skus[1]._id, quantity: 15 }, { sku: skus[2]._id, quantity: 25 } ] };
  const v = await svc().presentPack(pack);
  assert.equal(v.totalPieces, 50);
  assert.equal(v.computed.calculatedPrice, 50000);
  assert.equal(v.computed.packPrice, 50000);
  assert.equal(v.computed.perPiece, 1000);
  assert.deepEqual(v.computed.assortment.map((a) => [a.colorName, a.quantity]), [['Black', 25], ['Sand', 25]]);
  assert.deepEqual(v.computed.sizeCurve.map((a) => [a.size, a.quantity]), [['S', 35], ['M', 15]]);
  const fixed = await svc().presentPack({ ...pack, packPrice: 45000 });
  assert.equal(fixed.computed.packPrice, 45000);
  assert.equal(fixed.computed.perPiece, 900);
  const sum = svc().repriceToPack((await svc().previewItems(pack.items.map((i) => ({ sku: i.sku, quantity: i.quantity })))).items, 45000);
  assert.equal(Math.round(sum.reduce((n, i) => n + i.lineTotal, 0) * 100) / 100, 45000);
});

test('a pack whose SKU is no longer wholesale-eligible is reported unavailable, not priced', async () => {
  const { skus } = fixture();
  const Product = load('models', 'Product.js');
  Product.find = () => chain([{ _id: oid(1), name: 'Tee', wholesale: { isEnabled: false } }]);
  const v = await svc().presentPack({ _id: oid(99), items: [{ sku: skus[0]._id, quantity: 10 }] });
  assert.equal(v.computed.available, false);
});

test('validators: pack extras, tier shapes and the preview contract', () => {
  const v = load('validators', 'wholesale.validators.js');
  const pv = load('validators', 'product.validators.js');
  const pack = { name: 'Starter', slug: 'starter', items: [{ sku: oid(5), quantity: 10 }], badge: 'Best value', packPrice: 5000, moq: 1, dispatchText: '24h', isFeatured: true };
  assert.ok(v.createPackBody.safeParse(pack).success);
  assert.ok(v.updatePackBody.safeParse({ packPrice: null }).success);
  assert.equal(v.createPackBody.safeParse({ ...pack, packPrice: -1 }).success, false);
  assert.ok(v.previewBody.safeParse({ packId: oid(9) }).success);
  assert.equal(v.previewBody.safeParse({ packId: oid(9), items: [{ sku: oid(5), quantity: 1 }] }).success, false);
  assert.equal(v.previewBody.safeParse({}).success, false);
  const W = (tiers) => !(pv.createProductBody.safeParse({ wholesale: { isEnabled: true, moq: 10, tiers } }).error?.issues || []).some((i) => i.path[0] === 'wholesale');
  assert.ok(W([{ minQuantity: 10, unitPrice: 900 }, { minQuantity: 25, unitPrice: 850 }, { minQuantity: 100, quoteOnly: true }]));
  assert.equal(W([{ minQuantity: 10, unitPrice: 900, discountPercent: 5 }]), false); // one pricing mode per tier
  assert.equal(W([{ minQuantity: 10 }]), false);
  assert.equal(W([{ minQuantity: 10, unitPrice: 800 }, { minQuantity: 25, unitPrice: 900 }]), false); // price must not rise
  assert.equal(W([{ minQuantity: 25, discountPercent: 5 }, { minQuantity: 10, discountPercent: 8 }]), false);
});

test('guests never receive pack prices; signed-in buyers do', async () => {
  const { skus } = fixture({ moq: 1 });
  const v = await svc().presentPack({ _id: oid(99), packPrice: 9000, compareAtValue: 15000, items: [{ sku: skus[0]._id, quantity: 10 }] });
  const g = svc().redactPackPricing(v);
  assert.equal(g.computed.pricingHidden, true);
  assert.equal(g.packPrice, undefined);
  assert.equal(g.compareAtValue, undefined);
  assert.equal(g.computed.perPiece, undefined);
  assert.equal(g.computed.calculatedPrice, undefined);
  assert.equal(g.computed.totalPieces, 10);
  assert.ok(g.computed.assortment.length);
  assert.equal(v.computed.packPrice, 9000);
});
