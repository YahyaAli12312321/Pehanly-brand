'use strict';

/* Admin WhatsApp API over real HTTP (real routes, auth, validation). Models faked in memory; provider = mock. */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_wa_api_test';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.JWT_SECRET = 'wa-api-test-secret-wa-api-test-secret-1234';
process.env.WHATSAPP_PROVIDER = 'mock';
process.env.WHATSAPP_META_ACCESS_TOKEN = 'SUPER-SECRET-META-TOKEN'; // set on purpose: it must never appear in any response
process.env.WHATSAPP_META_PHONE_NUMBER_ID = '1234567890';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const SRC = path.join(__dirname, '..', 'src');
const { install } = require('./helpers/fakeWhatsAppDb');
const db = install();
const User = require(path.join(SRC, 'models', 'User.js'));
const mock = require(path.join(SRC, 'services', 'whatsapp', 'providers', 'mock.provider.js'));

const PASSWORD = 'Correct-horse-1';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const mkUser = (o) => ({ async save() { return this; }, tokenVersion: 0, isActive: true, passwordHash: HASH, permissions: [], ...o, toJSON() { return { _id: this._id, role: this.role }; } });
const users = {
  owner: mkUser({ _id: '64b000000000000000000001', name: 'Owner', email: 'owner@pehanly.pk', phone: '+923001111111', role: 'admin' }),
  staff: mkUser({ _id: '64b000000000000000000002', name: 'Staff', email: 'staff@pehanly.pk', phone: '+923002222222', role: 'staff', permissions: ['orders.manage', 'orders.read'] }),
  customer: mkUser({ _id: '64b000000000000000000003', name: 'Cust', email: 'cust@x.pk', phone: '+923003333333', role: 'customer' }),
};
const byEmail = (q) => Object.values(users).find((u) => u.email === q.email || u.phone === q.phone || (q.$or || []).some((c) => c.email === u.email || c.phone === u.phone));
User.findOne = (q) => ({ select: async () => byEmail(q) || null });
User.findById = (id) => ({ select: async () => Object.values(users).find((u) => String(u._id) === String(id)) || null });
User.find = () => ({ select: () => ({ lean: async () => [users.owner] }) });

const { createApp } = require(path.join(SRC, 'app.js'));
let server; let base; const cookies = {};
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  for (const [role, u] of Object.entries(users)) {
    const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' }, body: JSON.stringify({ identifier: u.email, password: PASSWORD }) });
    cookies[role] = res.headers.getSetCookie().find((c) => c.startsWith('pl_session=')).split(';')[0];
  }
});
after(() => new Promise((r) => server.close(r)));

const call = async (method, url, { body, as } = {}) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', ...(as ? { Cookie: cookies[as] } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
};
const W = '/admin/notifications/whatsapp';

test('security: anonymous 401, customer 403, staff 403 (owner-only) on every WhatsApp endpoint', async () => {
  const calls = [['GET', W], ['GET', `${W}/config`], ['POST', `${W}/test`, { to: '03001234567' }], ['GET', `${W}/64c000000000000000000001`], ['POST', `${W}/64c000000000000000000001/retry`]];
  for (const [m, u, body] of calls) {
    assert.equal((await call(m, u, { body })).status, 401, `${m} ${u} anonymous`);
    assert.equal((await call(m, u, { body, as: 'customer' })).status, 403, `${m} ${u} customer`);
    assert.equal((await call(m, u, { body, as: 'staff' })).status, 403, `${m} ${u} staff`);
  }
});

test('config: mock provider is reported as simulated; no credential is ever returned', async () => {
  const r = await call('GET', `${W}/config`, { as: 'owner' });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.provider, 'mock');
  assert.equal(r.json.data.simulated, true);
  assert.equal(r.json.data.metaConfigured, true);
  assert.ok(r.json.data.events.includes('customer_order_shipped'));
  assert.equal(r.text.includes('SUPER-SECRET-META-TOKEN'), false);
  assert.equal(r.text.includes('1234567890'), false);
});

test('test notification: validated phone, goes through the MOCK provider, stored as sent + simulated', async () => {
  const bad = await call('POST', `${W}/test`, { body: { to: 'not a phone' }, as: 'owner' });
  assert.equal(bad.status, 422);
  const extra = await call('POST', `${W}/test`, { body: { to: '03001234567', provider: 'meta' }, as: 'owner' });
  assert.equal(extra.status, 422, 'unknown fields rejected: the provider can not be chosen from the request');
  const ok = await call('POST', `${W}/test`, { body: { to: '03001234567' }, as: 'owner' });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.data.status, 'sent');
  assert.equal(ok.json.data.provider, 'mock');
  assert.equal(ok.json.data.simulated, true);
  assert.equal(ok.json.data.phone, '+923001234567', 'normalised');
  assert.match(ok.json.data.body, /Simulated: no real WhatsApp message is sent/);
  assert.equal(ok.json.data.idempotencyKey, undefined);
  assert.equal(ok.text.includes('SUPER-SECRET-META-TOKEN'), false);
});

test('failed test send is listed, filterable and retryable; retrying a sent message is refused', async () => {
  const failed = await call('POST', `${W}/test`, { body: { to: '03001234567', simulate: 'temporary_failure' }, as: 'owner' });
  assert.equal(failed.json.data.status, 'failed');
  assert.equal(failed.json.data.error.code, 'MOCK_TEMPORARY_FAILURE');
  const id = failed.json.data._id;

  const list = await call('GET', `${W}?status=failed&event=admin_test_message&recipientType=admin&limit=5`, { as: 'owner' });
  assert.equal(list.status, 200);
  assert.ok(list.json.data.items.some((m) => String(m._id) === String(id)));
  assert.ok(list.json.data.items.every((m) => m.status === 'failed'));
  assert.equal(list.json.data.config.provider, 'mock');
  assert.equal((await call('GET', `${W}?status=bogus`, { as: 'owner' })).status, 422);

  db.rows.find((r) => String(r._id) === String(id)).variables.__simulate = undefined;
  const retried = await call('POST', `${W}/${id}/retry`, { as: 'owner' });
  assert.equal(retried.status, 200, retried.text);
  assert.equal(retried.json.data.status, 'sent');
  assert.equal(retried.json.data.attempts, 2);
  const again = await call('POST', `${W}/${id}/retry`, { as: 'owner' });
  assert.equal(again.status, 409);
  assert.equal(again.json.code, 'WHATSAPP_NOT_RETRYABLE');
  assert.equal((await call('POST', `${W}/64c0000000000000000000ff/retry`, { as: 'owner' })).status, 404);
});

test('list filters: search by reference/phone, status, date range; pagination meta', async () => {
  const all = await call('GET', `${W}?limit=2&page=1`, { as: 'owner' });
  assert.equal(all.json.data.items.length, 2);
  assert.ok(all.json.data.meta.total >= 2);
  const none = await call('GET', `${W}?from=2999-01-01`, { as: 'owner' });
  assert.equal(none.json.data.items.length, 0);
  const sent = await call('GET', `${W}?status=sent`, { as: 'owner' });
  assert.ok(sent.json.data.items.length >= 1 && sent.json.data.items.every((m) => m.status === 'sent'));
  const byPhone = await call('GET', `${W}?search=${encodeURIComponent('+923001234567')}`, { as: 'owner' });
  assert.ok(byPhone.json.data.items.length >= 1);
  assert.equal(byPhone.text.includes('idempotencyKey'), false);
});

test('there is no customer-facing WhatsApp / notification-record endpoint', async () => {
  for (const u of ['/notifications/whatsapp', '/me/notifications', '/customer/notifications', '/account/notifications']) {
    const r = await call('GET', u, { as: 'customer' });
    assert.ok([403, 404].includes(r.status), `${u} -> ${r.status}`);
  }
  assert.ok(mock._sent().length >= 1);
});
