'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_phase4_test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase4-test-secret-phase4-test-secret-123';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const jwt = require('jsonwebtoken');

const SRC = path.join(__dirname, '..', 'src');
const load = (...p) => require(path.join(SRC, ...p));

const { config } = load('config', 'env.js');
const account = load('validators', 'account.validators.js');
const auditValidators = load('validators', 'audit.validators.js');
const accountService = load('services', 'account.service.js');
const emailService = load('services', 'email.service.js');
const auditService = load('services', 'audit.service.js');
const auditAdminWrites = load('middleware', 'auditAdminWrites.js');
const { RedisRateLimitStore } = load('middleware', 'redisRateLimitStore.js');
const User = load('models', 'User.js');
const { createApp, API_PREFIX } = load('app.js');

/* ------------------------------------------------------ account validators */

test('account validators: profile, password and address rules', () => {
  assert.equal(account.updateProfileBody.safeParse({}).success, false, 'empty profile update');
  assert.equal(account.updateProfileBody.safeParse({ name: 'Ali Khan' }).success, true);
  assert.equal(account.updateProfileBody.safeParse({ email: 'x@y.com' }).success, false, 'email is not editable here');

  assert.equal(account.changePasswordBody.safeParse({ currentPassword: 'oldpass123', newPassword: 'oldpass123' }).success, false);
  assert.equal(account.changePasswordBody.safeParse({ currentPassword: 'oldpass123', newPassword: 'short' }).success, false);
  assert.equal(account.changePasswordBody.safeParse({ currentPassword: 'oldpass123', newPassword: 'newpass1234' }).success, true);

  const address = {
    fullName: 'Ali Khan',
    phone: '03001234567',
    addressLine1: 'House 1, Street 2',
    city: 'Karachi',
  };

  assert.equal(account.addressBody.safeParse(address).success, true);
  assert.equal(account.addressBody.safeParse({ ...address, role: 'admin' }).success, false, 'unknown fields rejected');
  assert.equal(account.updateAddressBody.safeParse({}).success, false);
  assert.equal(account.avatarBody.safeParse({ mediaId: 'nope' }).success, false);
});

test('audit list query rejects an inverted date range', () => {
  assert.equal(auditValidators.listQuery.safeParse({ from: '2026-02-01', to: '2026-01-01' }).success, false);
  assert.equal(auditValidators.listQuery.safeParse({ limit: '500' }).success, false);
  assert.equal(auditValidators.listQuery.parse({}).limit, 30);
});

/* ------------------------------------------------- default address handling */

function fakeUser(addresses) {
  return { addresses: addresses.map((a, i) => ({ _id: `a${i}`, isDefault: false, ...a })) };
}

test('exactly one default address is kept', () => {
  const none = fakeUser([{}, {}, {}]);
  accountService.normalizeDefaults(none);
  assert.deepEqual(none.addresses.map((a) => a.isDefault), [true, false, false], 'first becomes default');

  const second = fakeUser([{ isDefault: true }, {}, { isDefault: true }]);
  accountService.normalizeDefaults(second, 'a1');
  assert.deepEqual(second.addresses.map((a) => a.isDefault), [false, true, false], 'preferred wins');

  const many = fakeUser([{ isDefault: true }, { isDefault: true }]);
  accountService.normalizeDefaults(many);
  assert.equal(many.addresses.filter((a) => a.isDefault).length, 1);

  const empty = fakeUser([]);
  accountService.normalizeDefaults(empty);
  assert.equal(empty.addresses.length, 0);
});

/* -------------------------------------------------------------------- email */

test('password reset e-mail carries the link, escapes the name, and never throws', async () => {
  const sent = [];

  emailService.setTransportForTests({ sendMail: async (message) => sent.push(message) });

  try {
    const result = await emailService.sendPasswordReset({
      to: 'a@example.com',
      name: '<b>Ali</b>',
      token: 'tok en/1',
    });

    assert.equal(result.sent, true);
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /reset-password\?token=tok%20en%2F1/);
    assert.ok(!sent[0].html.includes('<b>Ali</b>'), 'name is HTML-escaped');
    assert.match(sent[0].html, /&lt;b&gt;Ali&lt;\/b&gt;/);

    emailService.setTransportForTests({ sendMail: async () => { throw new Error('smtp down'); } });

    const failed = await emailService.sendPasswordChanged({ to: 'a@example.com', name: 'Ali' });

    assert.deepEqual(failed, { sent: false, reason: 'SEND_FAILED' });
  } finally {
    emailService.setTransportForTests(null);
  }

  const unconfigured = await emailService.sendPasswordChanged({ to: 'a@example.com', name: 'Ali' });

  assert.equal(unconfigured.reason, 'SMTP_NOT_CONFIGURED');
});

/* -------------------------------------------------------------------- audit */

test('audit path description normalises ids and picks the entity', () => {
  const d = auditAdminWrites.describePath('/api/v1/admin/orders/64b7f0c2a1b2c3d4e5f60718/status?x=1');

  assert.equal(d.pattern, '/api/v1/admin/orders/:id/status');
  assert.equal(d.entityType, 'orders');
  assert.equal(d.entityId, '64b7f0c2a1b2c3d4e5f60718');
  assert.equal(auditAdminWrites.describePath('/api/v1/admin/products/bulk').entityId, 'bulk');
});

function auditRun({ method = 'PATCH', status = 200, user = { id: 'u1', role: 'admin' }, body = { price: 5, password: 'secret' } } = {}) {
  const calls = [];
  const original = auditService.record;

  auditService.record = (...args) => calls.push(args);

  const res = new EventEmitter();
  res.statusCode = status;

  try {
    auditAdminWrites({ method, user, body, originalUrl: '/api/v1/admin/orders/64b7f0c2a1b2c3d4e5f60718/status', headers: {} }, res, () => {});
    res.emit('finish');
  } finally {
    auditService.record = original;
  }

  return calls;
}

test('admin write audit: records successes and refusals, stores field names only, skips reads and errors', () => {
  const ok = auditRun();

  assert.equal(ok.length, 1);
  assert.equal(ok[0][1], 'http.patch');
  assert.deepEqual(ok[0][4].fields, ['price', 'password']);
  assert.ok(!JSON.stringify(ok[0][4]).includes('secret'), 'values never stored');

  assert.equal(auditRun({ status: 403 })[0][1], 'http.denied');
  assert.equal(auditRun({ method: 'GET' }).length, 0);
  assert.equal(auditRun({ status: 422 }).length, 0);
  assert.equal(auditRun({ status: 500 }).length, 0);
  assert.equal(auditRun({ user: null }).length, 0);
});

/* ------------------------------------------------------ shared rate limiting */

test('redis rate-limit store counts through the client and falls back to memory when it fails', async () => {
  const calls = [];
  const client = {
    eval: async (_script, _n, key, ttl) => {
      calls.push([key, ttl]);

      return [3, 45000];
    },
    decr: async () => 1,
    del: async () => 1,
  };

  const store = new RedisRateLimitStore({ client, prefix: 'rl:test:' });
  store.init({ windowMs: 60000 });

  const hit = await store.increment('1.2.3.4');

  assert.equal(hit.totalHits, 3);
  assert.ok(hit.resetTime.getTime() > Date.now());
  assert.deepEqual(calls[0], ['rl:test:1.2.3.4', '60000']);

  const broken = new RedisRateLimitStore({
    client: { eval: async () => { throw new Error('redis down'); }, decr: async () => { throw new Error('x'); }, del: async () => { throw new Error('x'); } },
  });
  broken.init({ windowMs: 60000 });

  assert.equal((await broken.increment('k')).totalHits, 1);
  assert.equal((await broken.increment('k')).totalHits, 2, 'limits still apply per instance');
  await broken.resetKey('k');
  assert.equal((await broken.increment('k')).totalHits, 1);
});

/* ---------------------------------------------------------------- HTTP guards */

const ID = { admin: '64b000000000000000000001', staff: '64b000000000000000000002' };
const FAKE = {
  [ID.admin]: { role: 'admin', permissions: [], isActive: true },
  [ID.staff]: { role: 'staff', permissions: ['orders.manage', 'analytics.read'], isActive: true },
};

User.findById = (id) => ({
  select: async () => {
    const data = FAKE[String(id)];
    if (!data) return null;

    return { _id: String(id), tokenVersion: 0, ...data, toJSON() { return { _id: this._id, role: this.role, permissions: this.permissions }; } };
  },
});

const cookieFor = (id) =>
  `${config.auth.cookieName}=${jwt.sign({ sub: id, tv: 0 }, config.auth.jwtSecret, { algorithm: 'HS256', expiresIn: '1h' })}`;

let server;
let base;

before(async () => {
  server = await new Promise((resolve) => {
    const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}${API_PREFIX}`;
});

after(async () => {
  if (server.closeAllConnections) server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function call(method, url, { cookie, body } = {}) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try { json = await response.json(); } catch { json = null; }

  return { status: response.status, json };
}

test('account routes need a session and validate input', async () => {
  assert.equal((await call('GET', '/account')).status, 401);
  assert.equal((await call('POST', '/account/addresses', { body: {} })).status, 401);

  const cookie = cookieFor(ID.staff);

  assert.equal((await call('PATCH', '/account', { cookie, body: {} })).status, 422);
  assert.equal((await call('POST', '/account/change-password', { cookie, body: { currentPassword: 'a', newPassword: 'a' } })).status, 422);
  assert.equal((await call('PATCH', '/account/addresses/not-an-id', { cookie, body: { city: 'Lahore' } })).status, 422);
  assert.equal((await call('PUT', '/account/avatar', { cookie, body: { mediaId: 'x' } })).status, 422);
});

test('audit log API is owner-only', async () => {
  assert.equal((await call('GET', '/admin/audit-logs')).status, 401);
  assert.equal((await call('GET', '/admin/audit-logs', { cookie: cookieFor(ID.staff) })).status, 403);
  assert.equal((await call('GET', '/admin/audit-logs?limit=500', { cookie: cookieFor(ID.admin) })).status, 422, 'passes the guard, fails validation');
});

test('readiness reports 503 without a database; liveness stays 200', async () => {
  const live = await call('GET', '/health');
  const ready = await call('GET', '/health/ready');

  assert.equal(live.status, 200);
  assert.equal(ready.status, 503);
  assert.equal(ready.json.code, 'NOT_READY');
});
