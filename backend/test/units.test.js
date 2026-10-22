'use strict';

process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-unit-test-secret-1234';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_unit_test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const load = (...p) => require(path.join(SRC, ...p));

/* ------------------------------------------------------------ Permissions */

test('hasPermission: manage implies read, read does not imply manage', () => {
  const { hasPermission } = load('constants', 'Permissions.js');

  assert.equal(hasPermission(['orders.manage'], 'orders.read'), true);
  assert.equal(hasPermission(['orders.manage'], 'orders.manage'), true);
  assert.equal(hasPermission(['orders.read'], 'orders.manage'), false);
  assert.equal(hasPermission(['orders.read'], 'payments.read'), false);
  assert.equal(hasPermission([], 'orders.read'), false);
  assert.equal(hasPermission(undefined, 'orders.read'), false);
});

test('permission catalog has no staff/notification permissions to hand out', () => {
  const { PERMISSIONS, ROLE_TEMPLATES } = load('constants', 'Permissions.js');

  assert.ok(PERMISSIONS.length > 10);
  assert.ok(!PERMISSIONS.some((p) => p.startsWith('staff.') || p.startsWith('notifications.')));

  for (const [name, list] of Object.entries(ROLE_TEMPLATES)) {
    for (const permission of list) {
      assert.ok(PERMISSIONS.includes(permission), `${name} template uses unknown permission ${permission}`);
    }
  }
});

/* ------------------------------------------------------------- File sniff */

test('sniffFileType recognises real images/PDF and rejects scriptable formats', () => {
  const { sniffFileType } = load('utils', 'fileSniff.js');
  const pad = Buffer.alloc(32);

  assert.equal(sniffFileType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), pad])).mime, 'image/jpeg');
  assert.equal(
    sniffFileType(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pad])).mime,
    'image/png',
  );
  assert.equal(
    sniffFileType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), pad])).mime,
    'image/webp',
  );
  assert.equal(sniffFileType(Buffer.concat([Buffer.from('%PDF-1.4\n'), pad])).kind, 'document');

  assert.equal(sniffFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffFileType(Buffer.from('<html><script>alert(1)</script></html>')), null);
  assert.equal(sniffFileType(Buffer.concat([Buffer.from('MZ'), pad])), null);
  assert.equal(sniffFileType(Buffer.from('tiny')), null);
  assert.equal(sniffFileType(null), null);
});

/* ------------------------------------------------------------- Media URL */

test('isTrustedMediaUrl pins media to the configured Cloudinary account', () => {
  const { isTrustedMediaUrl } = load('validators', 'common.js');
  const cloudinary = { configured: true, cloudName: 'demo' };

  assert.equal(isTrustedMediaUrl('https://res.cloudinary.com/demo/image/upload/v1/a.png', cloudinary), true);
  assert.equal(isTrustedMediaUrl('https://res.cloudinary.com/other/image/upload/v1/a.png', cloudinary), false);
  assert.equal(isTrustedMediaUrl('https://evil.example.com/demo/a.png', cloudinary), false);
  assert.equal(isTrustedMediaUrl('http://res.cloudinary.com/demo/a.png', cloudinary), false);
  assert.equal(isTrustedMediaUrl('javascript:alert(1)', cloudinary), false);
  assert.equal(isTrustedMediaUrl('https://res.cloudinary.com.evil.com/demo/a.png', cloudinary), false);

  // development without Cloudinary: any http(s) URL, still never javascript:
  assert.equal(isTrustedMediaUrl('http://localhost/a.png', { configured: false }), true);
  assert.equal(isTrustedMediaUrl('javascript:alert(1)', { configured: false }), false);
});

test('media delivery helpers add automatic format/quality for images only', () => {
  const { _optimizedUrl } = load('services', 'media.service.js');

  assert.equal(
    _optimizedUrl('https://res.cloudinary.com/demo/image/upload/v1/a.png', 'image'),
    'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/a.png',
  );
  assert.equal(
    _optimizedUrl('https://res.cloudinary.com/demo/raw/upload/v1/a.pdf', 'raw'),
    'https://res.cloudinary.com/demo/raw/upload/v1/a.pdf',
  );
});

test('every upload purpose has a folder, kinds, limit and access level', () => {
  const { MEDIA_PURPOSES, MAX_UPLOAD_BYTES } = load('constants', 'Media.js');

  for (const [name, p] of Object.entries(MEDIA_PURPOSES)) {
    assert.ok(p.folder && !p.folder.includes('..'), `${name} folder`);
    assert.ok(p.kinds.length > 0, `${name} kinds`);
    assert.ok(['staff', 'customer'].includes(p.access), `${name} access`);
    assert.ok(p.maxBytes > 0 && p.maxBytes <= MAX_UPLOAD_BYTES, `${name} limit`);
  }
});

test('the reference scanner covers every model that stores a publicId', () => {
  const scanner = load('services', 'mediaReference.service.js');
  const found = scanner.referenceTargets().map((t) => `${t.model.modelName}.${t.path}`);

  for (const expected of [
    'Product.generalImages.publicId',
    'ProductVariant.images.publicId',
    'Category.image.publicId',
    'Banner.image.publicId',
    'User.avatar.publicId',
    'Order.items.image.publicId',
    'Order.items.printingArtwork.publicId',
    'ReturnRefundRequest.images.publicId',
    'Printing.artwork.publicId',
    'Manufacturing.media.publicId',
  ]) {
    assert.ok(found.includes(expected), `missing reference path ${expected}`);
  }

  assert.ok(!found.some((entry) => entry.startsWith('Media.')), 'Media registry must not reference itself');
});

/* ------------------------------------------------------- Order lifecycle */

function withStubs(fn) {
  const stockReservation = load('services', 'stockReservation.service.js');
  const couponService = load('services', 'coupon.service.js');
  const Payment = load('models', 'Payment.js');

  const original = {
    commitSku: stockReservation.commitSku,
    releaseSku: stockReservation.releaseSku,
    release: couponService.release,
    updateMany: Payment.updateMany,
  };

  const calls = { commit: [], release: [], coupon: [], payments: [] };

  stockReservation.commitSku = async (sku, qty) => {
    calls.commit.push([String(sku), qty]);
  };
  stockReservation.releaseSku = async (sku, qty) => {
    calls.release.push([String(sku), qty]);
    return { stockTransition: { before: { available: 1 }, after: { available: 1 + qty } } };
  };
  couponService.release = async (args) => {
    calls.coupon.push(args);
    return true;
  };
  Payment.updateMany = async (...args) => {
    calls.payments.push(args);
  };

  const restore = () => {
    stockReservation.commitSku = original.commitSku;
    stockReservation.releaseSku = original.releaseSku;
    couponService.release = original.release;
    Payment.updateMany = original.updateMany;
  };

  return Promise.resolve(fn(calls)).finally(restore);
}

const SESSION = {};

test('commitOrderStock deducts once, merges duplicate SKU lines and is idempotent', async () => {
  const lifecycle = load('services', 'orderLifecycle.service.js');

  await withStubs(async (calls) => {
    const order = {
      orderType: 'retail',
      items: [
        { sku: 'b'.repeat(24), quantity: 2 },
        { sku: 'a'.repeat(24), quantity: 1 },
        { sku: 'b'.repeat(24), quantity: 3 },
      ],
    };

    await lifecycle.commitOrderStock(order, SESSION);

    assert.deepEqual(calls.commit, [
      ['a'.repeat(24), 1],
      ['b'.repeat(24), 5],
    ]); // stable SKU order, merged quantities
    assert.ok(order.stockCommittedAt instanceof Date);

    await lifecycle.commitOrderStock(order, SESSION);
    assert.equal(calls.commit.length, 2, 'second commit must be a no-op');
  });
});

test('commitOrderStock ignores orders that never reserved SKU stock', async () => {
  const lifecycle = load('services', 'orderLifecycle.service.js');

  await withStubs(async (calls) => {
    for (const orderType of ['manufacturing', 'printing']) {
      const order = { orderType, items: [{ quantity: 10 }] };
      await lifecycle.commitOrderStock(order, SESSION);
      assert.equal(order.stockCommittedAt, undefined);
    }
    assert.equal(calls.commit.length, 0);
  });
});

test('wholesale orders hold SKU stock exactly like retail', async () => {
  const lifecycle = load('services', 'orderLifecycle.service.js');

  await withStubs(async (calls) => {
    const order = { orderType: 'wholesale', items: [{ sku: 'c'.repeat(24), quantity: 12 }] };
    await lifecycle.commitOrderStock(order, SESSION);
    assert.deepEqual(calls.commit, [['c'.repeat(24), 12]]);
  });
});

test('cancelOrder releases stock, gives the coupon back and cancels open payments', async () => {
  const lifecycle = load('services', 'orderLifecycle.service.js');

  await withStubs(async (calls) => {
    const order = {
      _id: 'o1',
      orderType: 'retail',
      paymentStatus: 'pending',
      user: 'u1',
      coupon: { couponId: 'c1' },
      items: [{ sku: 'a'.repeat(24), quantity: 2 }],
      statusHistory: [],
    };

    const { stockTransitions } = await lifecycle.cancelOrder({
      order,
      session: SESSION,
      actorId: 'admin1',
      note: 'customer asked',
    });

    assert.deepEqual(calls.release, [['a'.repeat(24), 2]]);
    assert.equal(stockTransitions.length, 1);
    assert.equal(calls.coupon.length, 1);
    assert.equal(calls.coupon[0].couponId, 'c1');
    assert.equal(calls.coupon[0].userId, 'u1');
    assert.equal(calls.payments.length, 1);
    assert.equal(order.orderStatus, 'cancelled');
    assert.equal(order.paymentStatus, 'cancelled');
    assert.equal(order.statusHistory.length, 1);
  });
});

test('cancelOrder with recordStatus:false leaves status bookkeeping to the caller', async () => {
  const lifecycle = load('services', 'orderLifecycle.service.js');

  await withStubs(async () => {
    const order = { orderType: 'retail', paymentStatus: 'pending', items: [{ sku: 'a'.repeat(24), quantity: 1 }], statusHistory: [] };
    await lifecycle.cancelOrder({ order, session: SESSION, recordStatus: false });

    assert.equal(order.orderStatus, undefined);
    assert.equal(order.statusHistory.length, 0);
  });
});

test('cancelOrder refuses paid orders (refund module required) and shipped stock', async () => {
  const lifecycle = load('services', 'orderLifecycle.service.js');

  await withStubs(async (calls) => {
    await assert.rejects(
      lifecycle.cancelOrder({
        order: { orderType: 'retail', paymentStatus: 'paid', items: [] },
        session: SESSION,
      }),
      (error) => error.code === 'REFUND_REQUIRED',
    );

    await assert.rejects(
      lifecycle.cancelOrder({
        order: {
          orderType: 'retail',
          paymentStatus: 'pending',
          stockCommittedAt: new Date(),
          items: [{ sku: 'a'.repeat(24), quantity: 1 }],
        },
        session: SESSION,
      }),
      (error) => error.code === 'ORDER_STOCK_ALREADY_COMMITTED',
    );

    assert.equal(calls.release.length, 0);
  });
});

test('lifecycle rejects missing SKU references and bad quantities', async () => {
  const lifecycle = load('services', 'orderLifecycle.service.js');

  await withStubs(async () => {
    await assert.rejects(
      lifecycle.commitOrderStock({ orderType: 'retail', items: [{ quantity: 1 }] }, SESSION),
      (error) => error.code === 'ORDER_SKU_REFERENCE_MISSING',
    );

    await assert.rejects(
      lifecycle.commitOrderStock({ orderType: 'retail', items: [{ sku: 'a'.repeat(24), quantity: 0 }] }, SESSION),
      (error) => error.code === 'INVALID_RESERVED_STOCK_QUANTITY',
    );

    await assert.rejects(lifecycle.commitOrderStock({ orderType: 'retail', items: [] }, undefined), /session/);
  });
});

test('status transitions have a single source of truth', () => {
  const { canTransitionOrderStatus, ORDER_STATUS_TRANSITIONS } = load('constants', 'Order.js');

  assert.equal(canTransitionOrderStatus('pending', 'confirmed'), true);
  assert.equal(canTransitionOrderStatus('processing', 'cancelled'), true);
  assert.equal(canTransitionOrderStatus('shipped', 'cancelled'), false); // stock already left
  assert.equal(canTransitionOrderStatus('delivered', 'cancelled'), false);
  assert.equal(canTransitionOrderStatus('cancelled', 'pending'), false);
  assert.ok(Object.isFrozen(ORDER_STATUS_TRANSITIONS));
});

/* -------------------------------------------------------------- Dashboard */

test('dashboard period boundaries use Monday-based weeks and month starts', () => {
  const { startOfToday, startOfWeek, startOfMonth } = load('services', 'dashboard.service.js');

  const wednesday = new Date('2026-10-21T09:30:00+05:00');

  assert.equal(startOfToday(wednesday).getHours(), 0);
  assert.equal(startOfWeek(wednesday).getDay(), 1);
  assert.equal(startOfWeek(wednesday).getDate(), 19);

  const sunday = new Date('2026-10-25T23:00:00+05:00');
  assert.equal(startOfWeek(sunday).getDate(), 19);

  assert.equal(startOfMonth(wednesday).getDate(), 1);
});

/* ------------------------------------------------------- Input validators */

test('staff, settings and media validators reject unsafe or unknown input', () => {
  const staff = load('validators', 'staff.validators.js');
  const settings = load('validators', 'settings.validators.js');

  const good = {
    name: 'Ali Raza',
    email: 'ALI@Example.com',
    phone: '03001234567',
    password: 'long-enough-1',
    permissions: ['orders.read', 'orders.read', 'payments.read'],
  };

  const parsed = staff.createBody.parse(good);
  assert.equal(parsed.email, 'ali@example.com');
  assert.deepEqual(parsed.permissions, ['orders.read', 'payments.read']); // de-duplicated

  assert.throws(() => staff.createBody.parse({ ...good, permissions: ['staff.manage'] }));
  assert.throws(() => staff.createBody.parse({ ...good, role: 'admin' })); // strict: cannot set role
  assert.throws(() => staff.createBody.parse({ ...good, password: 'short' }));
  assert.throws(() => staff.updateBody.parse({}));

  assert.throws(() => settings.updateBody.parse({}));
  assert.throws(() => settings.updateBody.parse({ shippingFee: 100 })); // shipping lives in ShippingRule
  assert.throws(() => settings.updateBody.parse({ social: { facebook: 'javascript:alert(1)' } }));
  assert.throws(() => settings.updateBody.parse({ announcement: { link: '//evil.com' } }));
  assert.deepEqual(settings.updateBody.parse({ returns: { windowDays: '14' } }), { returns: { windowDays: 14 } });
});

/* -------------------------------------------------- Cache and background jobs */

test('cache is a transparent no-op when CACHE_URL is not set', async () => {
  const cache = load('services', 'cache.service.js');
  let calls = 0;

  const loader = async () => {
    calls += 1;
    return { value: calls };
  };

  assert.deepEqual(await cache.remember('k', 60, loader), { value: 1 });
  assert.deepEqual(await cache.remember('k', 60, loader), { value: 2 }); // not cached, loader runs again
  await assert.doesNotReject(cache.invalidate('k', 'other'));
  await assert.doesNotReject(cache.invalidate());
});

test('maintenance tasks are registered and unknown tasks are refused', async () => {
  const jobs = load('jobs', 'maintenance.js');

  assert.deepEqual(Object.keys(jobs.TASKS).sort(), ['cleanup-media', 'expire-quotes']);
  await assert.rejects(jobs.runTask('drop-database'), /Unknown maintenance task/);

  // without Cloudinary the media task is skipped instead of failing
  assert.deepEqual(await jobs.cleanupMedia(), { skipped: 'cloudinary not configured' });
});

/* ---------------------------------------------------- Public catalog views */

test('public catalog views never leak inventory counts or wholesale prices', () => {
  const catalog = load('services', 'catalog.service.js');

  const product = {
    _id: 'p1',
    name: 'Runner',
    slug: 'runner',
    category: { name: 'Shoes', slug: 'shoes' },
    generalImages: [{ url: 'https://x/a.png', alt: 'a', publicId: 'secret-id' }],
    description: 'long',
    status: 'active',
  };

  const variants = [
    { _id: 'v1', product: 'p1', isEnabled: true, color: { name: 'Black', hexCode: '#000000' }, variantCode: 'BLK', images: [] },
    { _id: 'v2', product: 'p1', isEnabled: false, color: { name: 'Hidden' }, variantCode: 'HID', images: [] },
  ];

  const skus = [
    { _id: 's1', variant: 'v1', sku: 'RUN-BLK-42', size: '42', price: 5000, wholesalePrice: 3000, stock: 99, reservedStock: 7, available: 92, isEnabled: true, sortOrder: 0 },
    { _id: 's2', variant: 'v1', sku: 'RUN-BLK-43', size: '43', price: 5200, stock: 0, reservedStock: 0, available: 0, isEnabled: true, sortOrder: 1 },
    { _id: 's3', variant: 'v2', sku: 'RUN-HID-42', size: '42', price: 100, stock: 5, reservedStock: 0, available: 5, isEnabled: true, sortOrder: 0 },
  ];

  const detail = catalog.productDetailView(product, variants, skus);
  const json = JSON.stringify(detail);

  assert.equal(detail.priceMin, 5000);
  assert.equal(detail.priceMax, 5200);
  assert.equal(detail.inStock, true);
  assert.equal(detail.variants.length, 1, 'disabled variants are hidden');
  assert.equal(detail.variants[0].sizes.length, 2);
  assert.equal(detail.variants[0].sizes[0].maxQuantity, catalog.MAX_PURCHASABLE_QUANTITY);
  assert.equal(detail.variants[0].sizes[1].inStock, false);
  assert.equal(detail.variants[0].sizes[1].maxQuantity, 0);

  for (const forbidden of ['wholesalePrice', 'reservedStock', '"stock"', '"available"', 'secret-id', '3000', '"publicId"']) {
    assert.ok(!json.includes(forbidden), `public view must not contain ${forbidden}`);
  }
});
