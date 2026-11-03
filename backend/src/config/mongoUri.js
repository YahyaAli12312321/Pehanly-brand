'use strict';

/*
 * Single source of truth for choosing the MongoDB connection string.
 *
 * - development / production : MONGODB_URI
 * - test                     : MONGODB_TEST_URI ONLY. MONGODB_URI is never used and
 *                              never a fallback, so tests cannot touch the real database.
 *
 * Safety rules in test mode:
 *   1. MONGODB_TEST_URI must be set.
 *   2. Its database name must contain "test".
 *   3. It must not be the same database as MONGODB_URI. If MONGODB_URI names no database,
 *      MongoDB uses the database called "test", which counts as the same database.
 *
 * This module has no dependencies on the other config files, so env.js and db.js can both use it.
 */

const SCHEME = /^mongodb(?:\+srv)?:\/\//i;

class MongoConfigError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'MongoConfigError';
    this.code = code;
  }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Database name from a connection string; '' when none is given. */
function databaseName(uri) {
  const withoutScheme = clean(uri).replace(SCHEME, '');
  const slash = withoutScheme.indexOf('/');

  if (slash === -1) return '';

  const rest = withoutScheme.slice(slash + 1);
  const query = rest.indexOf('?');
  const name = query === -1 ? rest : rest.slice(0, query);

  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/** MongoDB falls back to the database named "test" when the URI names none. */
function effectiveDatabaseName(uri) {
  return databaseName(uri) || 'test';
}

/** "host/database" without credentials; safe for logs and error messages. */
function describeTarget(uri) {
  const withoutScheme = clean(uri).replace(SCHEME, '');
  const authority = withoutScheme.split('/')[0];
  const host = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;

  return `${host}/${databaseName(uri) || '(default: test)'}`;
}

/*
 * True when the URI still contains the example values from .env.example
 * (USER:PASSWORD@CLUSTER.mongodb.net), so a copied template fails immediately
 * with a clear message instead of a DNS error ten seconds later.
 */
function hasPlaceholder(uri) {
  const withoutScheme = clean(uri).replace(SCHEME, '');
  const authority = withoutScheme.split('/')[0];
  const at = authority.lastIndexOf('@');
  const host = (at === -1 ? authority : authority.slice(at + 1)).toLowerCase();
  const credentials = at === -1 ? '' : authority.slice(0, at);

  return (
    host === 'cluster.mongodb.net' ||
    /^your[-_]/.test(host) ||
    /[<>]/.test(authority) ||
    credentials === 'USER:PASSWORD' ||
    /^(USERNAME|USER):(PASSWORD|YOUR_PASSWORD)$/.test(credentials)
  );
}

function resolveMongoUri(source = process.env) {
  const isTest = clean(source.NODE_ENV) === 'test';
  const mainUri = clean(source.MONGODB_URI);

  if (!isTest) {
    if (!mainUri) {
      throw new MongoConfigError('MONGODB_URI is missing in .env', 'MONGODB_URI_MISSING');
    }

    if (hasPlaceholder(mainUri)) {
      throw new MongoConfigError(
        'MONGODB_URI still contains the example values from .env.example (USER:PASSWORD@CLUSTER.mongodb.net). ' +
          'Paste your real Atlas connection string (Atlas > Connect > Drivers).',
        'MONGODB_URI_PLACEHOLDER',
      );
    }

    return mainUri;
  }

  const testUri = clean(source.MONGODB_TEST_URI);

  if (!testUri) {
    throw new MongoConfigError(
      'MONGODB_TEST_URI is missing. Tests never use MONGODB_URI. Add MONGODB_TEST_URI to .env, pointing at a ' +
        'dedicated test database (the database name must contain "test", for example .../pehanly_test).',
      'MONGODB_TEST_URI_MISSING',
    );
  }

  if (!SCHEME.test(testUri)) {
    throw new MongoConfigError(
      'MONGODB_TEST_URI must start with mongodb:// or mongodb+srv://',
      'MONGODB_TEST_URI_INVALID',
    );
  }

  if (hasPlaceholder(testUri)) {
    throw new MongoConfigError(
      'MONGODB_TEST_URI still contains the example values from .env.example (USER:PASSWORD@CLUSTER.mongodb.net). ' +
        'Set it to your real Atlas connection string with a dedicated test database, ' +
        'for example mongodb+srv://<user>:<password>@<your-cluster-host>/pehanly_test?retryWrites=true&w=majority',
      'MONGODB_TEST_URI_PLACEHOLDER',
    );
  }

  const testDb = databaseName(testUri);

  if (!/test/i.test(testDb)) {
    throw new MongoConfigError(
      `MONGODB_TEST_URI must name a database containing "test" (found "${testDb || 'none'}"). ` +
        'Example: mongodb+srv://user:pass@cluster/pehanly_test?retryWrites=true&w=majority',
      'TEST_DB_UNSAFE',
    );
  }

  if (mainUri && effectiveDatabaseName(mainUri).toLowerCase() === testDb.toLowerCase()) {
    throw new MongoConfigError(
      `MONGODB_TEST_URI uses database "${testDb}", the same database as MONGODB_URI. ` +
        'Use a separate database for tests.',
      'TEST_DB_SAME_AS_MAIN',
    );
  }

  return testUri;
}

/** Final check after connecting: in test mode the live database must be a test database. */
function assertSafeConnectionName(connectionName, source = process.env) {
  if (clean(source.NODE_ENV) !== 'test') return;

  const name = String(connectionName || '');

  if (!/test/i.test(name)) {
    throw new MongoConfigError(
      `Refusing to run tests against database "${name}": the name must contain "test".`,
      'TEST_DB_UNSAFE',
    );
  }

  const mainUri = clean(source.MONGODB_URI);

  if (mainUri && effectiveDatabaseName(mainUri).toLowerCase() === name.toLowerCase()) {
    throw new MongoConfigError(
      `Refusing to run tests against database "${name}": it is the same database as MONGODB_URI.`,
      'TEST_DB_SAME_AS_MAIN',
    );
  }
}

module.exports = {
  MongoConfigError,
  resolveMongoUri,
  assertSafeConnectionName,
  databaseName,
  effectiveDatabaseName,
  describeTarget,
  hasPlaceholder,
};
