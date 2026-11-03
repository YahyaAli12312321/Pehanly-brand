'use strict';

/*
 * WhatsApp notification workflow with the MOCK provider. No MongoDB and no network: the WhatsAppMessage collection is an
 * in-memory fake that enforces the unique idempotency index (see test/helpers/fakeWhatsAppDb.js).
 * Nothing here talks to WhatsApp / Meta; "sent" means "accepted by the mock provider (simulated)".
 */
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.JWT_SECRET = 'unit-test-secret-unit-test-secret-1234';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_unit_test';
process.env.WHATSAPP_PROVIDER = 'mock';
process.env.WHATSAPP_ADMIN_NUMBERS = '03009998888';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');

const SRC = path.join(__dirname, '..', 'src');
const load = (...p) => require(path.join(SRC, ...p));
const oid = () => new mongoose.Types.ObjectId();

const { install } = require('./helpers/fakeWhatsAppDb');
const db = install();

const User = load('models', 'User.js');
const Order = load('models', 'order.model.js');
const Product = load('models', 'Product.js');
const WA = load('models', 'WhatsAppMessage.js');
const mock = load('services', 'whatsapp', 'providers', 'mock.provider.js');
const meta = load('services', 'whatsapp', 'providers', 'meta.provider.js');
const wa = load('services', 'whatsapp', 'whatsapp.service.js');
const ev = load('services', 'whatsapp', 'events.js');
const templates = load('services', 'whatsapp', 'templates');
const { WHATSAPP_EVENTS: E } = load('constants', 'WhatsApp.js');

const ownerId = oid();
const admins = [
  { _id: ownerId, name: 'Owner', phone: '03001111111', role: 'admin', isActive: true },
  { _id: oid(), name: 'Second Admin', phone: '', role: 'admin', isActive: true }, // no phone: must be handled safely
];
User.find = () => ({ select: () => ({ lean: async () => admins }) });

const orders = {};
const chainOf = (get) => { const q = { select: () => q, lean: async () => get() }; return q; };
Order.findById = (id) => chainOf(() => orders[String(id)] || null);
const products = {};
Product.findById = (id) => chainOf(() => products[String(id)] || null);

const mkOrder = (o = {}) => {
  const _id = oid();
  const order = {
    _id, orderNumber: 'PH-000007', orderType: 'retail', orderStatus: 'pending', currency: 'PKR', paymentMethod: 'cod',
    user: oid(), customer: { name: 'Ayesha Khan', email: 'a@x.pk', phone: '03211234567' },
    shippingAddress: { city: 'Karachi', country: 'Pakistan' }, pricing: { total: 3000 }, ...o,
  };
  orders[String(_id)] = order;
  return order;
};
const rows = (f = () => true) => db.rows.filter(f);
const by = (event) => rows((r) => r.event === event);

beforeEach(() => { db.rows.length = 0; db.seq = 0; mock._reset(); for (const k of Object.keys(orders)) delete orders[k]; });

/* ------------------------------------------------------------------ templates / provider safety */

test('every event has a template, and templates never print a value they were not given', () => {
  assert.deepEqual(templates.missingTemplates(), []);
  const msg = templates.render(E.CUSTOMER_ORDER_PLACED, { orderNumber: 'PH-1' });
  assert.match(msg, /PH-1/);
  assert.doesNotMatch(msg, /undefined|null|Total|Rs\./); // no total given => no price line (nothing invented)
});

test('provider: mock by default and never Meta; Meta placeholder makes no call and reports it is not connected', async () => {
  assert.equal(wa.publicConfig().provider, 'mock');
  assert.equal(wa.publicConfig().simulated, true);
  const r = await meta.sendMessage({ to: '+923001234567' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'META_PROVIDER_NOT_IMPLEMENTED');
});

test('mock provider returns a mock message id and flags the result as simulated', async () => {
  const r = await mock.sendMessage({ to: '+923001234567', template: 'x', message: 'hi' });
  assert.equal(r.ok, true);
  assert.equal(r.simulated, true);
  assert.match(r.messageId, /^mock_/);
});

/* ------------------------------------------------------------------ 1/2 orders */

test('1. retail order: admin (each admin) + customer records, correct events, sent via mock (simulated, never "delivered")', async () => {
  const order = mkOrder();
  await ev.orderPlaced(order);
  const adminRows = by(E.ADMIN_ORDER_NEW_RETAIL);
  assert.equal(adminRows.length, 3, 'owner + env number + the admin without a phone (skipped)');
  const customer = by(E.CUSTOMER_ORDER_PLACED);
  assert.equal(customer.length, 1);
  assert.equal(customer[0].recipientType, 'customer');
  assert.equal(customer[0].phone, '+923211234567', 'phone normalised');
  assert.equal(customer[0].status, 'sent');
  assert.equal(customer[0].provider, 'mock');
  assert.equal(customer[0].simulated, true);
  assert.match(customer[0].providerMessageId, /^mock_/);
  assert.match(customer[0].body, /PH-000007/);
  assert.match(customer[0].body, /Rs\. 3,000/);
  assert.ok(rows().every((r) => r.status !== 'delivered'), 'a mock send is never recorded as delivered');
  assert.equal(by(E.ADMIN_ORDER_NEW_WHOLESALE).length, 0);
});

test('2. wholesale order: wholesale admin event + customer acknowledgement (no retail event)', async () => {
  await ev.orderPlaced(mkOrder({ orderType: 'wholesale', orderNumber: 'WS-1' }));
  assert.ok(by(E.ADMIN_ORDER_NEW_WHOLESALE).length >= 2);
  assert.equal(by(E.ADMIN_ORDER_NEW_RETAIL).length, 0);
  assert.equal(by(E.CUSTOMER_ORDER_PLACED).length, 1);
});

test('order notifications are idempotent: placing the same order event twice records and sends once', async () => {
  const order = mkOrder();
  await ev.orderPlaced(order);
  const n = rows().length;
  const sent = mock._sent().length;
  await ev.orderPlaced(order);
  assert.equal(rows().length, n);
  assert.equal(mock._sent().length, sent);
});

/* ------------------------------------------------------------------ 3 status changes */

test('3. status changes notify the customer once per status; pending says nothing; a stale call is ignored', async () => {
  const order = mkOrder();
  const id = order._id;
  for (const status of ['confirmed', 'processing']) {
    order.orderStatus = status;
    await ev.orderStatusChanged(id, status);
  }
  assert.equal(by(E.CUSTOMER_ORDER_CONFIRMED).length, 1);
  assert.equal(by(E.CUSTOMER_ORDER_PROCESSING).length, 1);
  await ev.orderStatusChanged(id, 'confirmed'); // duplicate call
  assert.equal(by(E.CUSTOMER_ORDER_CONFIRMED).length, 1);
  await ev.orderStatusChanged(id, 'pending');
  assert.equal(rows().length, 2);
  await ev.orderStatusChanged(id, 'delivered'); // the saved order is NOT delivered => nothing is sent
  assert.equal(by(E.CUSTOMER_ORDER_DELIVERED).length, 0);
  order.orderStatus = 'delivered';
  await ev.orderStatusChanged(id, 'delivered');
  assert.equal(by(E.CUSTOMER_ORDER_DELIVERED).length, 1);
});

test('cancelled: customer + admin are told once', async () => {
  const order = mkOrder({ orderStatus: 'cancelled' });
  await ev.orderStatusChanged(order._id, 'cancelled');
  await ev.orderStatusChanged(order._id, 'cancelled');
  assert.equal(by(E.CUSTOMER_ORDER_CANCELLED).length, 1);
  assert.equal(by(E.ADMIN_ORDER_CANCELLED).length, 3);
});

test('cancellation request: admin + customer acknowledgement', async () => {
  const order = mkOrder();
  await ev.cancellationRequested({ _id: oid(), order: order._id, reason: 'Ordered by mistake' });
  assert.equal(by(E.CUSTOMER_CANCELLATION_RECEIVED).length, 1);
  assert.ok(by(E.ADMIN_ORDER_CANCELLATION_REQUESTED).length >= 1);
  assert.match(by(E.ADMIN_ORDER_CANCELLATION_REQUESTED)[0].body, /Ordered by mistake/);
});

/* ------------------------------------------------------------------ 4/5 shipment */

test('4. local rider shipped: message carries rider name + phone, no courier/tracking (Karachi needs none)', async () => {
  const order = mkOrder({ orderStatus: 'shipped', shipment: { deliveryMethod: 'local_rider', riderName: 'Bilal Ahmed', riderPhone: '+923001234567' } });
  await ev.orderStatusChanged(order._id, 'shipped');
  const [m] = by(E.CUSTOMER_ORDER_SHIPPED);
  assert.match(m.body, /Rider: Bilal Ahmed/);
  assert.match(m.body, /Rider phone: \+923001234567/);
  assert.doesNotMatch(m.body, /Courier|Tracking/);
});

test('5. courier shipped: courier + tracking number + tracking URL', async () => {
  const order = mkOrder({ orderStatus: 'shipped', shippingAddress: { city: 'Lahore' }, shipment: { deliveryMethod: 'courier', courierName: 'TCS', trackingNumber: 'CN123456', trackingUrl: 'https://track.example/CN123456' } });
  await ev.orderStatusChanged(order._id, 'shipped');
  const [m] = by(E.CUSTOMER_ORDER_SHIPPED);
  assert.match(m.body, /Courier: TCS/);
  assert.match(m.body, /Tracking number: CN123456/);
  assert.match(m.body, /https:\/\/track\.example\/CN123456/);
  assert.doesNotMatch(m.body, /Rider/);
});

test('no shipped message unless the SAVED order is shipped (status change or shipment not persisted => nothing sent)', async () => {
  const order = mkOrder({ orderStatus: 'processing', shipment: { deliveryMethod: 'local_rider', riderName: 'Bilal', riderPhone: '+923001234567' } });
  await ev.orderStatusChanged(order._id, 'shipped');
  assert.equal(by(E.CUSTOMER_ORDER_SHIPPED).length, 0);
});

test('shipment tracking update: only once shipped, only when details changed, never a repeat of what was already sent', async () => {
  const order = mkOrder({ orderStatus: 'processing', shippingAddress: { city: 'Lahore' }, shipment: { deliveryMethod: 'courier', courierName: 'TCS', trackingNumber: 'A1' } });
  await ev.shipmentUpdated(order._id); // not shipped yet: the later "shipped" message will carry the details
  assert.equal(rows().length, 0);
  order.orderStatus = 'shipped';
  await ev.orderStatusChanged(order._id, 'shipped');
  await ev.shipmentUpdated(order._id); // identical details: nothing new to say
  assert.equal(by(E.CUSTOMER_SHIPMENT_UPDATED).length, 0);
  order.shipment.trackingNumber = 'B2';
  await ev.shipmentUpdated(order._id);
  assert.equal(by(E.CUSTOMER_SHIPMENT_UPDATED).length, 1);
  assert.match(by(E.CUSTOMER_SHIPMENT_UPDATED)[0].body, /B2/);
  await ev.shipmentUpdated(order._id);
  assert.equal(by(E.CUSTOMER_SHIPMENT_UPDATED).length, 1);
});

/* ------------------------------------------------------------------ payments */

test('payment received / failed: admin messages, once each', async () => {
  const o = mkOrder();
  const payment = { _id: oid(), order: o._id, amount: 3000, method: 'jazzcash', currency: 'PKR' };
  await ev.paymentReceived(payment);
  await ev.paymentReceived(payment);
  await ev.paymentFailed({ ...payment, _id: oid() });
  assert.equal(by(E.ADMIN_PAYMENT_RECEIVED).length, 3);
  assert.equal(by(E.ADMIN_PAYMENT_FAILED).length, 3);
  assert.match(by(E.ADMIN_PAYMENT_RECEIVED)[0].body, /Rs\. 3,000/);
});

/* ------------------------------------------------------------------ 6/7 inventory */

test('6/7. stock: one message per state change; repeated updates in the same state add nothing; recovery is announced', async () => {
  const sku = { _id: oid(), sku: 'TEE-BLK-M', product: oid(), available: 4, lowStockThreshold: 5, updatedAt: new Date(1000) };
  products[String(sku.product)] = { name: 'Classic Tee' };
  await ev.lowStock(sku);
  const first = by(E.ADMIN_LOW_STOCK).length;
  assert.ok(first >= 2);
  assert.match(by(E.ADMIN_LOW_STOCK)[0].body, /Classic Tee/);
  for (let i = 1; i <= 5; i += 1) await ev.lowStock({ ...sku, available: 4 - (i % 2), updatedAt: new Date(1000 + i) }); // stock edits, still low
  assert.equal(by(E.ADMIN_LOW_STOCK).length, first, 'no duplicate low-stock messages');
  await ev.outOfStock({ ...sku, available: 0, updatedAt: new Date(2000) });
  assert.ok(by(E.ADMIN_OUT_OF_STOCK).length >= 2);
  const outBefore = by(E.ADMIN_OUT_OF_STOCK).length;
  await ev.outOfStock({ ...sku, available: 0, updatedAt: new Date(2001) });
  assert.equal(by(E.ADMIN_OUT_OF_STOCK).length, outBefore, 'repeat out-of-stock suppressed');
  const outCount = by(E.ADMIN_OUT_OF_STOCK).length;
  await ev.backInStock({ ...sku, available: 50, updatedAt: new Date(3000) });
  assert.ok(by(E.ADMIN_BACK_IN_STOCK).length >= 2);
  await ev.lowStock({ ...sku, available: 3, updatedAt: new Date(4000) }); // low AGAIN after recovery is a new event
  assert.equal(by(E.ADMIN_LOW_STOCK).length, first * 2);
  assert.equal(by(E.ADMIN_OUT_OF_STOCK).length, outCount);
});

/* ------------------------------------------------------------------ 8 B2B */

for (const [kind, adminEvent, customerEvent, extra] of [
  ['wholesale', E.ADMIN_WHOLESALE_REQUEST_NEW, E.CUSTOMER_WHOLESALE_RECEIVED, { requestedVolume: 500, requestType: 'custom' }],
  ['manufacturing', E.ADMIN_MANUFACTURING_REQUEST_NEW, E.CUSTOMER_MANUFACTURING_RECEIVED, { quantity: 300 }],
  ['printing', E.ADMIN_PRINTING_REQUEST_NEW, E.CUSTOMER_PRINTING_RECEIVED, { quantity: 120 }],
]) {
  test(`8. ${kind}: new request notifies admin + acknowledges the customer; status changes reach the customer once each`, async () => {
    const request = { _id: oid(), requestNumber: 'REQ-1', user: oid(), customer: { name: 'Zain', phone: '03331234567', businessName: 'Zain Traders' }, status: 'pending', ...extra };
    await ev.requestSubmitted(kind, request);
    assert.ok(by(adminEvent).length >= 2);
    assert.equal(by(customerEvent).length, 1);
    assert.match(by(adminEvent)[0].body, /REQ-1/);
    const reviewed = ev.trackRequestStatus(kind, async () => ({ ...request, status: 'approved' }));
    await reviewed({ requestId: request._id });
    await reviewed({ requestId: request._id });
    const statuses = by(E.CUSTOMER_REQUEST_STATUS);
    assert.equal(statuses.length, 1);
    assert.match(statuses[0].body, /approved/);
  });
}

test('8. quotes: ready -> customer; accepted / rejected -> admin + customer', async () => {
  const quote = { _id: oid(), quoteNumber: 'Q-1', sourceType: 'wholesale', user: oid(), customer: { name: 'Zain', phone: '03331234567' }, pricing: { total: 150000 }, currency: 'PKR', sentAt: new Date(5000), validUntil: new Date('2026-12-31') };
  await ev.quoteReady(quote);
  assert.match(by(E.CUSTOMER_QUOTE_READY)[0].body, /Rs\. 150,000/);
  await ev.quoteDecision(quote, true);
  assert.equal(by(E.CUSTOMER_QUOTE_ACCEPTED).length, 1);
  assert.ok(by(E.ADMIN_QUOTE_ACCEPTED).length >= 1);
  await ev.quoteDecision({ ...quote, _id: oid() }, false);
  assert.equal(by(E.CUSTOMER_QUOTE_REJECTED).length, 1);
});

/* ------------------------------------------------------------------ 9 missing phone */

test('9. missing / invalid phone: recorded as skipped (no provider call, no error), everything else still sent', async () => {
  const noPhone = mkOrder({ customer: { name: 'No Phone', email: 'n@x.pk', phone: '' } });
  const badPhone = mkOrder({ orderNumber: 'PH-2', customer: { name: 'Bad Phone', email: 'b@x.pk', phone: 'call me' } });
  await assert.doesNotReject(() => ev.orderPlaced(noPhone));
  await assert.doesNotReject(() => ev.orderPlaced(badPhone));
  const skipped = by(E.CUSTOMER_ORDER_PLACED);
  assert.deepEqual(skipped.map((r) => [r.status, r.error.code]).sort(), [['skipped', 'INVALID_PHONE'], ['skipped', 'NO_PHONE']]);
  assert.ok(mock._sent().every((m) => m.to), 'the mock provider was never asked to send to an empty number');
  assert.ok(by(E.ADMIN_ORDER_NEW_RETAIL).some((r) => r.status === 'sent'), 'admin messages still went out');
});

test('an admin with no phone is skipped without blocking the other admins', async () => {
  await ev.orderPlaced(mkOrder());
  const a = by(E.ADMIN_ORDER_NEW_RETAIL);
  assert.equal(a.filter((r) => r.status === 'sent').length, 2);
  assert.equal(a.filter((r) => r.status === 'skipped' && r.error.code === 'NO_PHONE').length, 1);
});

/* ------------------------------------------------------------------ 10 failure + retry */

test('10. a failed mock send is stored with its error, not retried when permanent, and can be retried by an admin', async () => {
  const r = await wa.dispatch({ event: E.ADMIN_TEST, recipient: { name: 'Owner', phone: '03001111111' }, variables: {}, idempotencyKey: 'k1', simulate: 'failure' });
  assert.equal(r.message.status, 'failed');
  assert.equal(r.message.error.code, 'MOCK_REJECTED');
  assert.equal(r.message.attempts, 1);
  assert.equal(r.message.error.retryable, false);
  assert.deepEqual(await wa.retryDue(), { scanned: 0, sent: 0 }, 'permanent failures are not auto-retried');
  // admin presses Retry: the record no longer simulates a failure => goes out
  db.rows[0].variables.__simulate = undefined;
  const again = await wa.retryMessage(db.rows[0]._id);
  assert.equal(again.status, 'sent');
  assert.equal(again.attempts, 2);
  assert.equal(again.error.code, null);
  await assert.rejects(() => wa.retryMessage(db.rows[0]._id), (e) => e.statusCode === 409 && e.code === 'WHATSAPP_NOT_RETRYABLE');
});

test('10. temporary failures are retried automatically after the backoff, up to the attempt limit', async () => {
  mock._failNext(2);
  const first = await wa.dispatch({ event: E.ADMIN_TEST, recipient: { phone: '03001111111' }, variables: {}, idempotencyKey: 'k2' });
  assert.equal(first.message.status, 'failed');
  assert.equal(first.message.error.retryable, true);
  assert.ok(first.message.nextAttemptAt > new Date(), 'backoff scheduled');
  assert.deepEqual(await wa.retryDue(), { scanned: 0, sent: 0 }, 'not due yet');
  db.rows[0].nextAttemptAt = new Date(Date.now() - 1000);
  assert.deepEqual(await wa.retryDue(), { scanned: 1, sent: 0 }); // second simulated failure
  db.rows[0].nextAttemptAt = new Date(Date.now() - 1000);
  assert.deepEqual(await wa.retryDue(), { scanned: 1, sent: 1 }); // provider recovered
  assert.equal(db.rows[0].status, 'sent');
  assert.equal(db.rows[0].attempts, 3);
});

test('10. attempt limit: a message that keeps failing temporarily stops being auto-retried (admin can still retry)', async () => {
  mock._failNext(10);
  await wa.dispatch({ event: E.ADMIN_TEST, recipient: { phone: '03001111111' }, variables: {}, idempotencyKey: 'k3' });
  for (let i = 0; i < 5; i += 1) { if (db.rows[0].nextAttemptAt) db.rows[0].nextAttemptAt = new Date(Date.now() - 1000); await wa.retryDue(); }
  assert.equal(db.rows[0].attempts, 3, 'stopped at maxAttempts');
  assert.equal(db.rows[0].status, 'failed');
  assert.equal(db.rows[0].nextAttemptAt, null);
  mock._reset();
  assert.equal((await wa.retryMessage(db.rows[0]._id)).status, 'sent');
});

test('failures never reach the business operation: a throwing provider or a broken store is contained', async () => {
  const realSend = mock.sendMessage;
  mock.sendMessage = async () => { throw new Error('socket hang up'); };
  const order = mkOrder();
  await assert.doesNotReject(() => ev.orderPlaced(order));
  assert.ok(rows().length > 0 && rows().every((r) => ['failed', 'skipped'].includes(r.status)));
  assert.ok(rows().filter((r) => r.status === 'failed').every((r) => r.error.code === 'PROVIDER_EXCEPTION' && r.error.retryable));
  mock.sendMessage = realSend;

  const realCreate = WA.create;
  WA.create = async () => { throw new Error('mongo down'); };
  await assert.doesNotReject(() => ev.orderPlaced(mkOrder({ orderNumber: 'PH-9' })));
  await assert.doesNotReject(() => ev.orderStatusChanged(mkOrder({ orderStatus: 'confirmed' })._id, 'confirmed'));
  WA.create = realCreate;
});

/* ------------------------------------------------------------------ secrets / records */

test('records never contain credentials; variables with secret-looking names are dropped', async () => {
  const r = await wa.dispatch({ event: E.ADMIN_TEST, recipient: { phone: '03001111111' }, variables: { provider: 'mock', accessToken: 'SECRET-TOKEN', password: 'x' }, idempotencyKey: 'k4' });
  assert.equal(JSON.stringify(r.message).includes('SECRET-TOKEN'), false);
  assert.equal(r.message.variables.accessToken, undefined);
  assert.equal(r.message.variables.password, undefined);
});

test('daily summary: builds the six figures and sends one message per admin, once per day', async () => {
  const Payment = load('models', 'Payment.js');
  const Sku = load('models', 'Sku.js');
  const summary = load('services', 'whatsapp', 'summary.js');
  Order.countDocuments = async (f) => (f.orderType === 'wholesale' ? 2 : f.paymentStatus ? 4 : 11);
  Order.aggregate = async () => [{ total: 125000 }];
  Payment.aggregate = async () => [{ total: 98000 }];
  Sku.distinct = async () => [oid(), oid(), oid()];
  const out = await summary.sendDailySummary();
  assert.deepEqual({ ...out.summary, date: 'd' }, { date: 'd', totalOrders: 11, totalSales: 125000, totalRevenue: 98000, pendingPayments: 4, wholesaleOrders: 2, lowStockProducts: 3 });
  const [m] = by(E.ADMIN_DAILY_SUMMARY);
  assert.match(m.body, /Orders: 11/);
  assert.match(m.body, /Rs\. 98,000/);
  const n = by(E.ADMIN_DAILY_SUMMARY).length;
  await summary.sendDailySummary();
  assert.equal(by(E.ADMIN_DAILY_SUMMARY).length, n);
});
