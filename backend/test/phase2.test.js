'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_phase2_test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase2-test-secret-phase2-test-secret-12';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { z } = require('zod');

const SRC = path.join(__dirname, '..', 'src');
const load = (...parts) => require(path.join(SRC, ...parts));

/*
 * Stub the cancellation service BEFORE the controller is loaded.
 */
const cancellationServicePath = require.resolve(path.join(SRC, 'services', 'cancellation.service.js'));
require(cancellationServicePath);
require.cache[cancellationServicePath].exports = {
  createCustomerRequest: async (userId, orderId, input) => ({
    _id: 'c1',
    order: orderId,
    user: userId,
    reason: input.reason,
    status: 'pending',
  }),
  listRequests: async () => ({
    requests: [{ _id: 'c1' }],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  }),
  reviewRequest: async (id, input) => ({
    _id: id,
    status: input.action === 'approve' ? 'approved' : 'rejected',
  }),
};

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('constants: arrays AND named access work together', () => {
  const { ORDER_TYPES, ORDER_STATUSES, PAYMENT_STATUSES: ORDER_PAYMENT_STATUSES, canTransitionOrderStatus } = load('constants', 'Order.js');
  const { PAYMENT_STATUSES, PAYMENT_GATEWAYS } = load('constants', 'Payment.js');

  assert.ok(Array.isArray(ORDER_STATUSES));
  assert.deepEqual(Object.values(ORDER_STATUSES), ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']);
  assert.equal(ORDER_STATUSES.DELIVERED, 'delivered');
  assert.equal(ORDER_STATUSES.CANCELLED, 'cancelled');

  assert.deepEqual([...ORDER_TYPES], ['retail', 'wholesale', 'manufacturing', 'printing']);
  assert.equal(ORDER_TYPES.WHOLESALE, 'wholesale');

  assert.equal(PAYMENT_STATUSES, ORDER_PAYMENT_STATUSES);
  assert.equal(PAYMENT_STATUSES.PAID, 'paid');
  assert.equal(PAYMENT_STATUSES.PARTIALLY_REFUNDED, 'partially_refunded');

  assert.deepEqual([...PAYMENT_GATEWAYS], ['cod', 'jazzcash']);
  assert.equal(PAYMENT_GATEWAYS.COD, 'cod');

  assert.equal(z.enum(ORDER_STATUSES).parse('shipped'), 'shipped');
  assert.throws(() => z.enum(ORDER_STATUSES).parse('bogus'));

  assert.equal(canTransitionOrderStatus('pending', 'confirmed'), true);
  assert.equal(canTransitionOrderStatus('shipped', 'cancelled'), false);
});

test('constants: Mongoose enums built from the lists are unchanged', () => {
  const Order = load('models', 'order.model.js');

  assert.deepEqual(Order.schema.path('orderStatus').enumValues, ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']);
  assert.deepEqual(Order.schema.path('orderType').enumValues, ['retail', 'wholesale', 'manufacturing', 'printing']);
  assert.ok(Order.schema.path('paymentStatus').enumValues.includes('partially_refunded'));
});

test('apiResponse: options, extra fields, meta aliases, created and positional misuse', () => {
  const { success, created } = load('utils', 'apiResponse.js');

  const a = fakeRes();
  success(a, { data: [1, 2], message: 'Fetched', meta: { page: 1, limit: 10, total: 2, pages: 1 }, stats: { total: 2 } });
  assert.equal(a.statusCode, 200);
  assert.deepEqual(a.body.data, [1, 2]);
  assert.equal(a.body.message, 'Fetched');
  assert.deepEqual(a.body.stats, { total: 2 });
  assert.equal(a.body.meta.pages, 1);
  assert.equal(a.body.meta.totalPages, 1);

  const b = fakeRes();
  success(b, { data: null, meta: { totalPages: 4 } });
  assert.equal(b.body.meta.pages, 4);

  const c = fakeRes();
  created(c, { data: { id: 1 } });
  assert.equal(c.statusCode, 201);
  assert.equal(c.body.message, 'Created');

  assert.throws(() => success(fakeRes(), [1], 'message', {}), TypeError);
  assert.throws(() => success(fakeRes(), [1]), TypeError);
  assert.throws(() => created(fakeRes(), { _id: 1, toObject() {} }), TypeError);
});

test('cancellation controller returns real data and meta', async () => {
  const controller = load('controllers', 'cancellation.controller.js');

  async function run(handler, req) {
    const res = fakeRes();
    let error;

    await handler(req, res, (err) => {
      error = err;
    });

    assert.equal(error, undefined);
    return res;
  }

  const createdRes = await run(controller.createRequest, {
    user: { id: 'u1' },
    validated: { params: { id: 'o1' }, body: { reason: 'changed my mind' } },
  });
  assert.equal(createdRes.statusCode, 201);
  assert.equal(createdRes.body.data._id, 'c1');
  assert.equal(createdRes.body.data.status, 'pending');

  const listRes = await run(controller.listRequests, { validated: { query: {} } });
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.body.data.length, 1);
  assert.equal(listRes.body.meta.totalPages, 1);
  assert.equal(listRes.body.meta.pages, 1);

  const reviewRes = await run(controller.reviewRequest, {
    user: { id: 'a1' },
    validated: { params: { id: 'c1' }, body: { action: 'approve' } },
  });
  assert.equal(reviewRes.body.data.status, 'approved');
  assert.equal(reviewRes.body.message, 'Cancellation approved successfully');
});

test('validate: fails fast on bad definitions and still validates requests', async () => {
  const validate = load('middleware', 'validate.js');

  assert.throws(() => validate({ query: undefined }), /query/);
  assert.throws(() => validate({ parms: z.object({}) }), /unknown key/);
  assert.throws(() => validate({}), /at least one/);
  assert.throws(() => validate(undefined), TypeError);
  assert.equal(typeof validate.validate, 'function');

  const middleware = validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1) }).strict() });

  const ok = { query: { page: '2' } };
  await new Promise((resolve) => middleware(ok, {}, resolve));
  assert.equal(ok.validated.query.page, 2);

  const bad = { query: { page: '0' } };
  const err = await new Promise((resolve) => middleware(bad, {}, resolve));
  assert.equal(err.statusCode, 422);
  assert.equal(err.errors[0].field, 'query.page');
});

test('counter: accepts options, a raw session and null; retries only outside transactions', async () => {
  const Counter = load('models', 'Counter.model.js');
  const { nextSequence } = load('services', 'counter.services.js');

  const calls = [];
  let failures = 0;

  Counter.findOneAndUpdate = async (filter, update, options) => {
    calls.push({ filter, update, options });

    if (failures > 0) {
      failures -= 1;
      const error = new Error('duplicate key');
      error.code = 11000;
      throw error;
    }

    return { sequence: 5 };
  };

  const rawSession = { inTransaction: () => true };

  assert.equal(await nextSequence('Quote '), 5);
  assert.equal(calls.at(-1).filter.key, 'quote');
  assert.equal(calls.at(-1).options.session, undefined);

  await nextSequence('quote', { session: rawSession });
  assert.equal(calls.at(-1).options.session, rawSession);

  await nextSequence('quote', rawSession);
  assert.equal(calls.at(-1).options.session, rawSession);

  await nextSequence('quote', null);
  assert.equal(calls.at(-1).options.session, undefined);

  calls.length = 0;
  failures = 1;
  assert.equal(await nextSequence('order'), 5);
  assert.equal(calls.length, 2);

  calls.length = 0;
  failures = 1;
  await assert.rejects(() => nextSequence('order', { session: rawSession }), { code: 11000 });
  assert.equal(calls.length, 1);

  await assert.rejects(() => nextSequence('   '), /Counter key is required/);
});

test('validators: stricter URL, slug, price and payment-method rules', () => {
  const ID = '64b000000000000000000010';

  const { createBannerBody } = load('validators', 'banner.validators.js');
  const banner = (cta) => createBannerBody.safeParse({
    title: 'Sale',
    placement: 'home_hero',
    image: { url: 'https://cdn.example.com/a.jpg' },
    cta,
  });

  assert.equal(banner({ label: 'Shop', target: '/shop/new' }).success, true);
  assert.equal(banner({ label: 'Shop', target: 'https://example.com/shop' }).success, true);
  assert.equal(banner({ label: 'Shop', target: 'javascript:alert(1)' }).success, false);
  assert.equal(banner({ label: 'Shop', target: '//evil.example.com' }).success, false);
  assert.equal(
    createBannerBody.safeParse({ title: 'x', placement: 'home_hero', image: { url: 'data:image/png;base64,AAAA' } }).success,
    false,
  );

  const orders = load('validators', 'order.validators.js');
  const checkout = (paymentMethod) => orders.createRetailOrderBody.safeParse({
    items: [{ sku: ID, quantity: 1 }],
    customer: { name: 'Ali Khan', email: 'ali@example.com', phone: '03001234567' },
    shippingAddress: { fullName: 'Ali Khan', phone: '03001234567', addressLine1: 'House 1, Street 2', city: 'Karachi' },
    paymentMethod,
  });

  assert.equal(checkout('cod').success, true);
  assert.equal(checkout('jazzcash').success, false);
  assert.equal(orders.updateShipmentBody.safeParse({ trackingUrl: 'javascript:alert(1)' }).success, false);
  assert.equal(orders.updateShipmentBody.safeParse({ trackingUrl: 'https://track.example.com/123' }).success, true);

  const quotes = load('validators', 'quote.validators.js');
  assert.equal(quotes.createManufacturingQuoteBody.safeParse({ manufacturingRequestId: ID, unitPrice: 0 }).success, false);
  assert.equal(quotes.createManufacturingQuoteBody.safeParse({ manufacturingRequestId: ID, unitPrice: 450 }).success, true);

  const wholesale = load('validators', 'wholesale.validators.js');
  const pack = (slug) => wholesale.createPackBody.safeParse({ name: 'Starter Pack', slug, items: [{ sku: ID, quantity: 5 }] });
  assert.equal(pack('starter-pack').success, true);
  assert.equal(pack('Starter Pack').success, false);

  const manufacturing = load('validators', 'manufacturing.validators.js');
  assert.equal(manufacturing.createCategoryBody.safeParse({ name: 'T-Shirts', slug: 'Bad Slug' }).success, false);
  assert.equal(manufacturing.createCategoryBody.safeParse({ name: 'T-Shirts', slug: 't-shirts' }).success, true);

  const returns = load('validators', 'returnRefund.validators.js');
  const returnBody = (url) => returns.createReturnBody.safeParse({
    items: [{ orderItem: ID, quantity: 1 }],
    reason: 'Damaged item',
    images: [{ url }],
  });
  assert.equal(returnBody('https://cdn.example.com/damage.jpg').success, true);
  assert.equal(returnBody('not a url').success, false);

  const inventory = load('validators', 'inventory.validators.js');
  assert.equal(inventory.adjustBody.safeParse({ direction: 'add', quantity: 3, reason: 'physical_cycle_count_discrepancy' }).success, true);
  assert.equal(
    inventory.adjustBody.safeParse({ mode: 'stock_in', direction: 'remove', quantity: 3, reason: 'physical_cycle_count_discrepancy' }).success,
    false,
  );
});
