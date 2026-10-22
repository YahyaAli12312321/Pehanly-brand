'use strict';

/* Customer-facing catalogue reads are public; every admin mutation stays protected.
 * Runs the REAL Express app (routes + middleware) with the database layer stubbed. */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_unit_test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-unit-test-secret-1234';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const load = (...p) => require(path.join(SRC, ...p));

const chain = (rows) => { const q = { sort: () => q, skip: () => q, limit: () => q, select: () => q, session: () => q, lean: async () => rows }; return q; };

let server; let port;
const call = (method, p, body, headers = {}) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ port, path: p, method, headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
    let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => { let json = null; try { json = JSON.parse(b); } catch { /* not json */ } resolve({ status: res.statusCode, json }); });
  });
  req.on('error', reject); if (data) req.write(data); req.end();
});

before(async () => {
  const Manufacturing = load('models', 'Manufacturing.js');
  const category = { _id: 'c1', documentType: 'category', name: 'Polos', slug: 'polos', isActive: true };
  Manufacturing.find = () => chain([category]);
  Manufacturing.findOne = () => chain(category);
  Manufacturing.countDocuments = async () => 1;
  const { createApp } = load('app.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  port = server.address().port;
});
after(() => server.close());

test('anonymous visitors can read the manufacturing catalogue (no 401)', async () => {
  const list = await call('GET', '/api/v1/manufacturing/categories');
  assert.equal(list.status, 200, JSON.stringify(list.json));
  assert.equal(list.json.data[0].slug, 'polos');
  const one = await call('GET', '/api/v1/manufacturing/categories/polos');
  assert.notEqual(one.status, 401);
});

test('a stale/invalid session cookie never turns a public catalogue read into a 401', async () => {
  const r = await call('GET', '/api/v1/manufacturing/categories', null, { Cookie: 'pl_session=expired.invalid.token' });
  assert.equal(r.status, 200);
});

test('anonymous catalogue reads are never 401 for manufacturing, printing, wholesale packs and banners', async () => {
  for (const p of ['/api/v1/manufacturing/categories', '/api/v1/printing/services', '/api/v1/wholesale/packs', '/api/v1/banners?placement=home_hero', '/api/v1/settings/public']) {
    const r = await call('GET', p);
    assert.notEqual(r.status, 401, `${p} must be public`);
  }
});

test('every manufacturing/wholesale/printing admin mutation is still protected', async () => {
  const mutations = [
    ['POST', '/api/v1/admin/manufacturing/categories'], ['PATCH', '/api/v1/admin/manufacturing/categories/507f1f77bcf86cd799439011'],
    ['POST', '/api/v1/admin/manufacturing/styles'], ['POST', '/api/v1/admin/manufacturing/variants'],
    ['PATCH', '/api/v1/admin/manufacturing/catalog/category/507f1f77bcf86cd799439011/status'],
    ['POST', '/api/v1/admin/wholesale/packs'], ['PATCH', '/api/v1/admin/wholesale/packs/507f1f77bcf86cd799439011'],
    ['POST', '/api/v1/admin/printing/services'],
  ];
  for (const [m, p] of mutations) {
    const r = await call(m, p, { name: 'x' });
    assert.equal(r.status, 401, `${m} ${p} must require authentication (got ${r.status})`);
  }
});

test('customer request endpoints still require sign-in', async () => {
  for (const [m, p] of [['POST', '/api/v1/manufacturing/requests'], ['POST', '/api/v1/printing/requests'], ['POST', '/api/v1/wholesale/preview'], ['GET', '/api/v1/wholesale/catalog']]) {
    assert.equal((await call(m, p, {})).status, 401, `${m} ${p}`);
  }
});
