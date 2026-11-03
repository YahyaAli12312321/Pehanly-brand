'use strict';

/* Website (Vercel) and API (Render) on different sites: the configuration the deployment must use. Real app over HTTP, User faked. */
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_cookie_test';
process.env.CORS_ORIGINS = 'https://pehanly.vercel.app';
process.env.CLIENT_URL = 'https://pehanly.vercel.app';
process.env.COOKIE_SAMESITE = 'none';
process.env.JWT_SECRET = 'cookie-cross-site-secret-cookie-cross-site-1234';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const SRC = path.join(__dirname, '..', 'src');
const User = require(path.join(SRC, 'models', 'User.js'));
const PASSWORD = 'Correct-horse-1';
const user = { async save() { return this; }, tokenVersion: 0, isActive: true, passwordHash: bcrypt.hashSync(PASSWORD, 4), _id: '64b000000000000000000010', name: 'Ayesha', email: 'a@x.pk', phone: '+923001234567', role: 'customer', toJSON() { return { _id: this._id, name: this.name, email: this.email, role: this.role }; } };
User.findOne = () => ({ select: async () => user });
User.findById = () => ({ select: async () => user });

const { createApp } = require(path.join(SRC, 'app.js'));
let server; let base;
before(async () => { server = createApp().listen(0); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}/api/v1`; });
after(() => new Promise((r) => server.close(r)));
const ORIGIN = 'https://pehanly.vercel.app';

test('login issues pl_session as HttpOnly; Secure; SameSite=None, with credentialed CORS for exactly the website origin', async () => {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ identifier: 'a@x.pk', password: PASSWORD }) });
  assert.equal(res.status, 200);
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('pl_session='));
  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=None/i);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  // the same cookie restores the session via /auth/me
  const me = await fetch(`${base}/auth/me`, { headers: { Origin: ORIGIN, Cookie: cookie.split(';')[0] } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).data.user.email, 'a@x.pk');
});

test('a foreign origin is not given credentialed CORS and cannot log in', async () => {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify({ identifier: 'a@x.pk', password: PASSWORD }) });
  assert.equal(res.status, 403);
  assert.notEqual(res.headers.get('access-control-allow-origin'), 'https://evil.example');
});

test('logout clears the cookie with the same attributes (so the browser actually removes it)', async () => {
  const res = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Origin: ORIGIN } });
  const cleared = res.headers.getSetCookie().find((c) => c.startsWith('pl_session='));
  assert.ok(cleared);
  assert.match(cleared, /SameSite=None/i);
  assert.match(cleared, /Secure/i);
  assert.match(cleared, /Expires=Thu, 01 Jan 1970/i);
});
