'use strict';

/*
 * Admin manufacturing catalog (GET /admin/manufacturing/catalog/:type) over real HTTP: real routes, auth,
 * RBAC and validation. Only persistence is faked: User lookups, and Mongoose's Query.exec, which here
 * emulates find + populate over in-memory documents (a populate path the schema does not have, or a null
 * path, fails exactly like the real driver would).
 */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_mfg_catalog_test';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_SECRET = 'mfg-catalog-test-secret-mfg-catalog-test-1234';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const SRC = path.join(__dirname, '..', 'src');
const User = require(path.join(SRC, 'models', 'User.js'));
const Manufacturing = require(path.join(SRC, 'models', 'Manufacturing.js'));

const PASSWORD = 'Correct-horse-1';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const mkUser = (o) => ({ async save() { return this; }, tokenVersion: 0, isActive: true, passwordHash: HASH, toJSON() { return { _id: this._id, name: this.name, email: this.email, role: this.role, permissions: this.permissions || [] }; }, ...o });
const users = new Map([
  ['64b000000000000000000001', mkUser({ _id: '64b000000000000000000001', name: 'Owner', email: 'owner@pehanly.pk', phone: '+923001111111', role: 'admin' })],
  ['64b000000000000000000002', mkUser({ _id: '64b000000000000000000002', name: 'Reader', email: 'reader@pehanly.pk', phone: '+923001111112', role: 'staff', permissions: ['manufacturing.read'] })],
  ['64b000000000000000000003', mkUser({ _id: '64b000000000000000000003', name: 'Nobody', email: 'nobody@pehanly.pk', phone: '+923001111113', role: 'staff', permissions: ['orders.read'] })],
  ['64b000000000000000000004', mkUser({ _id: '64b000000000000000000004', name: 'Cust', email: 'cust@x.pk', phone: '+923001111114', role: 'customer' })],
]);
const byLogin = (q) => [...users.values()].find((u) => (q.email && u.email === q.email) || (q.phone && u.phone === q.phone) || (q.$or && q.$or.some((c) => (c.email && u.email === c.email) || (c.phone && u.phone === c.phone))));
User.findOne = (q) => ({ select: async () => byLogin(q) || null });
User.findById = (id) => ({ select: async () => users.get(String(id)) || null });

const oid = (n) => new mongoose.Types.ObjectId(String(n).padStart(24, '0'));
const docs = [
  { _id: oid(1), documentType: 'category', name: 'Polos', slug: 'polos', sortOrder: 1, isActive: true },
  { _id: oid(2), documentType: 'category', name: 'Hoodies', slug: 'hoodies', sortOrder: 2, isActive: false },
  { _id: oid(3), documentType: 'style', name: 'Classic Polo', slug: 'classic-polo', category: oid(1), sortOrder: 1, isActive: true },
  { _id: oid(4), documentType: 'style', name: 'Orphan Style (old record, no category)', slug: 'orphan', sortOrder: 2, isActive: true },
  { _id: oid(5), documentType: 'style', name: 'Dangling Style', slug: 'dangling', category: oid(999), sortOrder: 3, isActive: true },
  { _id: oid(6), documentType: 'variant', name: 'Navy', slug: 'navy', style: oid(3), sortOrder: 1, isActive: true },
  { _id: oid(7), documentType: 'variant', name: 'Old variant without style', slug: 'old', sortOrder: 2, isActive: true },
  { _id: oid(8), documentType: 'request', name: 'Not catalog', slug: 'req' },
];
Manufacturing.exists = async (q) => (docs.find((d) => d.documentType === q.documentType && d.slug === q.slug) ? { _id: 'x' } : null);
Manufacturing.create = async (data) => {
  const doc = { _id: oid(100 + docs.length), sortOrder: 99, ...data };
  docs.push(doc);
  return { toObject: () => ({ ...doc }) };
};
const view = (d, fields) => (d ? Object.fromEntries(['_id', ...fields.split(' ')].map((f) => [f, d[f]])) : null);

const seen = [];
mongoose.Query.prototype.exec = async function exec() {
  if (this.op !== 'find' || this.model.modelName !== Manufacturing.modelName) return [];
  const filter = this.getFilter();
  const rows = docs.filter((d) => d.documentType === filter.documentType).map((d) => ({ ...d }));
  const pops = Object.values(this._mongooseOptions.populate || {});
  seen.push({ type: filter.documentType, populate: pops.map((p) => p.path) });
  for (const p of pops) {
    if (!Manufacturing.schema.path(p.path)) throw new Error(`Cannot populate path \`${p.path}\` because it is not in your schema`);
    for (const r of rows) if (r[p.path]) r[p.path] = view(docs.find((d) => String(d._id) === String(r[p.path])), p.select || '');
  }
  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return rows;
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
const call = async (method, url, { body, cookie } = {}) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, setCookie: res.headers.getSetCookie?.() || [] };
};
const loginAs = async (email) => (await call('POST', '/auth/login', { body: { identifier: email, password: PASSWORD } })).setCookie.find((c) => c.startsWith('pl_session=')).split(';')[0];
const list = (type, cookie) => call('GET', `/admin/manufacturing/catalog/${type}`, { cookie });

test('categories load (this was the HTTP 500) and no parent is populated for them', async () => {
  const admin = await loginAs('owner@pehanly.pk');
  seen.length = 0;
  const r = await list('category', admin);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json.data.map((d) => d.name), ['Polos', 'Hoodies']);
  assert.deepEqual(seen[0], { type: 'category', populate: [] });
});

test('styles load with their category, and old styles with a missing/dangling category do not crash the list', async () => {
  const admin = await loginAs('owner@pehanly.pk');
  seen.length = 0;
  const r = await list('style', admin);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.data.length, 3);
  assert.deepEqual(seen[0].populate, ['category']);
  const by = Object.fromEntries(r.json.data.map((d) => [d.slug, d]));
  assert.equal(by['classic-polo'].category.name, 'Polos');
  assert.equal(by.orphan.category, undefined);
  assert.equal(by.dangling.category, null);
});

test('variants load with their style; a variant without a style still lists', async () => {
  const admin = await loginAs('owner@pehanly.pk');
  seen.length = 0;
  const r = await list('variant', admin);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(seen[0].populate, ['style']);
  assert.equal(r.json.data.find((d) => d.slug === 'navy').style.name, 'Classic Polo');
  assert.equal(r.json.data.length, 2);
});

test('only category, style and variant are accepted types', async () => {
  const admin = await loginAs('owner@pehanly.pk');
  for (const bad of ['request', 'categories', 'bogus']) {
    const r = await list(bad, admin);
    assert.ok(r.status >= 400 && r.status < 500, `${bad} -> ${r.status}`);
  }
});

test('RBAC is unchanged: anonymous 401, customer 403, staff without manufacturing 403, manufacturing.read 200', async () => {
  assert.equal((await list('category')).status, 401);
  assert.equal((await list('category', await loginAs('cust@x.pk'))).status, 403);
  assert.equal((await list('category', await loginAs('nobody@pehanly.pk'))).status, 403);
  { const r = await list('category', await loginAs('reader@pehanly.pk')); assert.equal(r.status, 200, JSON.stringify(r.json)); }
});

test('the catalog is not exposed publicly: the admin path needs a session', async () => {
  for (const t of ['category', 'style', 'variant']) assert.equal((await list(t)).status, 401);
});

test('create a category, refresh the catalog: the saved record appears; a duplicate slug is a clean 409', async () => {
  const admin = await loginAs('owner@pehanly.pk');
  const made = await call('POST', '/admin/manufacturing/categories', { cookie: admin, body: { name: 'Jackets', slug: 'jackets', description: 'Outerwear' } });
  assert.equal(made.status, 201, JSON.stringify(made.json));
  const after = await list('category', admin);
  assert.equal(after.status, 200);
  assert.ok(after.json.data.some((d) => d.slug === 'jackets' && d.name === 'Jackets'));
  const dup = await call('POST', '/admin/manufacturing/categories', { cookie: admin, body: { name: 'Jackets again', slug: 'jackets' } });
  assert.equal(dup.status, 409);
});
