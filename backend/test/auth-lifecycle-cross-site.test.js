'use strict';

/*
 * Vercel (website) + Render (API) are different sites. Full customer lifecycle against the real Express app with
 * COOKIE_SAMESITE deliberately UNSET and RENDER_EXTERNAL_URL set, as on Render: the backend must pick SameSite=None; Secure
 * by itself. A tiny cookie jar plays the browser: it only keeps / sends cookies that a cross-site browser would accept.
 * Not proven here: real browser third-party-cookie blocking, real DNS/TLS on Render/Vercel.
 */
process.env.NODE_ENV = 'production'; // production behaviour is what is being verified
process.env.CLOUDINARY_CLOUD_NAME = 'x'; process.env.CLOUDINARY_API_KEY = 'x'; process.env.CLOUDINARY_API_SECRET = 'x';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_lifecycle_test';
process.env.CORS_ORIGINS = 'https://pehanly-brand-2qog.vercel.app';
process.env.CLIENT_URL = 'https://pehanly-brand-2qog.vercel.app';
process.env.RENDER_EXTERNAL_URL = 'https://pehanly-brand.onrender.com';
process.env.JWT_SECRET = 'lifecycle-test-secret-lifecycle-test-1234567890';
if (process.env.NEGATIVE_CONTROL_LAX) process.env.COOKIE_SAMESITE = 'lax'; else delete process.env.COOKIE_SAMESITE;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const SRC = path.join(__dirname, '..', 'src');
const User = require(path.join(SRC, 'models', 'User.js'));
require(path.join(SRC, 'services', 'customerNumber.service.js')).generateCustomerNumber = async () => 'C-LIFE-1';

const store = new Map();
let seq = 0;
const mk = (o) => ({ async save() { return this; }, tokenVersion: 0, isActive: true, ...o, toJSON() { const { passwordHash, tokenVersion, save, toJSON, ...rest } = this; return rest; } }); // eslint-disable-line no-unused-vars
const matches = (u, q) => (q.$or ? q.$or.some((c) => matches(u, c)) : Object.entries(q).every(([k, v]) => u[k] === v));
User.findOne = (q) => ({ select: async () => [...store.values()].find((u) => matches(u, q)) || null });
User.findById = (id) => ({ select: async () => store.get(String(id)) || null });
User.exists = async (q) => ([...store.values()].some((u) => matches(u, q)) ? { _id: 'x' } : null);
User.create = async (d) => { seq += 1; const doc = mk({ _id: `64b00000000000000000${String(seq).padStart(4, '0')}`, permissions: [], ...d }); store.set(doc._id, doc); return doc; };

const { createApp } = require(path.join(SRC, 'app.js'));
const { config } = require(path.join(SRC, 'config', 'env.js'));
let server; let base;
before(async () => { server = createApp().listen(0); await new Promise((r) => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}/api/v1`; });
after(() => new Promise((r) => server.close(r)));

const ORIGIN = 'https://pehanly-brand-2qog.vercel.app';
const PASSWORD = 'Correct-horse-1';

/** Minimal cross-site browser: stores a cookie only if it is Secure + SameSite=None (what Chrome requires cross-site). */
function browser() {
  const jar = new Map();
  return {
    jar,
    async call(method, url, body) {
      const res = await fetch(base + url, {
        method,
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      for (const c of res.headers.getSetCookie?.() || []) {
        const [pair, ...attrs] = c.split(';').map((s) => s.trim());
        const [name, value] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
        const a = attrs.join(';');
        const expired = /Expires=Thu, 01 Jan 1970/i.test(a) || /Max-Age=0/i.test(a);
        const crossSiteOk = /;?\s*Secure/i.test(`;${a}`) && /SameSite=None/i.test(a);
        if (expired) jar.delete(name); else if (crossSiteOk) jar.set(name, value);
      }
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch { /* */ }
      return { status: res.status, json, headers: res.headers };
    },
  };
}

test('config: unset COOKIE_SAMESITE + cross-site Vercel/Render resolves to none + Secure (auto)', () => {
  assert.equal(config.auth.cookieSameSite, 'none');
  assert.equal(config.auth.cookieSecure, true);
  assert.equal(config.auth.cookieSameSiteSource, 'auto');
});

test('register -> login -> /auth/me identifies the customer; refresh and a second tab (same jar) keep the session', async () => {
  const b = browser();
  const reg = await b.call('POST', '/auth/register', { name: 'Ayesha Khan', email: 'ayesha@x.pk', phone: '03001234567', password: PASSWORD });
  assert.equal(reg.status, 201, JSON.stringify(reg.json));
  assert.equal(reg.json.data.user.role, 'customer');

  const bad = await b.call('POST', '/auth/login', { identifier: 'ayesha@x.pk', password: 'wrong-Password-1' });
  assert.equal(bad.status, 401);
  assert.equal(bad.json.code, 'INVALID_CREDENTIALS');

  const login = await b.call('POST', '/auth/login', { identifier: 'ayesha@x.pk', password: PASSWORD });
  assert.equal(login.status, 200);
  assert.ok(b.jar.has('pl_session'), 'browser accepted the cross-site cookie');
  assert.equal(login.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(login.headers.get('access-control-allow-credentials'), 'true');

  const me = await b.call('GET', '/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.json.data.user.email, 'ayesha@x.pk');
  // "refresh" and "new tab" are the same cookie jar issuing a fresh /auth/me
  assert.equal((await b.call('GET', '/auth/me')).status, 200);
  assert.equal((await b.call('GET', '/auth/me')).json.data.user.email, 'ayesha@x.pk');
});

test('the token is never in the JSON body (HttpOnly cookie only)', async () => {
  const b = browser();
  const login = await b.call('POST', '/auth/login', { identifier: 'ayesha@x.pk', password: PASSWORD });
  assert.ok(!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(JSON.stringify(login.json)), 'no JWT in the response body');
});

test('logout clears the cookie and /auth/me is 401 afterwards; no cookie at all is 401', async () => {
  const b = browser();
  await b.call('POST', '/auth/login', { identifier: 'ayesha@x.pk', password: PASSWORD });
  assert.equal((await b.call('GET', '/auth/me')).status, 200);
  const out = await b.call('POST', '/auth/logout');
  assert.ok(out.status === 200 || out.status === 204);
  assert.ok(!b.jar.has('pl_session'), 'cookie removed');
  assert.equal((await b.call('GET', '/auth/me')).status, 401);
  assert.equal((await browser().call('GET', '/auth/me')).status, 401);
});
