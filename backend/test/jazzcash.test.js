'use strict';

/*
 * JazzCash signing / verification tests.
 *
 * IMPORTANT: these prove the code is internally consistent and rejects
 * tampering. They do NOT prove compatibility with the live JazzCash
 * gateway; that needs sandbox credentials from your merchant account.
 */

process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'jazz-test-secret-jazz-test-secret-1234';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_jazz_test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const jazz = require(path.join(__dirname, '..', 'src', 'services', 'jazzcash.service.js'));

const SALT = 'unit-test-salt';

test('secure hash: sorted non-empty pp fields, HMAC-SHA256, upper-case hex', () => {
  const fields = {
    pp_Version: '1.1',
    pp_Amount: '150000',
    pp_MerchantID: 'MC0001',
    pp_SubMerchantID: '', // empty values are skipped
    ppmpf_1: '',
    notAGatewayField: 'ignored',
    pp_SecureHash: 'ignored-when-hashing',
  };

  const expectedMessage = [SALT, '150000', 'MC0001', '1.1'].join('&');
  const expected = crypto.createHmac('sha256', SALT).update(expectedMessage).digest('hex').toUpperCase();

  assert.equal(jazz.computeSecureHash(fields, SALT), expected);
  assert.match(expected, /^[0-9A-F]{64}$/);
});

test('secure hash does not depend on field order', () => {
  const a = { pp_Amount: '100', pp_MerchantID: 'M', pp_TxnRefNo: 'T1' };
  const b = { pp_TxnRefNo: 'T1', pp_MerchantID: 'M', pp_Amount: '100' };

  assert.equal(jazz.computeSecureHash(a, SALT), jazz.computeSecureHash(b, SALT));
});

test('a response verifies only with the right salt and untampered fields', () => {
  const body = { pp_ResponseCode: '000', pp_TxnRefNo: 'T20261020120000123456', pp_Amount: '150000' };
  body.pp_SecureHash = jazz.computeSecureHash(body, SALT);

  assert.equal(jazz.verifyResponseHash(body, SALT), true);
  assert.equal(jazz.verifyResponseHash({ ...body, pp_SecureHash: body.pp_SecureHash.toLowerCase() }, SALT), true);

  assert.equal(jazz.verifyResponseHash(body, 'another-salt'), false);
  assert.equal(jazz.verifyResponseHash({ ...body, pp_ResponseCode: '121' }, SALT), false);
  assert.equal(jazz.verifyResponseHash({ ...body, pp_Amount: '100' }, SALT), false);
  assert.equal(jazz.verifyResponseHash({ ...body, pp_SecureHash: 'DEADBEEF' }, SALT), false);
  assert.equal(jazz.verifyResponseHash({ pp_ResponseCode: '000' }, SALT), false); // unsigned
  assert.equal(jazz.verifyResponseHash(null, SALT), false);
});

test('amounts are converted to whole paisa without float drift', () => {
  assert.equal(jazz.toPaisa(1500), '150000');
  assert.equal(jazz.toPaisa(1499.99), '149999');
  assert.equal(jazz.toPaisa(0.1 + 0.2), '30');
  assert.equal(jazz.toPaisa(19.99), '1999');
});

test('timestamps are Pakistan time and references fit the 20 character limit', () => {
  // 2026-10-20 20:00:00 UTC is 2026-10-21 01:00:00 in Pakistan (UTC+5)
  assert.equal(jazz.formatPakistanTime(new Date('2026-10-20T20:00:00Z')), '20261021010000');

  const ref = jazz.newTxnRef(new Date('2026-10-20T20:00:00Z'));
  assert.equal(ref.length, 20, `txn ref too long: ${ref}`);
  assert.match(ref, /^T\d{14}\d{5}$/);
  assert.notEqual(ref, jazz.newTxnRef(new Date('2026-10-20T20:00:00Z')));
});

function runConfigured(script, extraEnv = {}) {
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JAZZCASH_MERCHANT_ID: 'MC12345',
      JAZZCASH_PASSWORD: 'merchant-password',
      JAZZCASH_INTEGRITY_SALT: SALT,
      JAZZCASH_RETURN_URL: 'https://api.example.com/api/v1/payments/jazzcash/return',
      ...extraEnv,
    },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim().split('\n').pop());
}

test('checkout payload is complete, signed and carries no more than it must', () => {
  const out = runConfigured(`
    const jazz = require('./src/services/jazzcash.service');
    const fields = jazz.buildCheckoutFields({
      payment: { amount: 2499.5 },
      order: { orderNumber: 'PH-000123' },
      txnRef: 'T2026102101000000001',
      now: new Date('2026-10-20T20:00:00Z'),
    });
    console.log(JSON.stringify({
      fields,
      valid: jazz.verifyResponseHash(fields, '${SALT}'),
    }));
  `);

  const f = out.fields;

  assert.equal(out.valid, true, 'payload must verify against its own signature');
  assert.equal(f.pp_Amount, '249950');
  assert.equal(f.pp_TxnCurrency, 'PKR');
  assert.equal(f.pp_BillReference, 'PH000123');
  assert.equal(f.pp_MerchantID, 'MC12345');
  assert.equal(f.pp_TxnDateTime, '20261021010000');
  assert.equal(f.pp_TxnExpiryDateTime, '20261021020000');
  assert.equal(f.pp_ReturnURL, 'https://api.example.com/api/v1/payments/jazzcash/return');
  assert.equal(f.pp_TxnRefNo, 'T2026102101000000001');
  assert.ok(!JSON.stringify(f).includes(SALT), 'integrity salt must never be sent to the browser');
});

test('return handler rejects unsigned or tampered callbacks before touching the database', () => {
  const out = runConfigured(`
    const jazz = require('./src/services/jazzcash.service');
    (async () => {
      const results = [];
      for (const body of [
        {},
        { pp_ResponseCode: '000', pp_TxnRefNo: 'T1', pp_Amount: '100' },
        { pp_ResponseCode: '000', pp_TxnRefNo: 'T1', pp_Amount: '100', pp_SecureHash: 'FORGED' },
      ]) {
        try { await jazz.handleReturn(body); results.push('accepted'); }
        catch (e) { results.push(e.code); }
      }
      console.log(JSON.stringify(results));
    })();
  `);

  assert.deepEqual(out, ['JAZZCASH_INVALID_SIGNATURE', 'JAZZCASH_INVALID_SIGNATURE', 'JAZZCASH_INVALID_SIGNATURE']);
});

test('without credentials JazzCash refuses to operate', () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
      const jazz = require('./src/services/jazzcash.service');
      Promise.allSettled([jazz.initiate({ orderId: 'x' }), jazz.handleReturn({})]).then((r) =>
        console.log(JSON.stringify(r.map((x) => x.reason && x.reason.code))));
    `,
    ],
    {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'test' },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').pop()), [
    'JAZZCASH_NOT_CONFIGURED',
    'JAZZCASH_NOT_CONFIGURED',
  ]);
});

test('live mode demands an explicit checkout URL', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JAZZCASH_ENV: 'live',
      JAZZCASH_MERCHANT_ID: 'MC1',
      JAZZCASH_PASSWORD: 'p',
      JAZZCASH_INTEGRITY_SALT: 's',
      JAZZCASH_RETURN_URL: 'https://api.example.com/r',
    },
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JAZZCASH_CHECKOUT_URL is required/);
});
