'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_boot_test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'boot-test-secret-boot-test-secret-1234';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

/*
 * 1. Replace the counter with a recorder BEFORE any service is loaded,
 *    so number services can be checked without a database.
 */
const counterPath = require.resolve(path.join(SRC, 'services', 'counter.services.js'));
require(counterPath);

const counterCalls = [];

require.cache[counterPath].exports = {
  nextSequence: async (key, options) => {
    counterCalls.push({ key, options });
    return 7;
  },
};

/*
 * 2. Wrap validate() BEFORE any route is loaded, to detect schemas that are
 *    undefined (a route importing a validator name that does not exist).
 */
const validatePath = require.resolve(path.join(SRC, 'middleware', 'validate.js'));
const realValidate = require(validatePath);
const undefinedSchemas = [];

function recordingValidate(schemas) {
  for (const part of Object.keys(schemas || {})) {
    if (schemas[part] === undefined) {
      const origin =
        (new Error().stack || '')
          .split('\n')
          .find((line) => line.includes(`${path.sep}routes${path.sep}`)) || 'unknown route file';

      undefinedSchemas.push(`${part}: ${origin.trim()}`);
    }
  }

  return realValidate(schemas);
}

recordingValidate.validate = recordingValidate;
require.cache[validatePath].exports = recordingValidate;

test('validate is exported as a function and as .validate', () => {
  assert.equal(typeof realValidate, 'function');
  assert.equal(typeof realValidate.validate, 'function');
});

test('number services use the canonical counter and pass the session through', async () => {
  const { nextManufacturingRequestNumber } = require(path.join(SRC, 'services', 'manufacturingNumber.service.js'));
  const { nextQuoteNumber } = require(path.join(SRC, 'services', 'quoteNumber.service.js'));
  const { nextPrintingRequestNumber } = require(path.join(SRC, 'services', 'printingNumber.service.js'));
  const { nextWholesaleRequestNumber } = require(path.join(SRC, 'services', 'wholesaleNumber.service.js'));

  const fakeSession = { id: 'fake-session' };
  counterCalls.length = 0;

  assert.equal(await nextManufacturingRequestNumber(fakeSession), 'MF-000007');
  assert.equal(await nextQuoteNumber(fakeSession), 'QT-000007');
  assert.equal(await nextPrintingRequestNumber(fakeSession), 'PR-000007');
  assert.equal(await nextWholesaleRequestNumber(fakeSession), 'WH-000007');

  assert.deepEqual(
    counterCalls.map((call) => call.key),
    ['manufacturing_request', 'quote', 'printing_request', 'wholesale_request'],
  );

  assert.ok(counterCalls.every((call) => call.options.session === fakeSession));

  assert.equal(await nextQuoteNumber(), 'QT-000007');
});

test('every route validator schema is defined', () => {
  require(path.join(SRC, 'routes', 'index.js'));

  assert.deepEqual(undefinedSchemas, []);
});
