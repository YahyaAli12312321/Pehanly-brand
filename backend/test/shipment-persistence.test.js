'use strict';

/* Rider details must reach the database, not just return 200. Uses the REAL Mongoose Order model (hydrated documents,
 * real casting / strict mode / change tracking); only the database round trip is replaced. */
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.JWT_SECRET = 'unit-test-secret-unit-test-secret-1234';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_unit_test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const Order = require(path.join(SRC, 'models', 'order.model.js'));
const svc = require(path.join(SRC, 'services', 'order.service.js'));

const ID = '6ae4c0607ad6c858d92c7ddf';
const RIDER = { deliveryMethod: 'local_rider', riderName: 'Rider Name', riderPhone: '+923001234567' };

/* Fake collection: one stored raw document. findById returns a hydrated real document (or a lean copy for the read-back). */
function fakeDb(initial, { dropFields = [] } = {}) {
  const db = { raw: { _id: ID, orderStatus: 'processing', orderNumber: 'PH-000007', shippingAddress: { city: 'Karachi', country: 'Pakistan' }, ...initial }, writes: [] };
  Order.findById = () => {
    const q = Promise.resolve(Order.hydrate(JSON.parse(JSON.stringify(db.raw))));
    q.populate = () => ({ lean: async () => ({ ...db.raw, items: [], statusHistory: [] }) });
    return q;
  };
  Order.prototype.save = async function save() {
    const delta = this.$__delta();
    const set = delta?.[1]?.$set || {};
    if (set.shipment) {
      const shipment = { ...set.shipment };
      for (const k of dropFields) delete shipment[k]; // simulate a deployment whose schema does not know these fields
      db.raw.shipment = shipment;
    }
    db.writes.push(set);
    return this;
  };
  return db;
}

test('saving rider name + phone writes all three fields to the stored document and returns them', async () => {
  const db = fakeDb({ shipment: { deliveryMethod: 'local_rider' } }); // the exact state seen in production
  const out = await svc.updateShipment({ orderId: ID, shipment: { riderName: 'Rider Name', riderPhone: '+923001234567' } });
  assert.equal(db.raw.shipment.deliveryMethod, 'local_rider');
  assert.equal(db.raw.shipment.riderName, 'Rider Name');
  assert.equal(db.raw.shipment.riderPhone, '+923001234567');
  assert.equal(out.shipment.riderName, 'Rider Name');
  assert.equal(out.shipment.riderPhone, '+923001234567');
});

test('first save on an order with no shipment at all also stores everything', async () => {
  const db = fakeDb({});
  await svc.updateShipment({ orderId: ID, shipment: RIDER });
  assert.deepEqual({ ...db.raw.shipment }, { ...RIDER });
});

test('switching to courier clears rider fields, and Karachi never needs tracking', async () => {
  const db = fakeDb({ shipment: { ...RIDER } });
  await svc.updateShipment({ orderId: ID, shipment: { deliveryMethod: 'courier', courierName: 'TCS', trackingNumber: 'CN1' } });
  assert.equal(db.raw.shipment.courierName, 'TCS');
  assert.equal(db.raw.shipment.riderName, undefined);
  const db2 = fakeDb({});
  await svc.updateShipment({ orderId: ID, shipment: RIDER }); // no courier/tracking supplied: accepted
  assert.equal(db2.raw.shipment.trackingNumber, undefined);
});

test('if the database does not end up holding the rider fields the API fails loudly (no silent 200)', async () => {
  fakeDb({ shipment: { deliveryMethod: 'local_rider' } }, { dropFields: ['riderName', 'riderPhone'] });
  await assert.rejects(
    () => svc.updateShipment({ orderId: ID, shipment: { riderName: 'Rider Name', riderPhone: '+923001234567' } }),
    (e) => e.statusCode === 500 && e.code === 'SHIPMENT_NOT_PERSISTED' && /riderName/.test(e.message),
  );
});
