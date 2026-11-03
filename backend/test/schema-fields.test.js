'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_schema_test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'schema-test-secret-schema-test-secret-123';

/*
 * Mongoose runs in strict mode: a field that a service writes but the schema does not declare is
 * SILENTLY DROPPED. (This is how the Printing request lost garmentSource / garmentDetails / colors.)
 * This test reads every `Model.create({...})` / `Model.insertMany([{...}])` object literal in
 * src/services and fails when a top-level key is not a path of that model's schema.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const SRC = path.join(__dirname, '..', 'src');

for (const file of fs.readdirSync(path.join(SRC, 'models'))) require(path.join(SRC, 'models', file));

const declared = {};

for (const [name, model] of Object.entries(mongoose.models)) {
  declared[name] = new Set(
    Object.keys(model.schema.paths).map((p) => p.split('.')[0]).concat(['_id', 'createdAt', 'updatedAt', '__v']),
  );
}

/** Top-level entries of the object literal that starts at source[start] === '{'. */
function topLevelEntries(source, start) {
  const entries = [];
  let depth = 0;
  let current = '';
  let quote = null;

  for (let i = start; i < source.length; i += 1) {
    const c = source[i];

    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '/' && source[i + 1] === '/') { while (i < source.length && source[i] !== '\n') i += 1; continue; }
    if (c === '/' && source[i + 1] === '*') { i = source.indexOf('*/', i) + 1; continue; }

    if (c === '{' || c === '[' || c === '(') {
      depth += 1;
      if (depth === 1) { current = ''; continue; }
    }

    if (c === '}' || c === ']' || c === ')') {
      depth -= 1;

      if (depth === 0) {
        if (current.trim()) entries.push(current.trim());

        return entries;
      }
    }

    if (depth === 1) {
      if (c === ',') {
        if (current.trim()) entries.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
  }

  return entries;
}

test('services never write fields that the schema does not declare', () => {
  const problems = [];

  for (const file of fs.readdirSync(path.join(SRC, 'services')).filter((f) => f.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(SRC, 'services', file), 'utf8');
    const pattern = /\b([A-Z][A-Za-z]+)\.(?:create|insertMany)\(\s*\[?\s*(\{)/g;
    let match;

    while ((match = pattern.exec(source))) {
      const model = match[1];

      if (!declared[model]) continue;

      const keys = topLevelEntries(source, match.index + match[0].length - 1)
        .map((entry) => entry.match(/^(\.\.\.)?\s*['"]?([A-Za-z_$][\w$]*)/))
        .filter((m) => m && !m[1])
        .map((m) => m[2]);

      const unknown = keys.filter((key) => !declared[model].has(key));

      if (unknown.length) problems.push(`${file}: ${model} is given unknown field(s) ${unknown.join(', ')}`);
    }
  }

  assert.deepEqual(problems, []);
});
