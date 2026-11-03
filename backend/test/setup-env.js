'use strict';

const path = require('path');

// Force test mode before anything else can read NODE_ENV.
process.env.NODE_ENV = 'test';

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { resolveMongoUri, describeTarget } = require('../src/config/mongoUri');

let uri;

try {
  uri = resolveMongoUri(process.env);
} catch (error) {
  process.stderr.write(`\n[test setup] ${error.message}\n\n`);
  process.exit(1);
}

// Print once (the parent process), not in every test file's child process.
if (!process.env.NODE_TEST_CONTEXT) {
  process.stderr.write(`[test setup] Integration tests use MongoDB database: ${describeTarget(uri)}\n`);
}
