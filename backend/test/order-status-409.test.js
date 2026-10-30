'use strict';

/* 409s from PATCH /admin/orders/:id/status must say WHY. Guards are not relaxed: same 409 + same codes. Models stubbed (no MongoDB). */
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.JWT_SECRET = 'unit-test-secret-unit-test-secret-1234';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_unit_test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const load = (...p) => require(path.join(SRC, ...p));
const ApiError = load('utils', 'ApiError.js');
const reservation = load('services', 'stockReservation.service.js');
const Sku = load('models', 'Sku.js');
const lifecycle = load('services', 'orderLifecycle.service.js');
const { ORDER_STATUS_TRANSITIONS, canTransitionOrderStatus } = load('constants', 'Order.js');

const order = () => ({ orderType: 'retail', items: [{ sku: 'a'.repeat(24), quantity: 3 }] });
const skuDoc = (d) => { Sku.findById = () => ({ session: () => ({ select: () => ({ lean: async () => d }) }) }); };

test('ship: not enough reserved stock => same 409/INVALID_STOCK_COMMIT but with SKU, numbers and the fix', async () => {
  reservation.commitSku = async () => { throw ApiError.conflict('Unable to commit reserved stock', 'INVALID_STOCK_COMMIT'); };
  skuDoc({ sku: 'TEE-BLK-M', stock: 10, reservedStock: 1 });
  const o = order();
  await assert.rejects(() => lifecycle.commitOrderStock(o, {}), (e) => {
    assert.equal(e.statusCode, 409);
    assert.equal(e.code, 'INVALID_STOCK_COMMIT');
    assert.match(e.message, /TEE-BLK-M/);
    assert.match(e.message, /needs 3/);
    assert.match(e.message, /10 in stock, 1 reserved/);
    assert.match(e.message, /Inventory/);
    return true;
  });
  assert.equal(o.stockCommittedAt, undefined, 'stock is not marked committed on refusal');
});

test('ship: not enough physical stock gets a different reason', async () => {
  reservation.commitSku = async () => { throw ApiError.conflict('Unable to commit reserved stock', 'INVALID_STOCK_COMMIT'); };
  skuDoc({ sku: 'TEE-BLK-M', stock: 2, reservedStock: 5 });
  await assert.rejects(() => lifecycle.commitOrderStock(order(), {}), /less physical stock/);
});

test('cancel: reservation missing => explained 409/INVALID_STOCK_RELEASE', async () => {
  reservation.releaseSku = async () => { throw ApiError.conflict('Unable to release reserved stock', 'INVALID_STOCK_RELEASE'); };
  skuDoc({ sku: 'TEE-BLK-M', stock: 10, reservedStock: 0 });
  await assert.rejects(() => lifecycle.releaseOrderStock(order(), {}), (e) => e.statusCode === 409 && e.code === 'INVALID_STOCK_RELEASE' && /TEE-BLK-M/.test(e.message));
});

test('lookup failure or unrelated errors are never masked', async () => {
  reservation.commitSku = async () => { throw ApiError.conflict('Unable to commit reserved stock', 'INVALID_STOCK_COMMIT'); };
  Sku.findById = () => { throw new Error('db down'); };
  await assert.rejects(() => lifecycle.commitOrderStock(order(), {}), (e) => e.code === 'INVALID_STOCK_COMMIT' && e.message === 'Unable to commit reserved stock');
  reservation.commitSku = async () => { throw new Error('boom'); };
  await assert.rejects(() => lifecycle.commitOrderStock(order(), {}), /boom/);
});

test('a successful commit still marks the order committed (no behaviour change)', async () => {
  reservation.commitSku = async () => ({});
  const o = order();
  await lifecycle.commitOrderStock(o, {});
  assert.ok(o.stockCommittedAt instanceof Date);
});

test('transition table: valid vs invalid (the other 409s already carry clear messages)', () => {
  assert.deepEqual(ORDER_STATUS_TRANSITIONS.pending, ['confirmed', 'cancelled']);
  assert.ok(canTransitionOrderStatus('processing', 'shipped'));
  assert.ok(!canTransitionOrderStatus('pending', 'shipped'));
  assert.ok(!canTransitionOrderStatus('shipped', 'cancelled'));
  assert.ok(!canTransitionOrderStatus('delivered', 'pending'));
});
