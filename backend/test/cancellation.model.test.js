'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CancellationRequest = require(path.join(__dirname, '..', 'src', 'models', 'CancellationRequest.js'));

test('CancellationRequest has no duplicate or conflicting indexes', () => {
  const indexes = CancellationRequest.schema.indexes();

  const keys = indexes.map(([fields]) => JSON.stringify(fields));
  assert.equal(new Set(keys).size, keys.length, `Duplicate index keys: ${keys.join(', ')}`);

  const names = indexes.map(([, options]) => options && options.name).filter(Boolean);
  assert.equal(new Set(names).size, names.length);
});

test('one pending cancellation per order is enforced by a unique partial index', () => {
  const unique = CancellationRequest.schema
    .indexes()
    .find(([, options]) => options && options.name === 'unique_pending_cancellation_per_order');

  assert.ok(unique, 'unique partial index is missing');
  assert.deepEqual(unique[0], { order: 1 });
  assert.equal(unique[1].unique, true);
  assert.deepEqual(unique[1].partialFilterExpression, { status: 'pending' });
});
