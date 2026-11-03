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

const BASE = {
  NODE_ENV: 'development',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/pehanly',
  CORS_ORIGINS: 'http://localhost:5173',
  CLIENT_URL: 'http://localhost:5173',
  JWT_SECRET: 'a-sufficiently-long-random-secret-0123456789',
};

/** Runs loadEnv with process.exit and stderr captured. Returns { config } or { failure }. */
function run(overrides = {}) {
  const realExit = process.exit;
  const realWrite = process.stderr.write;
  let written = '';

  process.exit = (code) => {
    throw new Error(`EXIT:${code}`);
  };
  process.stderr.write = (chunk) => {
    written += String(chunk);
    return true;
  };

  try {
    return { config: loadEnv({ ...BASE, ...overrides }) };
  } catch (error) {
    if (String(error.message).startsWith('EXIT:')) return { failure: written };
    throw error;
  } finally {
    process.exit = realExit;
    process.stderr.write = realWrite;
  }
}

test('valid minimal environment applies defaults', () => {
  const { config } = run();

  assert.equal(config.port, 5000);
  assert.equal(config.isProd, false);
  assert.equal(config.mongo.autoIndex, true);
  assert.equal(config.auth.cookieName, 'pl_session');
  assert.deepEqual([...config.cors.origins], ['http://localhost:5173']);
});

test('blank values are treated as unset', () => {
  const { config, failure } = run({
    PORT: '',
    MONGO_AUTO_INDEX: '',
    COOKIE_DOMAIN: '',
    TRUST_PROXY: '   ',
    FIREBASE_PROJECT_ID: '',
    FIREBASE_CLIENT_EMAIL: '',
    FIREBASE_PRIVATE_KEY: '',
  });

  assert.equal(failure, undefined);
  assert.equal(config.port, 5000);
  assert.equal(config.mongo.autoIndex, true);
  assert.equal(config.auth.cookieDomain, undefined);
  assert.equal(config.trustProxy, 0);
});

test('production turns auto-indexing off unless explicitly enabled', () => {
  const prod = { NODE_ENV: 'production', CORS_ORIGINS: 'https://shop.example.com', CLIENT_URL: 'https://shop.example.com', CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: '123456', CLOUDINARY_API_SECRET: 'secret-value' };

  assert.equal(run(prod).config.mongo.autoIndex, false);
  assert.equal(run({ ...prod, MONGO_AUTO_INDEX: 'true' }).config.mongo.autoIndex, true);
  assert.equal(run(prod).config.auth.cookieSecure, true);
});

test('CORS origins must be bare, explicit origins', () => {
  assert.match(run({ CORS_ORIGINS: '*' }).failure, /must not contain "\*"/);
  assert.match(run({ CORS_ORIGINS: 'https://shop.example.com/app' }).failure, /bare origin/);
  assert.match(run({ CORS_ORIGINS: 'not a url' }).failure, /bare origin/);

  const { config } = run({ CORS_ORIGINS: 'http://localhost:5173/, https://shop.example.com' });
  assert.deepEqual([...config.cors.origins], ['http://localhost:5173', 'https://shop.example.com']);

  assert.match(
    run({ NODE_ENV: 'production', CORS_ORIGINS: 'http://shop.example.com', CLIENT_URL: 'https://shop.example.com', CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: '123456', CLOUDINARY_API_SECRET: 'secret-value' }).failure,
    /https origins in production/,
  );
});

test('placeholder JWT secrets are rejected in production only', () => {
  const placeholder = 'change-me-to-a-long-random-secret-value';
  const prod = { CORS_ORIGINS: 'https://shop.example.com', CLIENT_URL: 'https://shop.example.com', CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: '123456', CLOUDINARY_API_SECRET: 'secret-value' };

  assert.match(run({ ...prod, NODE_ENV: 'production', JWT_SECRET: placeholder }).failure, /placeholder/);
  assert.equal(run({ JWT_SECRET: placeholder }).failure, undefined);
  assert.match(run({ JWT_SECRET: 'too-short' }).failure, /JWT_SECRET/);
});

test('Firebase is all-or-none', () => {
  assert.equal(run().failure, undefined);

  assert.equal(
    run({ FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'e@p.iam.gserviceaccount.com', FIREBASE_PRIVATE_KEY: 'k' }).failure,
    undefined,
  );

  const partial = run({ FIREBASE_PROJECT_ID: 'p' });
  assert.match(partial.failure, /partially configured/);
  assert.match(partial.failure, /FIREBASE_CLIENT_EMAIL/);
});

test('invalid values fail without printing secrets', () => {
  const bad = run({ MONGODB_URI: 'postgres://nope', PORT: '70000' });

  assert.match(bad.failure, /MONGODB_URI/);
  assert.match(bad.failure, /PORT/);
  assert.ok(!bad.failure.includes(BASE.JWT_SECRET));
});

test('Cloudinary is all-or-none and required in production', () => {
  const base = { CORS_ORIGINS: 'https://shop.example.com', CLIENT_URL: 'https://shop.example.com' };

  assert.equal(run().failure, undefined);
  assert.equal(run().config.cloudinary.configured, false);

  assert.match(run({ CLOUDINARY_CLOUD_NAME: 'demo' }).failure, /Cloudinary is partially configured/);

  assert.match(run({ ...base, NODE_ENV: 'production' }).failure, /required in production/);

  const ok = run({
    ...base,
    NODE_ENV: 'production',
    CLOUDINARY_CLOUD_NAME: 'demo',
    CLOUDINARY_API_KEY: '123456',
    CLOUDINARY_API_SECRET: 'secret-value',
  });

  assert.equal(ok.failure, undefined);
  assert.equal(ok.config.cloudinary.configured, true);
});

test('JazzCash is all-or-none and defaults to sandbox', () => {
  assert.equal(run().config.jazzcash.env, 'sandbox');
  assert.equal(run().config.jazzcash.configured, false);
  assert.match(run({ JAZZCASH_MERCHANT_ID: 'MC1' }).failure, /JazzCash is partially configured/);
});

test('e-mail settings: SMTP_HOST and EMAIL_FROM are all-or-none, auth pair is all-or-none', () => {
  assert.match(run({ SMTP_HOST: 'smtp.example.com' }).failure, /E-mail is partially configured/);
  assert.match(run({ EMAIL_FROM: 'PEHAN LY <no-reply@example.com>' }).failure, /E-mail is partially configured/);
  assert.match(
    run({ SMTP_HOST: 'smtp.example.com', EMAIL_FROM: 'a@example.com', SMTP_USER: 'u' }).failure,
    /SMTP_USER and SMTP_PASS/,
  );

  const { config } = run({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', EMAIL_FROM: 'a@example.com' });

  assert.equal(config.mail.configured, true);
  assert.equal(config.mail.secure, true, 'port 465 defaults to implicit TLS');
  assert.equal(config.mail.passwordResetUrl, 'http://localhost:5173/reset-password');
  assert.equal(run().config.mail.configured, false);
});
