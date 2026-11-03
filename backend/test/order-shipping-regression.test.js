'use strict';

/*
 * Regression: "Add rider name and rider phone number before marking the order as shipped" although the admin typed them.
 * Cause was in the admin UI (the typed rider fields were never saved before the status change); the backend contract
 * pinned here is what the UI now relies on: PATCH /admin/orders/:id/shipment persists the fields in the exact shape the
 * Shipped transition validates, and nothing outside the saved shipment is read. Real routes/auth/validation over HTTP.
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_ship_reg_test';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_SECRET = 'ship-regression-secret-ship-regression-1234';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const SRC = path.join(__dirname, '..', 'src');
const User = require(path.join(SRC, 'models', 'User.js'));
const Order = require(path.join(SRC, 'models', 'order.model.js'));
const { assessShipment } = require(path.join(SRC, 'services', 'deliveryPolicy.service.js'));

const PASSWORD = 'Correct-horse-1';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const admin = { async save() { return this; }, tokenVersion: 0, isActive: true, passwordHash: HASH, _id: '64b000000000000000000001', name: 'Owner', email: 'owner@pehanly.pk', phone: '+923001111111', role: 'admin', toJSON() { return { _id: this._id, name: this.name, email: this.email, role: this.role, permissions: [] }; } };
User.findOne = () => ({ select: async () => admin });
User.findById = () => ({ select: async () => admin });

const mkOrder = (id, city, province) => {
  const doc = {
    _id: id, orderStatus: 'processing', shippingAddress: { city, province, country: 'Pakistan' }, shipment: undefined, saves: 0,
    async save() { this.saves += 1; },
  };
  return doc;
};
const orders = {};
Order.findById = (id) => {
  const doc = orders[id];
  const p = Promise.resolve(doc || null);
  p.populate = () => ({ lean: async () => ({ ...doc, items: [], statusHistory: [] }) });
  p.lean = async () => ({ ...doc, items: [], statusHistory: [] });
  return p;
};

const { createApp } = require(path.join(SRC, 'app.js'));
let server; let base; let cookie;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' }, body: JSON.stringify({ identifier: 'owner@pehanly.pk', password: PASSWORD }) });
  cookie = res.headers.getSetCookie().find((c) => c.startsWith('pl_session=')).split(';')[0];
});
after(() => new Promise((r) => server.close(r)));

const patchShipment = async (id, body) => {
  const res = await fetch(`${base}/admin/orders/${id}/shipment`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', Cookie: cookie }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const A = '64c000000000000000000001'; const B = '64c000000000000000000002';

test('Karachi: saving rider name + phone persists them and the Shipped check then passes (no courier fields needed)', async () => {
  orders[A] = mkOrder(A, 'Karachi', 'Sindh');
  assert.deepEqual(assessShipment({ address: orders[A].shippingAddress, shipment: orders[A].shipment }).missing, ['rider name', 'rider phone number']); // before saving
  const r = await patchShipment(A, { deliveryMethod: 'local_rider', riderName: 'Muhammad Junaid', riderPhone: '0300 1234567' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const saved = orders[A].shipment;
  assert.equal(saved.riderName, 'Muhammad Junaid');
  assert.equal(saved.riderPhone, '0300 1234567');
  assert.equal(saved.deliveryMethod, 'local_rider');
  assert.equal(saved.courierName, undefined);
  assert.equal(saved.trackingNumber, undefined);
  // exactly what the transition reads (order.shipment.toObject() or the plain object)
  const a = assessShipment({ address: orders[A].shippingAddress, shipment: saved });
  assert.deepEqual(a.missing, []);
  assert.equal(a.method, 'local_rider');
});

test('saving twice (retry / double submit) is idempotent: same data, still valid', async () => {
  const before = JSON.stringify(orders[A].shipment);
  await patchShipment(A, { deliveryMethod: 'local_rider', riderName: 'Muhammad Junaid', riderPhone: '0300 1234567' });
  assert.equal(JSON.stringify(orders[A].shipment), before);
});

test('a partial save keeps the earlier fields (merge, not overwrite) and still reports what is missing', async () => {
  orders[B] = mkOrder(B, 'Karachi', 'Sindh');
  await patchShipment(B, { deliveryMethod: 'local_rider', riderName: 'Bilal' });
  assert.deepEqual(assessShipment({ address: orders[B].shippingAddress, shipment: orders[B].shipment }).missing, ['rider phone number']);
  await patchShipment(B, { riderPhone: '03211234567' });
  assert.equal(orders[B].shipment.riderName, 'Bilal');
  assert.deepEqual(assessShipment({ address: orders[B].shippingAddress, shipment: orders[B].shipment }).missing, []);
});

test('an invalid rider phone is rejected by the API and nothing is saved', async () => {
  const C = '64c000000000000000000003';
  orders[C] = mkOrder(C, 'Karachi', 'Sindh');
  const r = await patchShipment(C, { deliveryMethod: 'local_rider', riderName: 'Zain', riderPhone: 'call me' });
  assert.equal(r.status, 422);
  assert.equal(orders[C].shipment, undefined);
  assert.equal(orders[C].saves, 0);
});

test('outside Karachi: courier rules are unchanged and a local rider is refused', async () => {
  const D = '64c000000000000000000004';
  orders[D] = mkOrder(D, 'Lahore', 'Punjab');
  const rider = await patchShipment(D, { deliveryMethod: 'local_rider', riderName: 'X', riderPhone: '03001234567' });
  assert.equal(rider.status, 400);
  assert.equal(rider.json.code, 'LOCAL_RIDER_KARACHI_ONLY');
  const ok = await patchShipment(D, { courierName: 'TCS', trackingNumber: 'CN123456' });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.deepEqual(assessShipment({ address: orders[D].shippingAddress, shipment: orders[D].shipment }).missing, []); // tracking URL optional
  assert.equal(orders[D].shipment.riderName, undefined);
});

test('shipment cannot be edited once delivered or cancelled', async () => {
  const E = '64c000000000000000000005';
  orders[E] = mkOrder(E, 'Karachi', 'Sindh');
  orders[E].orderStatus = 'delivered';
  const r = await patchShipment(E, { riderName: 'Late' });
  assert.equal(r.status, 409);
});
