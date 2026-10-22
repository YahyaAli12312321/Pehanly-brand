'use strict';

/*
 * The Postman collection is generated from the live router and Zod schemas.
 * This test fails when a new route gets no folder, or when a generated example
 * body stops passing its own validator.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('postman generator covers every route and every example validates', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'generate-postman.js')], {
    encoding: 'utf8',
    env: { ...process.env, LOG_LEVEL: 'silent' },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /validation problems: 0/);

  const match = result.stdout.match(/routes: (\d+), requests written: (\d+)/);

  assert.ok(match, result.stdout);
  assert.equal(match[1], match[2]);
});
