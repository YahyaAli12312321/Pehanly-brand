'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_admin_reg_test';
process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:3001';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_SECRET = 'admin-registration-test-secret-1234567890';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const SRC = path.join(__dirname, '..', 'src');
const User = require(path.join(SRC, 'models', 'User.js'));
const customerNumber = require(path.join(SRC, 'services', 'customerNumber.service.js'));

/*
 * No database. The User model is replaced by an in-memory fake that ENFORCES the same unique indexes the real
 * collection has (email, phone, and unique_single_admin) and throws a MongoDB-shaped E11000 error, so the
 * service's duplicate-key handling is exercised. The fake `exists` is deliberately slow, which lets two
 * concurrent admin registrations both pass the pre-check: only the "index" can stop the second one.
 * What this does NOT prove: that the index exists in a real MongoDB. Use `npm run ensure-admin-index` for that.
 */
let counterCalls = 0;
customerNumber.generateCustomerNumber = async () => `C-TEST-${++counterCalls}`;

const store = new Map();
let seq = 0;
const HASH = bcrypt.hashSync('Correct-horse-1', 4);
const mk = (o) => ({ async save() { return this; }, tokenVersion: 0, isActive: true, passwordHash: HASH, ...o, toJSON() { const { passwordHash, tokenVersion, save, toJSON, ...rest } = this; return rest; } }); // eslint-disable-line no-unused-vars
const dupe = (keyPattern, keyValue) => Object.assign(new Error(`E11000 duplicate key error index: ${Object.keys(keyPattern)[0]}`), { code: 11000, keyPattern, keyValue });

const matches = (u, q) => (q.$or ? q.$or.some((c) => matches(u, c)) : Object.entries(q).every(([k, v]) => u[k] === v));
User.findOne = (q) => ({ select: async () => [...store.values()].find((u) => matches(u, q)) || null });
User.findById = (id) => ({ select: async () => store.get(String(id)) || null });
User.exists = async (q) => { await new Promise((r) => setTimeout(r, 30)); return [...store.values()].some((u) => matches(u, q)) ? { _id: 'x' } : null; };
User.create = async (data) => {
  await new Promise((r) => setImmediate(r));
  for (const u of store.values()) {
    if (u.email === data.email) throw dupe({ email: 1 }, { email: data.email });
    if (u.phone === data.phone) throw dupe({ phone: 1 }, { phone: data.phone });
    if (data.role === 'admin' && u.role === 'admin') throw dupe({ role: 1 }, { role: 'admin' });
  }
  seq += 1;
  const doc = mk({ _id: `64b0000000000000000002${String(seq).padStart(2, '0')}`, permissions: [], ...data });
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

const call = async (method, url, { body, cookie, origin = 'http://localhost:3000' } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, setCookie: res.headers.getSetCookie?.() || [] };
};
const cookieOf = (r) => (r.setCookie.find((c) => c.startsWith('pl_session=')) || '').split(';')[0];
const person = (n, extra = {}) => ({ name: `Person ${n}`, email: `p${n}@x.pk`, phone: `0300555${String(1000 + n)}`, password: 'Correct-horse-1', ...extra });
const adminCount = () => [...store.values()].filter((u) => u.role === 'admin').length;

// A pre-existing user that must survive everything below untouched.
const LEGACY = mk({ _id: '64b000000000000000000777', name: 'Legacy Customer', email: 'legacy@x.pk', phone: '+923007777777', role: 'customer', permissions: [] });
store.set(LEGACY._id, LEGACY);
const identity = (u) => JSON.stringify([u.name, u.email, u.phone, u.role, u.passwordHash, u.permissions, u.isActive]);
const legacySnapshot = identity(LEGACY);

test('1+2. customer registration succeeds (role customer, explicit or omitted) for many users', async () => {
  const a = await call('POST', '/auth/register', { body: person(1, { role: 'customer' }) });
  assert.equal(a.status, 201, a.text);
  assert.equal(a.json.data.user.role, 'customer');
  const b = await call('POST', '/auth/register', { body: person(2) });
  assert.equal(b.json.data.user.role, 'customer', 'omitted role defaults to customer (backwards compatible)');
  const c = await call('POST', '/auth/register', { body: person(3, { role: 'customer' }) });
  assert.equal(c.status, 201);
  assert.ok(a.json.data.user.customerNumber, 'customers still get a customer number');
});

test('6. invalid or unsupported roles are rejected with 422 and create nothing', async () => {
  const before = store.size;
  for (const role of ['owner', 'staff', 'ADMIN', 'superadmin', '', 123, null, ['admin'], { $ne: 'x' }]) {
    const r = await call('POST', '/auth/register', { body: person(50, { role }) });
    assert.equal(r.status, 422, `role=${JSON.stringify(role)}`);
    assert.equal(r.json.code, 'VALIDATION_ERROR');
  }
  const perms = await call('POST', '/auth/register', { body: person(51, { role: 'customer', permissions: ['*'] }) });
  assert.equal(perms.status, 422);
  assert.equal(store.size, before);
});

test('3. the first admin registration succeeds and persists role admin (no hash in response)', async () => {
  assert.equal(adminCount(), 0);
  const r = await call('POST', '/auth/register', { body: person(10, { role: 'admin' }) });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.data.user.role, 'admin');
  assert.ok(!/passwordHash|tokenVersion/i.test(r.text), 'no secrets in the response');
  assert.ok(cookieOf(r), 'session cookie issued');
  assert.equal(adminCount(), 1);
  assert.equal([...store.values()].find((u) => u.email === 'p10@x.pk').customerNumber, undefined, 'an admin is not a customer');
});

test('4. a second admin registration returns 409 with the specified message', async () => {
  const r = await call('POST', '/auth/register', { body: person(11, { role: 'admin' }) });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'ADMIN_ALREADY_EXISTS');
  assert.equal(r.json.message, 'An admin account already exists. Additional admin registration is not allowed.');
  assert.equal(adminCount(), 1);
  assert.ok(!r.setCookie.length, 'no session for a refused registration');
});

test('customers and staff are not limited by the admin rule', async () => {
  for (let i = 20; i < 25; i += 1) assert.equal((await call('POST', '/auth/register', { body: person(i, { role: 'customer' }) })).status, 201);
});

test('11. duplicate email and phone are 409 ACCOUNT_EXISTS (customer and admin attempts)', async () => {
  const dupEmail = await call('POST', '/auth/register', { body: person(30, { email: 'p1@x.pk' }) });
  assert.equal(dupEmail.status, 409);
  assert.equal(dupEmail.json.code, 'ACCOUNT_EXISTS');
  assert.match(dupEmail.json.message, /email/);
  const dupPhone = await call('POST', '/auth/register', { body: person(31, { phone: '03005551001' }) });
  assert.equal(dupPhone.status, 409);
  assert.match(dupPhone.json.message, /phone/);
});

test('7+8+9+10. logins work; admin gets dashboard permissions; customers cannot reach admin endpoints', async () => {
  const admin = await call('POST', '/auth/login', { body: { identifier: 'p10@x.pk', password: 'Correct-horse-1' } });
  assert.equal(admin.status, 200, admin.text);
  const customer = await call('POST', '/auth/login', { body: { identifier: 'p1@x.pk', password: 'Correct-horse-1' } });
  assert.equal(customer.status, 200, customer.text);
  const legacy = await call('POST', '/auth/login', { body: { identifier: 'legacy@x.pk', password: 'Correct-horse-1' } });
  assert.equal(legacy.status, 200, 'existing records can still sign in');

  const adminMe = await call('GET', '/auth/me', { cookie: cookieOf(admin) });
  assert.equal(adminMe.json.data.user.role, 'admin');
  assert.equal((await call('GET', '/admin/staff/permissions', { cookie: cookieOf(admin) })).status, 200);
  assert.equal((await call('GET', '/admin/staff/permissions', { cookie: cookieOf(customer) })).status, 403);
  assert.equal((await call('GET', '/admin/staff/permissions')).status, 401);
});

test('5. concurrent admin registrations cannot create more than one admin', async () => {
  store.delete([...store.values()].find((u) => u.role === 'admin')._id); // start from "no admin"
  assert.equal(adminCount(), 0);
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => call('POST', '/auth/register', { body: person(100 + i, { role: 'admin' }) })));
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 409, 409, 409, 409, 409], JSON.stringify(results.map((r) => [r.status, r.json?.code])));
  assert.equal(adminCount(), 1);
  assert.ok(results.filter((r) => r.status === 409).every((r) => r.json.code === 'ADMIN_ALREADY_EXISTS'), 'a lost race is the clean 409, never a 500');
  assert.ok(results.every((r) => r.status !== 500));
});

test('a duplicate-key race on email/phone is also a clean 409 (no 500)', async () => {
  const [a, b] = await Promise.all([
    call('POST', '/auth/register', { body: person(200, { email: 'race@x.pk', phone: '03008880001' }) }),
    call('POST', '/auth/register', { body: person(201, { email: 'race@x.pk', phone: '03008880002' }) }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
});

test('12. existing user records are preserved', () => {
  assert.equal(identity(store.get(LEGACY._id)), legacySnapshot, 'identity, role, password hash and permissions are unchanged');
});

test('the User schema declares the unique partial index for role "admin"', () => {
  const idx = User.schema.indexes().find(([, opts]) => opts.name === 'unique_single_admin');
  assert.ok(idx, 'unique_single_admin is declared');
  assert.deepEqual(idx[0], { role: 1 });
  assert.equal(idx[1].unique, true);
  assert.deepEqual(idx[1].partialFilterExpression, { role: 'admin' });
});
