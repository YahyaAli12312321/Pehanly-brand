'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_env_test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'env-test-secret-env-test-secret-1234567';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadEnv } = require(path.join(__dirname, '..', 'src', 'config', 'env.js'));

const BASE = { NODE_ENV: 'development', MONGODB_URI: 'mongodb://127.0.0.1:27017/pehanly', CORS_ORIGINS: 'http://localhost:5173', CLIENT_URL: 'http://localhost:5173', JWT_SECRET: 'a-sufficiently-long-random-secret-0123456789' };

function run(overrides = {}) {
  const realExit = process.exit; const realWrite = process.stderr.write; let written = '';
  process.exit = (c) => { throw new Error(`EXIT:${c}`); };
  process.stderr.write = (chunk) => { written += String(chunk); return true; };
  try { return { config: loadEnv({ ...BASE, ...overrides }) }; } catch (e) { if (String(e.message).startsWith('EXIT:')) return { failure: written }; throw e; } finally { process.exit = realExit; process.stderr.write = realWrite; }
}

test('WhatsApp defaults to the mock provider with no Meta credentials', () => {
  const { config } = run();
  assert.equal(config.whatsapp.provider, 'mock');
  assert.equal(config.whatsapp.maxAttempts, 3);
});

test('WHATSAPP_PROVIDER=meta is refused until every required Meta value is set (secret values are not printed)', () => {
  const { failure } = run({ WHATSAPP_PROVIDER: 'meta', WHATSAPP_META_ACCESS_TOKEN: 'tok-secret' });
  assert.match(failure, /WHATSAPP_META_PHONE_NUMBER_ID/);
  assert.match(failure, /WHATSAPP_META_BUSINESS_ACCOUNT_ID/);
  assert.match(failure, /WHATSAPP_META_API_VERSION/);
  assert.doesNotMatch(failure, /tok-secret/);
});

test('meta with all values loads; an unknown provider name is rejected', () => {
  const ok = run({ WHATSAPP_PROVIDER: 'meta', WHATSAPP_META_ACCESS_TOKEN: 't', WHATSAPP_META_PHONE_NUMBER_ID: 'p', WHATSAPP_META_BUSINESS_ACCOUNT_ID: 'b', WHATSAPP_META_API_VERSION: 'v21.0' });
  assert.equal(ok.config.whatsapp.provider, 'meta');
  assert.ok(run({ WHATSAPP_PROVIDER: 'twilio' }).failure);
});
