'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_security_test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'security-test-secret-security-test-1234';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const SRC = path.join(__dirname, '..', 'src');

const { config } = require(path.join(SRC, 'config', 'env.js'));
const User = require(path.join(SRC, 'models', 'User.js'));

/*
 * No database: User.findById is replaced by an in-memory fake BEFORE the app
 * handles any request. These tests only exercise requests that are decided
 * before any other database access (guards, validation, 404s).
 */
const ADMIN_ID = '64b000000000000000000001';
const CUSTOMER_ID = '64b000000000000000000002';
const SUSPENDED_ID = '64b000000000000000000003';
const SOME_ID = '64b000000000000000000010';

const FAKE_USERS = {
  [ADMIN_ID]: { role: 'admin', isActive: true, tokenVersion: 0 },
  [CUSTOMER_ID]: { role: 'customer', isActive: true, tokenVersion: 0 },
  [SUSPENDED_ID]: { role: 'customer', isActive: false, tokenVersion: 0 },
};

function buildFakeUser(id) {
  const data = FAKE_USERS[id];

  if (!data) return null;

  return {
    _id: id,
    ...data,
    toJSON() {
      return { _id: this._id, role: this.role, name: 'Test User' };
    },
  };
}

User.findById = (id) => ({
  select: async () => buildFakeUser(String(id)),
});

const { createApp, API_PREFIX } = require(path.join(SRC, 'app.js'));
const optionalAuth = require(path.join(SRC, 'middleware', 'optionalAuth.js'));
const { requireAdmin } = require(path.join(SRC, 'middleware', 'auth.js'));

function sessionToken(id, tv = 0) {
  return jwt.sign({ sub: id, tv }, config.auth.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

function cookieFor(id, tv = 0) {
  return `${config.auth.cookieName}=${sessionToken(id, tv)}`;
}

function runMiddleware(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (err) => resolve({ err, req }));
  });
}

let server;
let base;

before(async () => {
  const app = createApp();

  server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  base = `http://127.0.0.1:${server.address().port}${API_PREFIX}`;
});

after(async () => {
  if (server.closeAllConnections) server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function call(method, pathName, { cookie, body } = {}) {
  const response = await fetch(`${base}${pathName}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;

  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { status: response.status, json };
}

const ADMIN_ENDPOINTS = [
  ['GET', '/admin/orders'],
  ['GET', '/admin/orders/summary'],
  ['GET', `/admin/orders/${SOME_ID}`],
  ['PATCH', `/admin/orders/${SOME_ID}/status`, { status: 'confirmed' }],
  ['PATCH', `/admin/orders/${SOME_ID}/shipment`, { courierName: 'TCS' }],
  ['PATCH', `/admin/orders/${SOME_ID}/notes`, { adminNotes: 'x' }],
  ['GET', '/admin/analytics'],
  ['GET', '/admin/banners'],
  ['GET', '/admin/banners/stats'],
  ['DELETE', `/admin/banners/${SOME_ID}`],
  ['GET', '/admin/reviews'],
  ['GET', '/admin/notifications'],
  ['GET', '/admin/notifications/unread-count'],
  ['GET', '/admin/devices'],
  ['GET', '/admin/customers'],
  ['GET', '/admin/payments'],
  ['GET', '/admin/inventory'],
  ['GET', '/admin/products'],
  ['GET', '/admin/categories'],
  ['GET', '/admin/coupons'],
  ['GET', '/admin/shipping-rules'],
  ['GET', '/admin/quotes'],
  ['GET', '/admin/wholesale/stats'],
  ['GET', '/admin/manufacturing/requests'],
  ['GET', '/admin/printing/requests'],
  ['GET', '/admin/returns'],
  ['GET', '/admin/cancellations'],
];

test('every admin endpoint rejects requests without a session (401)', async () => {
  for (const [method, url, body] of ADMIN_ENDPOINTS) {
    const { status } = await call(method, url, { body });
    assert.equal(status, 401, `${method} ${url} should be 401, got ${status}`);
  }
});

test('every admin endpoint rejects a customer session (403)', async () => {
  const cookie = cookieFor(CUSTOMER_ID);

  for (const [method, url, body] of ADMIN_ENDPOINTS) {
    const { status } = await call(method, url, { cookie, body });
    assert.equal(status, 403, `${method} ${url} should be 403, got ${status}`);
  }
});

test('forged, suspended and stale sessions are rejected', async () => {
  const forged = await call('GET', '/admin/orders', { cookie: `${config.auth.cookieName}=not-a-jwt` });
  assert.equal(forged.status, 401);
  assert.equal(forged.json.code, 'SESSION_EXPIRED');

  const suspended = await call('GET', '/admin/orders', { cookie: cookieFor(SUSPENDED_ID) });
  assert.equal(suspended.status, 401);

  const stale = await call('GET', '/admin/orders', { cookie: cookieFor(ADMIN_ID, 5) });
  assert.equal(stale.status, 401);
});

test('an admin session passes the guard (request reaches validation)', async () => {
  const cookie = cookieFor(ADMIN_ID);

  const payments = await call('GET', '/admin/payments?status=bogus', { cookie });
  assert.equal(payments.status, 422);

  const orders = await call('GET', '/admin/orders?page=0', { cookie });
  assert.equal(orders.status, 422);
});

test('admin order endpoints are no longer reachable under /orders', async () => {
  const checks = [
    ['GET', '/orders/summary'],
    ['GET', '/orders'],
    ['GET', `/orders/${SOME_ID}`],
    ['PATCH', `/orders/${SOME_ID}/status`, { status: 'cancelled' }],
    ['PATCH', `/orders/${SOME_ID}/shipment`, { courierName: 'TCS' }],
    ['PATCH', `/orders/${SOME_ID}/notes`, { adminNotes: 'x' }],
  ];

  for (const [method, url, body] of checks) {
    const { status, json } = await call(method, url, { body });
    assert.equal(status, 404, `${method} ${url} should be 404, got ${status}`);
    assert.equal(json.code, 'ROUTE_NOT_FOUND');
  }

  const mine = await call('GET', '/orders/my');
  assert.equal(mine.status, 401);
});

test('guest and logged-in checkout reach validation instead of failing with 500', async () => {
  const guest = await call('POST', '/orders', { body: {} });
  assert.equal(guest.status, 422);

  const garbageCookie = await call('POST', '/orders', {
    cookie: `${config.auth.cookieName}=garbage`,
    body: {},
  });
  assert.equal(garbageCookie.status, 422);

  const customer = await call('POST', '/orders', { cookie: cookieFor(CUSTOMER_ID), body: {} });
  assert.equal(customer.status, 422);
});

test('optionalAuth: guests, valid sessions, suspended users and stale sessions', async () => {
  const guest = await runMiddleware(optionalAuth, { cookies: {} });
  assert.equal(guest.err, undefined);
  assert.equal(guest.req.user, null);

  const valid = await runMiddleware(optionalAuth, {
    cookies: { [config.auth.cookieName]: sessionToken(CUSTOMER_ID) },
  });
  assert.equal(valid.err, undefined);
  assert.equal(valid.req.user.id, CUSTOMER_ID);
  assert.equal(valid.req.user.role, 'customer');

  const suspended = await runMiddleware(optionalAuth, {
    cookies: { [config.auth.cookieName]: sessionToken(SUSPENDED_ID) },
  });
  assert.equal(suspended.req.user, null);

  const stale = await runMiddleware(optionalAuth, {
    cookies: { [config.auth.cookieName]: sessionToken(CUSTOMER_ID, 3) },
  });
  assert.equal(stale.req.user, null);

  const garbage = await runMiddleware(optionalAuth, {
    cookies: { [config.auth.cookieName]: 'garbage' },
  });
  assert.equal(garbage.err, undefined);
  assert.equal(garbage.req.user, null);
});

test('requireAdmin answers 401 without a user, 403 for customers and passes admins', async () => {
  const anonymous = await runMiddleware(requireAdmin, {});
  assert.equal(anonymous.err.statusCode, 401);

  const customer = await runMiddleware(requireAdmin, { user: { role: 'customer' } });
  assert.equal(customer.err.statusCode, 403);

  const admin = await runMiddleware(requireAdmin, { user: { role: 'admin' } });
  assert.equal(admin.err, undefined);
});

test('/auth/me requires a session', async () => {
  const anonymous = await call('GET', '/auth/me');
  assert.equal(anonymous.status, 401);

  const admin = await call('GET', '/auth/me', { cookie: cookieFor(ADMIN_ID) });
  assert.equal(admin.status, 200);
  assert.equal(admin.json.data.user.role, 'admin');
});
