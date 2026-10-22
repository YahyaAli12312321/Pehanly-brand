'use strict';

/* Karachi = local rider (no courier fields); outside Karachi = courier. Models stubbed. */
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

test('assessShipment: Karachi needs rider name + phone, never courier fields', () => {
  const { assessShipment } = load('services', 'deliveryPolicy.service.js');
  const khi = { city: 'Karachi', province: 'Sindh' };
  assert.deepEqual(assessShipment({ address: khi, shipment: {} }).missing, ['rider name', 'rider phone number']);
  const ok = assessShipment({ address: khi, shipment: { riderName: 'Muhammad Junaid', riderPhone: '03001234567' } });
  assert.equal(ok.method, 'local_rider');
  assert.deepEqual(ok.missing, []);
  assert.equal(ok.code, null);
  // a courier waybill/URL is NOT required for Karachi
  assert.deepEqual(assessShipment({ address: khi, shipment: { riderName: 'A', riderPhone: '0300 1234567' } }).missing, []);
  assert.deepEqual(assessShipment({ address: khi, shipment: { riderName: 'A', riderPhone: 'abc' } }).missing, ['rider phone number']);
});

test('assessShipment: outside Karachi needs a courier + waybill; local rider is refused', () => {
  const { assessShipment } = load('services', 'deliveryPolicy.service.js');
  const lhr = { city: 'Lahore', province: 'Punjab' };
  const a = assessShipment({ address: lhr, shipment: {} });
  assert.equal(a.method, 'courier');
  assert.deepEqual(a.missing, ['logistics partner', 'tracking waybill / consignment number']);
  assert.deepEqual(assessShipment({ address: lhr, shipment: { courierName: 'TCS', trackingNumber: 'CN123' } }).missing, []); // tracking URL optional
  assert.equal(assessShipment({ address: lhr, shipment: { deliveryMethod: 'local_rider', riderName: 'A', riderPhone: '03001234567' } }).code, 'LOCAL_RIDER_KARACHI_ONLY');
  assert.equal(assessShipment({ address: { city: 'Karachi', province: 'Punjab' }, shipment: {} }).method, 'courier'); // inconsistent address is not Karachi
});

test('validator accepts rider fields and rejects a bad rider phone', () => {
  const { updateShipmentBody } = load('validators', 'order.validators.js');
  assert.equal(updateShipmentBody.safeParse({ deliveryMethod: 'local_rider', riderName: 'Muhammad Junaid', riderPhone: '03001234567' }).success, true);
  assert.equal(updateShipmentBody.safeParse({ riderPhone: 'call me' }).success, false);
  assert.equal(updateShipmentBody.safeParse({ deliveryMethod: 'drone' }).success, false);
  assert.equal(updateShipmentBody.safeParse({}).success, false);
});

function stubOrder(shippingAddress) {
  const Order = load('models', 'order.model.js');
  const doc = { _id: 'o1', orderStatus: 'processing', shippingAddress, shipment: undefined, saved: 0, async save() { this.saved++; } };
  Order.findById = () => { const p = Promise.resolve(doc); p.populate = () => ({ lean: async () => ({ ...doc, items: [], statusHistory: [] }) }); return p; };
  return doc;
}

test('updateShipment (Karachi): stores rider info and drops courier fields', async () => {
  const doc = stubOrder({ city: 'Karachi', province: 'Sindh' });
  const svc = load('services', 'order.service.js');
  await svc.updateShipment({ orderId: 'o1', shipment: { courierName: 'TCS', trackingNumber: 'X', riderName: 'Muhammad Junaid', riderPhone: '03001234567' } });
  assert.equal(doc.shipment.deliveryMethod, 'local_rider');
  assert.equal(doc.shipment.riderName, 'Muhammad Junaid');
  assert.equal(doc.shipment.courierName, undefined);
  assert.equal(doc.shipment.trackingNumber, undefined);
});

test('updateShipment (outside Karachi): courier fields kept, rider method rejected', async () => {
  const doc = stubOrder({ city: 'Lahore', province: 'Punjab' });
  const svc = load('services', 'order.service.js');
  await svc.updateShipment({ orderId: 'o1', shipment: { courierName: 'Leopards', trackingNumber: 'LP-1', trackingUrl: 'https://track.example/LP-1' } });
  assert.equal(doc.shipment.deliveryMethod, 'courier');
  assert.equal(doc.shipment.trackingUrl, 'https://track.example/LP-1');
  await assert.rejects(() => svc.updateShipment({ orderId: 'o1', shipment: { deliveryMethod: 'local_rider', riderName: 'A', riderPhone: '03001234567' } }), (e) => e.code === 'LOCAL_RIDER_KARACHI_ONLY');
});
