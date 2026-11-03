'use strict';

/*
 * Flexible Ready Packs: a 200-piece pack offered in 25 colours x 3 sizes (one product is WHOLESALE-ONLY). The buyer picks any
 * colours/sizes that add up to exactly 200 and the BACKEND re-validates it on preview and on request. Models are stubbed.
 */
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
const chain = (rows) => { const q = { sort: () => q, select: () => q, limit: () => q, session: () => q, lean: async () => rows }; return q; };

// Request numbering and post-commit notifications are not under test here.
load('services', 'wholesaleNumber.service.js').nextWholesaleRequestNumber = async () => 'WH-000001';
load('services', 'adminNotificationEvents.service.js').newWholesaleRequest = async () => {};
load('services', 'whatsapp', 'events.js').requestSubmitted = async () => {};
const mongoose = require('mongoose');
mongoose.startSession = async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} });

const COLORS = 25;
const SIZES = ['S', 'M', 'L'];
let db;

/** 25 colours x 3 sizes of a wholesale-only product (salesChannel "wholesale"), plus one retail+wholesale product with 2 SKUs. */
function fixture({ packPrice, tiers = [] } = {}) {
  const Sku = load('models', 'Sku.js');
  const Product = load('models', 'Product.js');
  const ProductVariant = load('models', 'ProductVariant.js');
  const StoreSettings = load('models', 'StoreSettings.js');
  const Wholesale = load('models', 'Wholesale.js');

  const wsOnly = { _id: oid(1), name: 'Wholesale Tee', slug: 'wholesale-tee', status: 'active', salesChannel: 'wholesale', wholesale: { isEnabled: true, moq: 50, tiers } };
  const both = { _id: oid(2), name: 'Retail Tee', slug: 'retail-tee', status: 'active', wholesale: { isEnabled: true, moq: 40 } };
  const variants = []; const skus = [];
  for (let c = 0; c < COLORS; c += 1) {
    const vid = oid(100 + c);
    variants.push({ _id: vid, product: wsOnly._id, color: { name: `Colour ${c + 1}`, hexCode: '#112233' }, images: [{ url: `c${c}.jpg` }], isEnabled: true });
    SIZES.forEach((size, s) => skus.push({ _id: oid(1000 + c * 3 + s), product: wsOnly._id, variant: vid, sku: `WT-${c + 1}-${size}`, size, wholesalePrice: 1000, price: 1800, available: 40, isEnabled: true }));
  }
  variants.push({ _id: oid(300), product: both._id, color: { name: 'Black' }, images: [], isEnabled: true });
  ['M', 'L'].forEach((size, s) => skus.push({ _id: oid(2000 + s), product: both._id, variant: oid(300), sku: `RT-BLK-${size}`, size, wholesalePrice: 1200, price: 2000, available: 30, isEnabled: true }));

  const ids = (q) => q?._id?.$in?.map(String);
  Product.find = (q) => chain([wsOnly, both].filter((p) => !ids(q) || ids(q).includes(String(p._id))));
  ProductVariant.find = (q) => chain(variants.filter((v) => !ids(q) || ids(q).includes(String(v._id))));
  Sku.find = (q) => chain(skus.filter((s) => !ids(q) || ids(q).includes(String(s._id))));
  StoreSettings.findOneAndUpdate = () => ({ lean: async () => ({ key: 'default' }) });

  const pool = skus.map((s) => ({ product: s.product, variant: s.variant, sku: s._id, quantity: 1 }));
  const pack = { _id: oid(900), documentType: 'pack', name: '200 Tee Pack', slug: '200-tee-pack', isActive: true, selectionMode: 'flexible', packSize: 200, ...(packPrice ? { packPrice } : {}), items: pool };
  const created = [];
  Wholesale.findOne = () => { const q = { session: () => q, lean: async () => pack, then: (res, rej) => Promise.resolve(pack).then(res, rej) }; return q; };
  Wholesale.exists = async () => null;
  Wholesale.create = async (docs) => { const arr = Array.isArray(docs) ? docs : [docs]; created.push(...arr); const w = arr.map((d) => ({ ...d, toObject: () => d })); return Array.isArray(docs) ? w : w[0]; };
  db = { skus, pack, created, variants };
  return db;
}
const svc = () => load('services', 'wholesale.service.js');
const CUSTOMER = { name: 'Bilal', email: 'bilal@example.com', phone: '03001234567' };
const sel = (...pairs) => pairs.map(([i, quantity]) => ({ sku: db.skus[i]._id, quantity }));

test('a 200-piece pack is presented with every colour/size, capped stock and no prices for guests', async () => {
  fixture();
  const v = await svc().presentPack(db.pack);
  assert.equal(v.computed.available, true);
  assert.equal(v.computed.selectionMode, 'flexible');
  assert.equal(v.computed.packSize, 200);
  assert.equal(v.totalPieces, 200);
  assert.equal(v.items.length, COLORS * 3 + 2); // wholesale-only product AND the retail product are both in the pool
  assert.equal(v.computed.colors, COLORS + 1);
  assert.ok(v.items.every((i) => i.maxQuantity <= 40 && i.maxQuantity <= 200 && i.inStock));
  assert.deepEqual([v.computed.perPieceMin, v.computed.perPieceMax], [1000, 1200]);
  const guest = svc().redactPackPricing(v);
  assert.equal(guest.computed.pricingHidden, true);
  assert.equal(guest.computed.perPieceMin, undefined);
  assert.ok(guest.items.every((i) => i.wholesalePrice === undefined));
  assert.ok(v.items.every((i) => i.wholesalePrice > 0));
});

test('sold-out, disabled and unpublished SKUs are not offered; a pack that can no longer fill its size is hidden', async () => {
  fixture();
  db.skus[0].available = 0;                       // sold out -> shown as unavailable (maxQuantity 0)
  db.skus[1].isEnabled = false;                   // disabled -> not offered
  const v = await svc().presentPack(db.pack);
  assert.equal(v.items.find((i) => String(i.sku) === db.skus[0]._id).maxQuantity, 0);
  assert.equal(v.items.find((i) => String(i.sku) === db.skus[0]._id).inStock, false);
  assert.equal(v.items.some((i) => String(i.sku) === db.skus[1]._id), false);
  db.skus.forEach((s) => { s.available = 2; });   // total stock < 200
  const low = await svc().presentPack(db.pack);
  assert.equal(low.computed.available, false);
  assert.equal(low.computed.reason, 'PACK_INSUFFICIENT_STOCK');
});

test('exactly 200 pieces over a few chosen colours/sizes is accepted and priced by the backend', async () => {
  fixture();
  // 3 colours of the wholesale-only product (40+40+40) + 1 colour of the retail product (30+30) + 20 more = 200 exactly
  const r = await svc().previewItems(sel([0, 40], [1, 40], [2, 40], [3, 40], [75, 30], [76, 10]), { packId: db.pack._id });
  assert.equal(r.units, 200);
  assert.deepEqual(r.pack, { selectionMode: 'flexible', packSize: 200, selected: 200, remaining: 0, complete: true });
  assert.equal(r.moqMet, true); // per-product MOQ (50 / 40) does not apply inside a flexible pack
  assert.equal(r.pricing.subtotal, 160 * 1000 + 40 * 1200);
});

test('199 is reported incomplete (not priced as a pack); 201 and a foreign SKU are rejected', async () => {
  fixture();
  const short = await svc().previewItems(sel([0, 40], [1, 40], [2, 40], [3, 40], [75, 30], [76, 9]), { packId: db.pack._id });
  assert.equal(short.pack.selected, 199);
  assert.equal(short.pack.remaining, 1);
  assert.equal(short.pack.complete, false);
  await assert.rejects(() => svc().previewItems(sel([0, 40], [1, 40], [2, 40], [3, 40], [75, 30], [76, 11]), { packId: db.pack._id }), (e) => e.code === 'PACK_QUANTITY_MISMATCH' && e.statusCode === 400 && /1 too many/.test(e.message));
  const stranger = { _id: oid(5000), product: oid(1), variant: oid(100), sku: 'X', size: 'S', wholesalePrice: 1, available: 99, isEnabled: true };
  db.skus.push(stranger);
  await assert.rejects(() => svc().previewItems([{ sku: stranger._id, quantity: 200 }], { packId: db.pack._id }), (e) => e.code === 'SKU_NOT_IN_PACK');
  await assert.rejects(() => svc().previewItems([{ sku: db.skus[0]._id, quantity: 5 }, { sku: db.skus[0]._id, quantity: 5 }], { packId: db.pack._id }), (e) => e.code === 'DUPLICATE_WHOLESALE_SKU');
  await assert.rejects(() => svc().previewItems([], { packId: db.pack._id }), (e) => e.code === 'PACK_SELECTION_REQUIRED');
});

test('insufficient stock, a disabled SKU, an unpublished product and a disabled colour are rejected by the backend', async () => {
  fixture();
  db.skus[0].available = 5;
  await assert.rejects(() => svc().previewItems(sel([0, 6], [1, 40], [2, 40], [3, 40], [4, 40], [5, 34]), { packId: db.pack._id }), (e) => e.code === 'INSUFFICIENT_STOCK' && e.statusCode === 409 && /Only 5/.test(e.message));
  fixture(); db.skus[0].isEnabled = false;
  await assert.rejects(() => svc().previewItems(sel([0, 10]), { packId: db.pack._id }), (e) => e.code === 'WHOLESALE_SKU_DISABLED');
  fixture(); load('models', 'Product.js').find = () => chain([{ _id: oid(1), name: 'Wholesale Tee', status: 'draft', salesChannel: 'wholesale', wholesale: { isEnabled: true, moq: 50 } }]);
  await assert.rejects(() => svc().previewItems(sel([0, 10]), { packId: db.pack._id }), (e) => e.code === 'PRODUCT_NOT_ACTIVE');
  fixture(); db.variants[0].isEnabled = false;
  await assert.rejects(() => svc().previewItems(sel([0, 10]), { packId: db.pack._id }), (e) => e.code === 'WHOLESALE_VARIANT_DISABLED');
});

test('requesting the pack keeps ONE request with each SKU and quantity; the backend refuses 199, 201 and stock the SKU does not have', async () => {
  fixture();
  const exact = sel([0, 40], [1, 40], [2, 40], [3, 40], [75, 30], [76, 10]);
  const req = await svc().createPackRequest({ packId: db.pack._id, userId: oid(7), customer: CUSTOMER, selections: exact });
  assert.equal(db.created.length, 1);
  assert.equal(req.requestType, 'ready_pack');
  assert.equal(String(req.sourcePack), db.pack._id);
  assert.equal(req.requestedVolume, 200);
  assert.deepEqual(req.items.map((i) => [String(i.sku), i.quantity]), exact.map((s) => [s.sku, s.quantity])); // per-SKU quantities preserved
  assert.ok(req.items.every((i) => i.wholesalePrice > 0 && i.skuCode && i.colorName));
  assert.equal(req.pricing.subtotal, 160 * 1000 + 40 * 1200);

  const before = db.created.length;
  const mk = (extra) => svc().createPackRequest({ packId: db.pack._id, customer: CUSTOMER, selections: sel([0, 40], [1, 40], [2, 40], [3, 40], [75, 30], [76, 10 + extra]) });
  await assert.rejects(() => mk(-1), (e) => e.code === 'PACK_QUANTITY_MISMATCH' && /1 left to choose/.test(e.message)); // 199
  await assert.rejects(() => mk(1), (e) => e.code === 'PACK_QUANTITY_MISMATCH' && /1 too many/.test(e.message));     // 201
  await assert.rejects(() => svc().createPackRequest({ packId: db.pack._id, customer: CUSTOMER }), (e) => e.code === 'PACK_SELECTION_REQUIRED');
  db.skus[0].available = 39;
  await assert.rejects(() => svc().createPackRequest({ packId: db.pack._id, customer: CUSTOMER, selections: exact }), (e) => e.code === 'INSUFFICIENT_STOCK');
  assert.equal(db.created.length, before, 'nothing is written when the selection is invalid');
});

test('a fixed pack price applies to the complete flexible pack whatever colours were chosen', async () => {
  fixture({ packPrice: 150000 });
  const req = await svc().createPackRequest({ packId: db.pack._id, customer: CUSTOMER, selections: sel([0, 40], [1, 40], [2, 40], [3, 40], [75, 30], [76, 10]) });
  assert.equal(req.pricing.subtotal, 150000);
  assert.equal(Math.round(req.items.reduce((n, i) => n + i.lineTotal, 0) * 100) / 100, 150000);
  const partial = await svc().previewItems(sel([0, 40]), { packId: db.pack._id });
  assert.equal(partial.pricing.subtotal, 40000); // an incomplete selection is never scaled up to the pack price
});

test('a fixed (classic) pack still works unchanged and cannot be customised', async () => {
  const { skus, pack } = fixture();
  pack.selectionMode = undefined; pack.packSize = undefined;
  pack.items = [{ sku: skus[0]._id, quantity: 20 }, { sku: skus[1]._id, quantity: 30 }];
  const r = await svc().previewItems([], { packId: pack._id });
  assert.equal(r.units, 50);
  assert.equal(r.pack, undefined);
  await assert.rejects(() => svc().previewItems([{ sku: skus[0]._id, quantity: 50 }], { packId: pack._id }), (e) => e.code === 'PACK_NOT_CUSTOMISABLE');
  await assert.rejects(() => svc().createPackRequest({ packId: pack._id, customer: CUSTOMER, selections: [{ sku: skus[0]._id, quantity: 50 }] }), (e) => e.code === 'PACK_NOT_CUSTOMISABLE');
  const req = await svc().createPackRequest({ packId: pack._id, customer: CUSTOMER });
  assert.equal(req.requestedVolume, 50);
});

test('admin can create a flexible pack from retail and wholesale-only products; rules are enforced', async () => {
  const { skus, created } = fixture();
  const base = { name: '200 Pack', slug: 'two-hundred', isActive: true, sortOrder: 0, isFeatured: false };
  const p = await svc().createPack({ ...base, selectionMode: 'flexible', packSize: 200, items: [{ sku: skus[0]._id }, { sku: skus[3]._id }, { sku: skus[75]._id }].map((i) => ({ ...i, quantity: 1 })) });
  assert.equal(p.selectionMode, 'flexible');
  assert.equal(p.packSize, 200);
  assert.equal(created.length, 1);
  assert.equal(created[0].colorProduct, undefined); // legacy/no wizard product: nothing recorded
  assert.deepEqual(p.items.map((i) => i.quantity), [1, 1, 1]);
  assert.deepEqual(p.items.map((i) => String(i.product)), [oid(1), oid(1), oid(2)]); // wholesale-only + retail product in one pack
  await assert.rejects(() => svc().createPack({ ...base, selectionMode: 'flexible', items: [{ sku: skus[0]._id, quantity: 1 }] }), (e) => e.code === 'PACK_SIZE_REQUIRED');
  load('models', 'Product.js').find = () => chain([{ _id: oid(1), name: 'Ladies Shoe', status: 'active', wholesale: { isEnabled: false } }]);
  await assert.rejects(() => svc().createPack({ ...base, selectionMode: 'flexible', packSize: 50, items: [{ sku: skus[0]._id, quantity: 1 }] }), (e) => e.code === 'PRODUCT_NOT_WHOLESALE_ENABLED');
});

test('validators: flexible packs need a pack size; quantity is optional for a pool; fixed packs still need theirs', () => {
  const v = load('validators', 'wholesale.validators.js');
  const item = { sku: oid(5) };
  assert.ok(v.createPackBody.safeParse({ name: 'Big', slug: 'big', selectionMode: 'flexible', packSize: 200, items: [item] }).success);
  assert.equal(v.createPackBody.safeParse({ name: 'Big', slug: 'big', selectionMode: 'flexible', items: [item] }).success, false);
  assert.equal(v.createPackBody.safeParse({ name: 'Big', slug: 'big', selectionMode: 'flexible', packSize: 0, items: [item] }).success, false);
  assert.equal(v.createPackBody.parse({ name: 'Old', slug: 'old', items: [{ sku: oid(5), quantity: 10 }] }).selectionMode, 'fixed'); // old payloads unchanged
  assert.ok(v.updatePackBody.safeParse({ packSize: 120 }).success);
  assert.ok(v.createPackRequestBody.safeParse({ customer: CUSTOMER, selections: [{ sku: oid(5), quantity: 3 }] }).success);
  assert.equal(v.createPackRequestBody.safeParse({ customer: CUSTOMER, selections: [{ sku: oid(5), quantity: 0 }] }).success, false);
  assert.equal(v.createPackRequestBody.safeParse({ customer: CUSTOMER, selections: [{ sku: oid(5), quantity: 1.5 }] }).success, false);
});

test('inventory is deducted from the exact SKUs chosen: the quote conversion reserves each request line by SKU', () => {
  // Existing, unchanged workflow: request -> quote -> accepted -> convertQuoteToOrder reserves stock per SKU line.
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(SRC, 'services', 'quote.service.js'), 'utf8');
  assert.match(src, /stockReservation\.reserveSku\(\s*skuId,\s*quantity,\s*session/);
  assert.match(src, /lines\.set\(\s*key,\s*\(lines\.get\(key\) \|\| 0\) \+\s*Number\(item\.quantity\)/);
});

test('a flexible pack remembers the wholesale-only product holding its own colours/SKUs (colorProduct)', async () => {
  const { skus, created } = fixture();
  const base = { name: 'Wizard Pack', slug: 'wizard-pack', isActive: true, sortOrder: 0, isFeatured: false };
  await svc().createPack({ ...base, selectionMode: 'flexible', packSize: 100, colorProduct: oid(1), items: [{ sku: skus[0]._id, quantity: 1 }] });
  assert.equal(String(created[0].colorProduct), String(oid(1)));
});
