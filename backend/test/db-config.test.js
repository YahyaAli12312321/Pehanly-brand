'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_TEST_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/pehanly_dbconfig_test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dbconfig-test-secret-dbconfig-test-1234';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src', 'config');
const {
  resolveMongoUri,
  assertSafeConnectionName,
  databaseName,
  effectiveDatabaseName,
  describeTarget,
} = require(path.join(SRC, 'mongoUri.js'));
const { loadEnv } = require(path.join(SRC, 'env.js'));

const PROD = 'mongodb+srv://user:p%40ss@cluster0.abc.mongodb.net/pehanly?retryWrites=true&w=majority';
const TEST = 'mongodb+srv://user:p%40ss@cluster0.abc.mongodb.net/pehanly_test?retryWrites=true&w=majority';

test('database names are parsed from connection strings', () => {
  assert.equal(databaseName(PROD), 'pehanly');
  assert.equal(databaseName('mongodb://127.0.0.1:27017'), '');
  assert.equal(databaseName('mongodb://127.0.0.1:27017/'), '');
  assert.equal(databaseName('mongodb+srv://u:p@c.net/?retryWrites=true'), '');
  assert.equal(effectiveDatabaseName('mongodb://127.0.0.1:27017'), 'test');
});

test('describeTarget never exposes credentials', () => {
  const described = describeTarget(PROD);

  assert.equal(described, 'cluster0.abc.mongodb.net/pehanly');
  assert.ok(!described.includes('user'));
  assert.ok(!described.includes('p%40ss'));
});

test('development and production use MONGODB_URI', () => {
  assert.equal(resolveMongoUri({ NODE_ENV: 'development', MONGODB_URI: PROD, MONGODB_TEST_URI: TEST }), PROD);
  assert.equal(resolveMongoUri({ NODE_ENV: 'production', MONGODB_URI: PROD }), PROD);
  assert.throws(() => resolveMongoUri({ NODE_ENV: 'development' }), /MONGODB_URI is missing/);
});

test('test mode uses MONGODB_TEST_URI only and never falls back to MONGODB_URI', () => {
  assert.equal(resolveMongoUri({ NODE_ENV: 'test', MONGODB_URI: PROD, MONGODB_TEST_URI: TEST }), TEST);
  assert.equal(resolveMongoUri({ NODE_ENV: 'test', MONGODB_TEST_URI: TEST }), TEST);

  assert.throws(
    () => resolveMongoUri({ NODE_ENV: 'test', MONGODB_URI: PROD }),
    (error) => error.code === 'MONGODB_TEST_URI_MISSING' && /MONGODB_TEST_URI is missing/.test(error.message),
  );
  assert.throws(() => resolveMongoUri({ NODE_ENV: 'test', MONGODB_URI: PROD, MONGODB_TEST_URI: '   ' }), /MONGODB_TEST_URI is missing/);
});

test('test database must be clearly a test database and different from production', () => {
  assert.throws(
    () => resolveMongoUri({ NODE_ENV: 'test', MONGODB_TEST_URI: PROD }),
    (error) => error.code === 'TEST_DB_UNSAFE',
  );
  assert.throws(
    () => resolveMongoUri({ NODE_ENV: 'test', MONGODB_TEST_URI: 'mongodb://127.0.0.1:27017' }),
    (error) => error.code === 'TEST_DB_UNSAFE',
  );
  assert.throws(() => resolveMongoUri({ NODE_ENV: 'test', MONGODB_TEST_URI: 'http://example.com/test' }), /must start with mongodb/);

  // Production URI without a database name means database "test": a test URI named "test" would hit it.
  assert.throws(
    () => resolveMongoUri({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017', MONGODB_TEST_URI: 'mongodb://127.0.0.1:27017/test' }),
    (error) => error.code === 'TEST_DB_SAME_AS_MAIN',
  );
  assert.throws(
    () => resolveMongoUri({ NODE_ENV: 'test', MONGODB_URI: TEST, MONGODB_TEST_URI: TEST }),
    (error) => error.code === 'TEST_DB_SAME_AS_MAIN',
  );
});

test('post-connect check refuses a non-test database in test mode only', () => {
  const env = { NODE_ENV: 'test', MONGODB_URI: PROD };

  assert.doesNotThrow(() => assertSafeConnectionName('pehanly_test', env));
  assert.throws(() => assertSafeConnectionName('pehanly', env), /must contain "test"/);
  assert.throws(() => assertSafeConnectionName('test', { NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017' }), /same database/);
  assert.doesNotThrow(() => assertSafeConnectionName('pehanly', { NODE_ENV: 'development', MONGODB_URI: PROD }));
});

function runLoadEnv(overrides) {
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
    return { config: loadEnv({
      CORS_ORIGINS: 'http://localhost:5173',
      CLIENT_URL: 'http://localhost:5173',
      JWT_SECRET: 'a-sufficiently-long-random-secret-0123456789',
      ...overrides,
    }) };
  } catch (error) {
    if (String(error.message).startsWith('EXIT:')) return { failure: written };
    throw error;
  } finally {
    process.exit = realExit;
    process.stderr.write = realWrite;
  }
}

test('config.mongo.uri follows the mode', () => {
  assert.equal(runLoadEnv({ NODE_ENV: 'development', MONGODB_URI: PROD }).config.mongo.uri, PROD);
  assert.equal(runLoadEnv({ NODE_ENV: 'test', MONGODB_URI: PROD, MONGODB_TEST_URI: TEST }).config.mongo.uri, TEST);
  assert.equal(runLoadEnv({ NODE_ENV: 'test', MONGODB_TEST_URI: TEST }).config.mongo.uri, TEST);

  assert.match(runLoadEnv({ NODE_ENV: 'test', MONGODB_URI: PROD }).failure, /MONGODB_TEST_URI is missing/);
  assert.match(runLoadEnv({ NODE_ENV: 'test', MONGODB_TEST_URI: PROD }).failure, /containing "test"/);
  assert.match(runLoadEnv({ NODE_ENV: 'development' }).failure, /MONGODB_URI is missing/);
});

test('example values copied from .env.example are rejected immediately', () => {
  const TEMPLATE_TEST = 'mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/pehanly_test?retryWrites=true&w=majority';
  const TEMPLATE_MAIN = 'mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/pehanly?retryWrites=true&w=majority';

  assert.throws(
    () => resolveMongoUri({ NODE_ENV: 'test', MONGODB_URI: PROD, MONGODB_TEST_URI: TEMPLATE_TEST }),
    (error) => error.code === 'MONGODB_TEST_URI_PLACEHOLDER',
  );
  assert.throws(
    () => resolveMongoUri({ NODE_ENV: 'development', MONGODB_URI: TEMPLATE_MAIN }),
    (error) => error.code === 'MONGODB_URI_PLACEHOLDER',
  );
  assert.throws(
    () => resolveMongoUri({ NODE_ENV: 'test', MONGODB_TEST_URI: 'mongodb+srv://<user>:<pw>@x.mongodb.net/pehanly_test' }),
    (error) => error.code === 'MONGODB_TEST_URI_PLACEHOLDER',
  );
  // A real-looking cluster host is fine.
  assert.equal(resolveMongoUri({ NODE_ENV: 'test', MONGODB_URI: PROD, MONGODB_TEST_URI: TEST }), TEST);
});
