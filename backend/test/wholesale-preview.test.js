'use strict';

/* Wholesale: volume tiers, MOQ reporting, merchant-configured freight/tax, catalog. Models stubbed. */
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

function fixture({ tiers = [], moq = 10, settings = {}, wholesalePrice = 1000 } = {}) {
  const Sku = load('models', 'Sku.js');
  const Product = load('models', 'Product.js');
  const ProductVariant = load('models', 'ProductVariant.js');
  const StoreSettings = load('models', 'StoreSettings.js');
  const product = { _id: oid(1), name: 'Polo', slug: 'polo', status: 'active', generalImages: [{ url: 'p.jpg' }], wholesale: { isEnabled: true, moq, tiers } };
  const variant = { _id: oid(2), product: oid(1), color: { name: 'Navy', hexCode: '#001f3f' }, images: [{ url: 'v.jpg' }], isEnabled: true };
  const skus = ['M', 'L'].map((size, i) => ({ _id: oid(10 + i), product: oid(1), variant: oid(2), sku: `P-NVY-${size}`, size, wholesalePrice, available: 50, isEnabled: true }));
  Product.find = () => chain([product]);
  ProductVariant.find = () => chain([variant]);
  Sku.find = (q) => chain(q?._id?.$in ? skus.filter((s) => q._id.$in.map(String).includes(String(s._id))) : skus);
  StoreSettings.findOneAndUpdate = () => ({ lean: async () => ({ key: 'default', ...settings }) });
  return { skus };
}
const svc = () => load('services', 'wholesale.service.js');

test('preview reports MOQ status instead of throwing, and totals come from the backend', async () => {
  const { skus } = fixture({ moq: 10 });
  const r = await svc().previewItems([{ sku: skus[0]._id, quantity: 4 }, { sku: skus[1]._id, quantity: 3 }]);
  assert.equal(r.units, 7);
  assert.equal(r.moqMet, false);
  assert.equal(r.products[0].moqShortfall, 3);
  assert.equal(r.pricing.subtotal, 7000);
  const ok = await svc().previewItems([{ sku: skus[0]._id, quantity: 6 }, { sku: skus[1]._id, quantity: 4 }]);
  assert.equal(ok.moqMet, true);
});

test('creating a request still enforces MOQ in the backend', async () => {
  const { skus } = fixture({ moq: 10 });
  await assert.rejects(() => svc().buildValidatedItems([{ sku: skus[0]._id, quantity: 4 }]), (e) => e.code === 'WHOLESALE_MOQ_NOT_MET');
});

test('volume tiers lower the unit price by the combined product quantity', async () => {
  const tiers = [{ minQuantity: 20, discountPercent: 5 }, { minQuantity: 50, discountPercent: 10 }];
  const { skus } = fixture({ tiers, moq: 10 });
  const mid = await svc().previewItems([{ sku: skus[0]._id, quantity: 12 }, { sku: skus[1]._id, quantity: 10 }]); // 22 -> 5%
  assert.equal(mid.items[0].wholesalePrice, 950);
  assert.equal(mid.items[0].baseWholesalePrice, 1000);
  assert.equal(mid.pricing.subtotal, 950 * 22);
  const top = await svc().previewItems([{ sku: skus[0]._id, quantity: 30 }, { sku: skus[1]._id, quantity: 25 }]); // 55 -> 10%
  assert.equal(top.items[0].wholesalePrice, 900);
  const low = await svc().previewItems([{ sku: skus[0]._id, quantity: 10 }]);
  assert.equal(low.items[0].wholesalePrice, 1000);
  assert.equal(low.items[0].tierDiscountPercent, undefined);
});

test('freight and tax are only added when the merchant configured them; otherwise pending', async () => {
  const { skus } = fixture();
  const none = await svc().previewItems([{ sku: skus[0]._id, quantity: 10 }]);
  assert.deepEqual(none.pricing.pending, ['freight', 'tax']);
  assert.equal(none.pricing.freight, undefined);
  assert.equal(none.pricing.estimatedTotal, 10000);
  fixture({ settings: { wholesale: { freightFlat: 500, taxPercent: 10 } } });
  const set = await svc().previewItems([{ sku: skus[0]._id, quantity: 10 }]);
  assert.equal(set.pricing.freight, 500);
  assert.equal(set.pricing.tax, 1000);
  assert.equal(set.pricing.estimatedTotal, 11500);
  assert.deepEqual(set.pricing.pending, []);
});

test('catalog exposes wholesale prices, MOQ, tiers and a boolean availability - never stock counts', async () => {
  fixture({ tiers: [{ minQuantity: 20, discountPercent: 5 }] });
  const [p] = await svc().listWholesaleCatalog();
  assert.equal(p.moq, 10);
  assert.deepEqual(p.tiers, [{ minQuantity: 20, discountPercent: 5, quoteOnly: false, unitPrice: 950 }]);
  assert.equal(p.variants[0].sizes[0].wholesalePrice, 1000);
  assert.equal(p.variants[0].sizes[0].inStock, true);
  const blob = JSON.stringify(p);
  assert.ok(!blob.includes('available') && !blob.includes('reservedStock') && !blob.includes('"stock"'));
});

test('product validator accepts well-formed tiers and rejects unordered ones', () => {
  const { updateProductBody, createProductBody } = load('validators', 'product.validators.js');
  const schema = updateProductBody || createProductBody;
  const w = (tiers) => schema.safeParse({ wholesale: { isEnabled: true, moq: 10, tiers } });
  assert.equal(w([{ minQuantity: 20, discountPercent: 5 }, { minQuantity: 50, discountPercent: 8 }]).success, true);
  assert.equal(w([{ minQuantity: 50, discountPercent: 5 }, { minQuantity: 20, discountPercent: 8 }]).success, false);
  assert.equal(w([{ minQuantity: 20, discountPercent: 95 }]).success, false);
});

test('preview + catalog routes require authentication', () => {
  const router = load('routes', 'wholesale.routes.js');
  const find = (p, m) => router.stack.find((l) => l.route?.path === p && l.route.methods[m]);
  for (const [p, m] of [['/catalog', 'get'], ['/preview', 'post']]) {
    const layer = find(p, m);
    assert.ok(layer, `${m} ${p} exists`);
    const { authenticate } = load('middleware', 'auth.js');
    assert.ok(layer.route.stack.some((h) => h.handle === authenticate), `${p} uses authenticate`);
  }
});
