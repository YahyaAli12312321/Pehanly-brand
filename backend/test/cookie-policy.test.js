'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { cookieWarnings, siteOf } = require(path.join(__dirname, '..', 'src', 'utils', 'cookiePolicy.js'));

test('siteOf separates shared hosting sub-domains and keeps one custom domain together', () => {
  assert.equal(siteOf('pehanly.vercel.app'), 'pehanly.vercel.app');
  assert.equal(siteOf('pehanly-api.onrender.com'), 'pehanly-api.onrender.com');
  assert.notEqual(siteOf('pehanly.vercel.app'), siteOf('pehanly-api.onrender.com'));
  assert.equal(siteOf('www.pehanly.pk'), siteOf('api.pehanly.pk'));
  assert.equal(siteOf('localhost'), 'localhost');
});

test('Vercel website + Render API with SameSite=lax in production is flagged (the login bounce)', () => {
  const w = cookieWarnings({ isProd: true, sameSite: 'lax', corsOrigins: ['https://pehanly.vercel.app'], apiUrl: 'https://pehanly-api.onrender.com' });
  assert.equal(w.length, 1);
  assert.match(w[0], /COOKIE_SAMESITE=none/);
});

test('no warning for SameSite=none, same-site custom domains, development, or loopback-only origins', () => {
  assert.deepEqual(cookieWarnings({ isProd: true, sameSite: 'none', corsOrigins: ['https://pehanly.vercel.app'], apiUrl: 'https://x.onrender.com' }), []);
  assert.deepEqual(cookieWarnings({ isProd: true, sameSite: 'lax', corsOrigins: ['https://www.pehanly.pk'], apiUrl: 'https://api.pehanly.pk' }), []);
  assert.deepEqual(cookieWarnings({ isProd: false, sameSite: 'lax', corsOrigins: ['https://pehanly.vercel.app'], apiUrl: 'https://x.onrender.com' }), []);
  assert.deepEqual(cookieWarnings({ isProd: true, sameSite: 'lax', corsOrigins: ['http://localhost:3000'] }), []);
});

test('without a known API URL, production + lax + a public website origin gets a generic warning', () => {
  const w = cookieWarnings({ isProd: true, sameSite: 'lax', corsOrigins: ['https://www.pehanly.pk'] });
  assert.equal(w.length, 1);
  assert.match(w[0], /API_PUBLIC_URL/);
});
