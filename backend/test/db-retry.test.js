'use strict';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_retry_test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:3000';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'db-retry-test-secret-db-retry-test-1234567';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { connectDBWithRetry, isTransientConnectError, connectHint } = require(path.join(__dirname, '..', 'src', 'config', 'db.js'));

const srvError = () => Object.assign(new Error('querySrv ECONNREFUSED _mongodb._tcp.cluster0.example.mongodb.net'), { code: 'ECONNREFUSED' });

test('classifies transient vs permanent startup errors', () => {
  assert.ok(isTransientConnectError(srvError()));
  assert.ok(isTransientConnectError(new Error('getaddrinfo ENOTFOUND cluster0.example.mongodb.net')));
  assert.ok(!isTransientConnectError(new Error('bad auth : Authentication failed.')));
  assert.ok(!isTransientConnectError(new Error('Refusing to use database "pehanly" in test mode')));
});

test('retries a transient failure and then connects', async () => {
  let calls = 0; const waits = [];
  await connectDBWithRetry({ retries: 3, delayMs: 5, sleep: async (ms) => waits.push(ms), connect: async () => { calls += 1; if (calls < 3) throw srvError(); } });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [5, 5]);
});

test('gives up after the configured retries and explains an SRV DNS failure', async () => {
  let calls = 0;
  await assert.rejects(
    connectDBWithRetry({ retries: 2, delayMs: 1, sleep: async () => {}, connect: async () => { calls += 1; throw srvError(); } }),
    (err) => /querySrv/.test(err.message) && /DNS lookup/.test(err.message) && /not a wrong password/.test(err.message),
  );
  assert.equal(calls, 3);
});

test('does not retry permanent errors (bad credentials / unsafe target)', async () => {
  let calls = 0;
  await assert.rejects(connectDBWithRetry({ retries: 5, delayMs: 1, sleep: async () => {}, connect: async () => { calls += 1; throw new Error('bad auth : Authentication failed.'); } }));
  assert.equal(calls, 1);
});

test('connectHint is null for unrelated errors', () => assert.equal(connectHint(new Error('something else')), null));
