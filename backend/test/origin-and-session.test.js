'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_origin_test';
// The exact local setup reported: frontend on :3000, API on :5000.
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_SECRET = 'origin-session-test-secret-origin-session-1234';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const SRC = path.join(__dirname, '..', 'src');
const User = require(path.join(SRC, 'models', 'User.js'));
const customerNumber = require(path.join(SRC, 'services', 'customerNumber.service.js'));
const { buildOriginPolicy } = require(path.join(SRC, 'utils', 'originPolicy.js'));

/*
 * No database. User + the customer-number counter are replaced by in-memory fakes BEFORE the app loads, so
 * the REAL routes, middleware (CORS, CSRF origin, rate limit, validation, auth guards), controllers and
 * services run end to end over HTTP. Only persistence is faked.
 */
customerNumber.generateCustomerNumber = async () => 'C-TEST-0001';

const store = new Map(); // id -> user doc
let created = 0;
const PASSWORD = 'Correct-horse-1';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const mkDoc = (o) => ({ async save() { return this; }, tokenVersion: 0, isActive: true, passwordHash: HASH, ...o, toJSON() { return { _id: this._id, name: this.name, email: this.email, role: this.role }; } });
store.set('64b000000000000000000001', mkDoc({ _id: '64b000000000000000000001', name: 'Owner', email: 'owner@pehanly.pk', phone: '+923001111111', role: 'admin' }));

const find = (q) => [...store.values()].find((u) => (q.email && u.email === q.email) || (q.phone && u.phone === q.phone) || (q.$or && q.$or.some((c) => (c.email && u.email === c.email) || (c.phone && u.phone === c.phone))));
User.findOne = (q) => ({ select: async () => find(q) || null });
User.exists = async (q) => ([...store.values()].some((u) => u.role === q.role) ? { _id: 'x' } : null);
User.findById = (id) => ({ select: async () => store.get(String(id)) || null });
User.create = async (data) => {
  created += 1;
  const doc = mkDoc({ _id: `64b0000000000000000001${String(created).padStart(2, '0')}`, ...data });
  store.set(doc._id, doc);
  return doc;
};

const { createApp } = require(path.join(SRC, 'app.js'));
let server; let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => new Promise((r) => server.close(r)));

const ORIGIN = 'http://localhost:3000';
const call = async (method, url, { body, cookie, origin = ORIGIN } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  const setCookie = res.headers.getSetCookie?.() || [];
  return { status: res.status, json, setCookie, headers: res.headers };
};
const sessionCookie = (r) => (r.setCookie.find((c) => c.startsWith('pl_session=')) || '').split(';')[0];

const newUser = (n) => ({ name: 'Ayesha Khan', email: `ayesha${n}@x.pk`, phone: `0300123456${n}`, password: PASSWORD });

test('origin policy: exact match; loopback aliases only outside production', () => {
  const dev = buildOriginPolicy({ origins: ['http://localhost:3000'], allowLoopbackAliases: true });
  assert.ok(dev.has('http://localhost:3000'));
  assert.ok(dev.has('http://127.0.0.1:3000'), 'IPv4 loopback of the same port');
  assert.ok(dev.has('http://[::1]:3000'), 'IPv6 loopback of the same port');
  assert.ok(!dev.has('http://localhost:3001'), 'different port is a different origin');
  assert.ok(!dev.has('https://localhost:3000'), 'different scheme');
  assert.ok(!dev.has('null'));
  const prod = buildOriginPolicy({ origins: ['https://admin.example.com'], allowLoopbackAliases: false });
  assert.ok(prod.has('https://admin.example.com'));
  assert.ok(!prod.has('http://localhost:3000'));
  assert.ok(!prod.has('https://admin.example.com.evil.test'));
  const remote = buildOriginPolicy({ origins: ['https://shop.example.com'], allowLoopbackAliases: true });
  assert.ok(!remote.has('http://localhost:3000'), 'aliases are only derived from loopback origins');
});

test('registration: allowed origin reaches the route (the reported 403 does not occur)', async () => {
  const r = await call('POST', '/auth/register', { body: newUser(1) });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.data.user.role, 'customer');
});

test('registration: rejected origins get 403 CORS_ORIGIN_NOT_ALLOWED and create nothing', async () => {
  const before = created;
  for (const origin of ['http://localhost:3001', 'https://evil.example', 'http://localhost:3000.evil.test', 'null']) {
    const r = await call('POST', '/auth/register', { body: newUser(2), origin });
    assert.equal(r.status, 403, origin);
    assert.equal(r.json.code, 'CORS_ORIGIN_NOT_ALLOWED');
    assert.match(r.json.message, /Origin not allowed/);
    assert.ok(!r.setCookie.length, 'no session may be issued');
  }
  assert.equal(created, before);
});

test('the rejection explains itself outside production', async () => {
  const r = await call('POST', '/auth/register', { body: newUser(2), origin: 'http://localhost:3001' });
  assert.match(r.json.message, /http:\/\/localhost:3001/);
  assert.match(r.json.message, /CORS_ORIGINS/);
});

test('requests without an Origin header (curl, server-to-server) are not browser CORS requests', async () => {
  const r = await call('POST', '/auth/register', { body: newUser(3), origin: null });
  assert.equal(r.status, 201);
});

test('dev loopback alias: 127.0.0.1:3000 works when localhost:3000 is configured', async () => {
  const r = await call('POST', '/auth/register', { body: newUser(4), origin: 'http://127.0.0.1:3000' });
  assert.equal(r.status, 201);
});

test('CORS preflight: allowed origin gets credentials, foreign origin does not', async () => {
  const ok = await fetch(`${base}/auth/login`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
  const bad = await fetch(`${base}/auth/login`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});

test('JazzCash return POST is not blocked by the CORS/CSRF origin checks (it is HMAC-authenticated later)', async () => {
  // Only the two origin middlewares + a trivial handler: the real payment handler needs the database.
  const express = require('express');
  const corsMiddleware = require(path.join(SRC, 'middleware', 'cors.js'));
  const csrfOrigin = require(path.join(SRC, 'middleware', 'csrfOrigin.js'));
  const app = express();
  app.use(corsMiddleware);
  app.use(express.json());
  app.use(csrfOrigin);
  app.post('/api/v1/payments/jazzcash/return', (_req, res) => res.json({ reached: true }));
  app.post('/api/v1/other', (_req, res) => res.json({ reached: true }));
  app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ code: err.code })); // eslint-disable-line no-unused-vars
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  try {
    const url = (p) => `http://127.0.0.1:${srv.address().port}${p}`;
    const post = (p) => fetch(url(p), { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://sandbox.jazzcash.com.pk' }, body: '{}' });
    assert.equal((await post('/api/v1/payments/jazzcash/return')).status, 200, 'gateway return passes the origin checks');
    assert.equal((await post('/api/v1/other')).status, 403, 'every other path still enforces the origin');
  } finally {
    await new Promise((r) => srv.close(r));
  }
});

test('public registration cannot request privileges other than the two supported roles', async () => {
  const before = created;
  for (const extra of [{ role: 'owner' }, { role: 'staff' }, { permissions: ['*'] }, { isActive: true }]) {
    const r = await call('POST', '/auth/register', { body: { ...newUser(5), ...extra } });
    assert.equal(r.status, 422, JSON.stringify(extra));
  }
  // an admin already exists in this fixture, so an admin request is refused with 409, not created
  const second = await call('POST', '/auth/register', { body: { ...newUser(5), role: 'admin' } });
  assert.equal(second.status, 409);
  assert.equal(second.json.code, 'ADMIN_ALREADY_EXISTS');
  assert.equal(created, before, 'nothing was created');
  const ok = await call('POST', '/auth/register', { body: newUser(6) });
  assert.equal(ok.json.data.user.role, 'customer');
});

test('duplicate email and phone are 409 ACCOUNT_EXISTS', async () => {
  const dupEmail = await call('POST', '/auth/register', { body: { ...newUser(7), email: 'ayesha1@x.pk' } });
  assert.equal(dupEmail.status, 409);
  assert.match(dupEmail.json.message, /email/);
  const dupPhone = await call('POST', '/auth/register', { body: { ...newUser(8), phone: '03001234561' } });
  assert.equal(dupPhone.status, 409);
  assert.match(dupPhone.json.message, /phone/);
});

test('session lifecycle: register -> cookie -> /auth/me -> logout', async () => {
  const reg = await call('POST', '/auth/register', { body: newUser(9) });
  assert.equal(reg.status, 201);
  const raw = reg.setCookie.find((c) => c.startsWith('pl_session='));
  assert.ok(raw, 'session cookie issued on register');
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /SameSite=Lax/i);
  assert.match(raw, /Path=\//);
  assert.doesNotMatch(raw, /Secure/i, 'plain-http localhost must be able to keep the cookie');
  const cookie = sessionCookie(reg);

  assert.equal((await call('GET', '/auth/me')).status, 401, 'no cookie = signed out');
  const me = await call('GET', '/auth/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.json.data.user.email, 'ayesha9@x.pk');
  assert.equal(me.json.data.user.role, 'customer');

  const out = await call('POST', '/auth/logout', { cookie });
  assert.equal(out.status, 200);
  const cleared = out.setCookie.find((c) => c.startsWith('pl_session='));
  assert.match(cleared, /pl_session=;/);
  assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
  // The browser drops the cookie, so the next /auth/me is signed out.
  assert.equal((await call('GET', '/auth/me')).status, 401);
});

test('login: valid credentials issue a cookie; wrong password is a generic 401; Origin is enforced on login too', async () => {
  const ok = await call('POST', '/auth/login', { body: { identifier: 'owner@pehanly.pk', password: PASSWORD } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.ok(sessionCookie(ok));
  const bad = await call('POST', '/auth/login', { body: { identifier: 'owner@pehanly.pk', password: 'nope-nope-1' } });
  assert.equal(bad.status, 401);
  assert.equal(bad.json.code, 'INVALID_CREDENTIALS');
  const wrongOrigin = await call('POST', '/auth/login', { body: { identifier: 'owner@pehanly.pk', password: PASSWORD }, origin: 'http://localhost:3001' });
  assert.equal(wrongOrigin.status, 403);
  assert.ok(!wrongOrigin.setCookie.length);
});

test('role enforcement is on the server: customer 403, anonymous 401, admin allowed', async () => {
  const cust = sessionCookie(await call('POST', '/auth/register', { body: newUser(0) }));
  const admin = sessionCookie(await call('POST', '/auth/login', { body: { identifier: 'owner@pehanly.pk', password: PASSWORD } }));
  assert.equal((await call('GET', '/admin/staff/permissions')).status, 401);
  assert.equal((await call('GET', '/admin/staff/permissions', { cookie: cust })).status, 403);
  assert.equal((await call('GET', '/admin/staff/permissions', { cookie: admin })).status, 200);
  // a forged cookie is not a session
  assert.equal((await call('GET', '/auth/me', { cookie: 'pl_session=forged.token.value' })).status, 401);
});
