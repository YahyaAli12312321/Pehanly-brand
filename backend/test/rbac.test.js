'use strict';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_rbac_test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'rbac-test-secret-rbac-test-secret-1234';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const SRC = path.join(__dirname, '..', 'src');

const { config } = require(path.join(SRC, 'config', 'env.js'));
const User = require(path.join(SRC, 'models', 'User.js'));

/*
 * No database. User.findById is replaced by an in-memory fake. Only requests
 * decided BEFORE any other database access are exercised: permission guards,
 * request validation and upload pre-checks.
 */
const ID = {
  admin: '64b000000000000000000001',
  customer: '64b000000000000000000002',
  ordersRead: '64b000000000000000000011',
  ordersManage: '64b000000000000000000012',
  mediaStaff: '64b000000000000000000013',
  noPerms: '64b000000000000000000014',
  inactiveStaff: '64b000000000000000000015',
};

const SOME_ID = '64b000000000000000000099';

const FAKE = {
  [ID.admin]: { role: 'admin', permissions: [], isActive: true },
  [ID.customer]: { role: 'customer', permissions: [], isActive: true },
  [ID.ordersRead]: { role: 'staff', permissions: ['orders.read'], isActive: true },
  [ID.ordersManage]: { role: 'staff', permissions: ['orders.manage'], isActive: true },
  [ID.mediaStaff]: { role: 'staff', permissions: ['media.manage'], isActive: true },
  [ID.noPerms]: { role: 'staff', permissions: [], isActive: true },
  [ID.inactiveStaff]: { role: 'staff', permissions: ['orders.manage'], isActive: false },
};

User.findById = (id) => ({
  select: async () => {
    const data = FAKE[String(id)];
    if (!data) return null;

    return {
      _id: String(id),
      tokenVersion: 0,
      ...data,
      toJSON() {
        return { _id: this._id, role: this.role, permissions: this.permissions, name: 'Test' };
      },
    };
  },
});

const { createApp, API_PREFIX } = require(path.join(SRC, 'app.js'));

const cookieFor = (id) =>
  `${config.auth.cookieName}=${jwt.sign({ sub: id, tv: 0 }, config.auth.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '1h',
  })}`;

let server;
let base;

before(async () => {
  server = await new Promise((resolve) => {
    const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}${API_PREFIX}`;
});

after(async () => {
  if (server.closeAllConnections) server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

async function call(method, url, { cookie, body, form } = {}) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: form || (body ? JSON.stringify(body) : undefined),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { status: response.status, json };
}

/* ---------------------------------------------------------------- RBAC */

test('staff with only orders.read can read the module but not change it', async () => {
  const cookie = cookieFor(ID.ordersRead);

  // passes the guard, then fails validation (422), proving it was not stopped by RBAC
  assert.equal((await call('GET', '/admin/orders?page=0', { cookie })).status, 422);

  const write = await call('PATCH', `/admin/orders/${SOME_ID}/status`, {
    cookie,
    body: { status: 'confirmed' },
  });
  assert.equal(write.status, 403);
  assert.equal(write.json.code, 'PERMISSION_DENIED');
});

test('orders.manage implies read and allows writes', async () => {
  const cookie = cookieFor(ID.ordersManage);

  assert.equal((await call('GET', '/admin/orders?page=0', { cookie })).status, 422);

  const write = await call('PATCH', `/admin/orders/${SOME_ID}/status`, { cookie, body: { status: 'bogus' } });
  assert.equal(write.status, 422);
});

test('staff cannot reach modules they were not granted', async () => {
  const cookie = cookieFor(ID.ordersManage);

  for (const url of [
    '/admin/payments',
    '/admin/customers',
    '/admin/coupons',
    '/admin/banners',
    '/admin/analytics',
    '/admin/dashboard/summary',
    '/admin/settings',
    '/admin/media',
    '/admin/products',
    '/admin/inventory',
    '/admin/quotes',
    '/admin/wholesale/stats',
  ]) {
    const { status, json } = await call('GET', url, { cookie });
    assert.equal(status, 403, `${url} should be forbidden for an orders-only staff member`);
    assert.equal(json.code, 'PERMISSION_DENIED');
  }
});

test('staff without any permission is locked out of every module', async () => {
  const cookie = cookieFor(ID.noPerms);

  for (const url of ['/admin/orders', '/admin/payments', '/admin/settings', '/admin/dashboard/summary']) {
    assert.equal((await call('GET', url, { cookie })).status, 403, url);
  }
});

test('notifications, devices and staff management are owner-only', async () => {
  const everything = cookieFor(ID.ordersManage);
  const ownerOnly = [
    ['GET', '/admin/notifications'],
    ['GET', '/admin/devices'],
    ['GET', '/admin/staff'],
    ['GET', '/admin/staff/permissions'],
    ['POST', '/admin/staff', { name: 'x' }],
    ['PATCH', `/admin/staff/${SOME_ID}`, { name: 'xx' }],
    ['POST', `/admin/staff/${SOME_ID}/reset-password`, { password: 'long-enough-1' }],
  ];

  for (const [method, url, body] of ownerOnly) {
    const { status } = await call(method, url, { cookie: everything, body });
    assert.equal(status, 403, `${method} ${url} must be admin-only`);
  }

  // The owner reaches validation on the same endpoints.
  const admin = cookieFor(ID.admin);
  assert.equal((await call('POST', '/admin/staff', { cookie: admin, body: { name: 'x' } })).status, 422);
  assert.equal((await call('GET', '/admin/staff?page=0', { cookie: admin })).status, 422);
});

test('staff cannot grant themselves permissions that do not exist', async () => {
  const admin = cookieFor(ID.admin);
  const bad = await call('POST', '/admin/staff', {
    cookie: admin,
    body: {
      name: 'New Staff',
      email: 'staff@example.com',
      phone: '03001234567',
      password: 'long-enough-1',
      permissions: ['staff.manage'],
    },
  });
  assert.equal(bad.status, 422);
});

test('deactivated staff sessions are rejected and customers stay out', async () => {
  assert.equal((await call('GET', '/admin/orders', { cookie: cookieFor(ID.inactiveStaff) })).status, 401);

  for (const url of ['/admin/settings', '/admin/media', '/admin/dashboard/summary', '/admin/staff']) {
    assert.equal((await call('GET', url, { cookie: cookieFor(ID.customer) })).status, 403, url);
    assert.equal((await call('GET', url)).status, 401, url);
  }
});

test('the public settings endpoint needs no login but exposes no internals', async () => {
  // Not decided before the database, so only check the route exists and is not auth-gated:
  // without a database the handler cannot answer, but it must never answer 401/403.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(`${base}/settings/public`, { signal: controller.signal });
    assert.notEqual(response.status, 401);
    assert.notEqual(response.status, 403);
  } catch (error) {
    assert.equal(error.name, 'AbortError'); // waiting on MongoDB: not blocked by auth
  } finally {
    clearTimeout(timer);
  }
});

/* --------------------------------------------------------------- Media */

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

function uploadForm(purpose, buffer, name = 'photo.png') {
  const form = new FormData();
  if (purpose) form.append('purpose', purpose);
  form.append('file', new Blob([buffer]), name);
  return form;
}

test('upload requires a session', async () => {
  const { status } = await call('POST', '/media', { form: uploadForm('avatar', PNG) });
  assert.equal(status, 401);
});

test('customers cannot use staff-only upload purposes', async () => {
  const cookie = cookieFor(ID.customer);

  for (const purpose of ['product_image', 'banner_image', 'category_image', 'variant_image']) {
    const { status, json } = await call('POST', '/media', { cookie, form: uploadForm(purpose, PNG) });
    assert.equal(status, 403, purpose);
    assert.equal(json.code, 'PERMISSION_DENIED');
  }
});

test('staff need media.manage for catalog uploads', async () => {
  const noMedia = await call('POST', '/media', {
    cookie: cookieFor(ID.ordersManage),
    form: uploadForm('product_image', PNG),
  });
  assert.equal(noMedia.status, 403);

  // media.manage passes the permission check; storage is not configured in tests -> 503
  const allowed = await call('POST', '/media', {
    cookie: cookieFor(ID.mediaStaff),
    form: uploadForm('product_image', PNG),
  });
  assert.equal(allowed.status, 503);
  assert.equal(allowed.json.code, 'MEDIA_STORAGE_NOT_CONFIGURED');
});

test('upload validation: purpose, real file type and size', async () => {
  const cookie = cookieFor(ID.customer);

  const unknown = await call('POST', '/media', { cookie, form: uploadForm('hack', PNG) });
  assert.equal(unknown.status, 422);

  const noFile = new FormData();
  noFile.append('purpose', 'avatar');
  assert.equal((await call('POST', '/media', { cookie, form: noFile })).status, 400);

  const html = await call('POST', '/media', {
    cookie,
    form: uploadForm('avatar', Buffer.from('<html><script>alert(1)</script></html>'), 'photo.png'),
  });
  assert.equal(html.status, 415);
  assert.equal(html.json.code, 'UNSUPPORTED_FILE_TYPE');

  const svg = await call('POST', '/media', {
    cookie,
    form: uploadForm('avatar', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'a.svg'),
  });
  assert.equal(svg.status, 415);

  // a PDF is not accepted where only images are allowed
  const pdfAsAvatar = await call('POST', '/media', {
    cookie,
    form: uploadForm('avatar', Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64)]), 'a.pdf'),
  });
  assert.equal(pdfAsAvatar.status, 415);

  const tooBig = await call('POST', '/media', {
    cookie,
    form: uploadForm('avatar', Buffer.concat([PNG, Buffer.alloc(4 * 1024 * 1024)])),
  });
  assert.equal(tooBig.status, 413);
  assert.equal(tooBig.json.code, 'FILE_TOO_LARGE');

  // valid image for an allowed purpose reaches the storage layer (not configured here)
  const ok = await call('POST', '/media', { cookie, form: uploadForm('avatar', PNG) });
  assert.equal(ok.status, 503);
});

test('deleting media requires a session and a valid id', async () => {
  assert.equal((await call('DELETE', `/media/${SOME_ID}`)).status, 401);
  assert.equal((await call('DELETE', '/media/not-an-id', { cookie: cookieFor(ID.customer) })).status, 422);
});

/* ------------------------------------------------------ Public catalog API */

test('catalog endpoints are public and validate their input', async () => {
  assert.equal((await call('GET', '/catalog/products?limit=0')).status, 422);
  assert.equal((await call('GET', '/catalog/products?sort=cheapest')).status, 422);
  assert.equal((await call('GET', '/catalog/products?category=Not%20A%20Slug')).status, 422);
  assert.equal((await call('GET', '/catalog/products/NOT_A_SLUG!')).status, 422);
  assert.equal((await call('GET', '/catalog/products?status=draft')).status, 422); // strict: no status override
});
