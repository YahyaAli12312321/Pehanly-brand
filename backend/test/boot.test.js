'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_boot_test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'boot-test-secret-boot-test-secret-1234';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

function listJsFiles(dir) {
  const out = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...listJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }

  return out;
}

test('obsolete duplicate files are not present', () => {
  const forbidden = [
    'src/models/Order.js',
    'src/services/counter.service.js',
    'src/middleware/rateLimit.js',
    // Unmounted duplicates of the admin order flow that bypassed the stock lifecycle.
    'src/services/adminOrder.service.js',
    'src/controllers/adminOrder.controller.js',
    'src/validators/adminOrder.validators.js',
  ];

  const present = forbidden.filter((rel) => fs.existsSync(path.join(ROOT, rel)));

  assert.deepEqual(present, [], `Delete obsolete duplicates: ${present.join(', ')}`);
});

test('every module under src loads without error', () => {
  const failures = [];

  for (const file of listJsFiles(SRC).sort()) {
    try {
      require(file);
    } catch (err) {
      failures.push(`${path.relative(ROOT, file)}: ${String(err.message).split('\n')[0]}`);
    }
  }

  assert.deepEqual(failures, []);
});

test('app boots, serves /api/v1/health and returns JSON 404s', async () => {
  const { createApp, API_PREFIX } = require(path.join(SRC, 'app.js'));
  const app = createApp();

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}${API_PREFIX}`;

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);

    const healthBody = await health.json();
    assert.equal(healthBody.success, true);
    assert.equal(healthBody.data.status, 'ok');

    const missing = await fetch(`${base}/definitely-not-a-route`);
    assert.equal(missing.status, 404);

    const missingBody = await missing.json();
    assert.equal(missingBody.code, 'ROUTE_NOT_FOUND');
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
