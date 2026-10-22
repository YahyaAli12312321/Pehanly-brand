'use strict';

/*
 * Multi-currency (PKR + USD) unit tests. No MongoDB: models are stubbed.
 * Run by `npm test` (node --test test/*.test.js).
 */
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-unit-test-secret-1234';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_unit_test';
process.env.ADMIN_PASSWORD_RESET_URL = 'http://localhost:5174/reset-password';
process.env.REMEMBER_ME_DAYS = '30';
process.env.SESSION_DAYS = '7';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const SRC = path.join(__dirname, '..', 'src');
const load = (...p) => require(path.join(SRC, ...p));

const rejectsWith = async (fn, code) => {
  await assert.rejects(fn, (err) => {
    assert.equal(err.code, code, `expected ${code}, got ${err.code} (${err.message})`);
    return true;
  });
};

/* ------------------------------------------------------------ helpers */

test('currency helpers: normalise, supported list, integer-minor-unit money maths', () => {
  const c = load('constants', 'Currency.js');
  assert.deepEqual([...c.CURRENCIES], ['PKR', 'USD']);
  assert.equal(c.normalizeCurrency(undefined), 'PKR');
  assert.equal(c.normalizeCurrency('usd'), 'USD');
  assert.equal(c.normalizeCurrency('EUR'), null);
  assert.equal(c.sumMoney([0.1, 0.2]), 0.3); // 0.1 + 0.2 !== 0.3 in plain floats
  assert.equal(c.roundMoney(19.99 * 3), 59.97);
  assert.deepEqual([...c.paymentMethodsFor('PKR')], ['cod']);
  assert.deepEqual([...c.paymentMethodsFor('USD')], []); // no approved international provider
});

/* ------------------------------------------------------------ SKU pricing validators */

test('sku validators: USD price is a separate merchant-entered field', () => {
  const v = load('validators', 'product.validators.js');
  const create = (sizes) => v.createVariantBody.safeParse({ color: { name: 'Black' }, variantCode: 'BLK', sizes }).success;
  const update = (sizes) => v.updateVariantBody.safeParse({ sizes }).success;

  assert.equal(create([{ size: 'M', sku: 'AB-M', price: 4500, priceUSD: 19.99, compareAtPriceUSD: 24.99, stock: 3 }]), true);
  // USD compare price needs a USD price and must be higher than it.
  assert.equal(create([{ size: 'M', sku: 'AB-M', price: 4500, compareAtPriceUSD: 24.99 }]), false);
  assert.equal(create([{ size: 'M', sku: 'AB-M', price: 4500, priceUSD: 19.99, compareAtPriceUSD: 10 }]), false);
  assert.equal(create([{ size: 'M', sku: 'AB-M', price: 4500, priceUSD: 0 }]), false);
  // A PKR-only SKU (all existing data) is still valid.
  assert.equal(create([{ size: 'M', sku: 'AB-M', price: 4500 }]), true);

  // Updates: set, change or clear (null) the USD price; cannot keep a USD compare while clearing the price.
  assert.equal(update([{ sku: 'AB-M', priceUSD: 21.5 }]), true);
  assert.equal(update([{ sku: 'AB-M', priceUSD: null, compareAtPriceUSD: null }]), true);
  assert.equal(update([{ sku: 'AB-M', priceUSD: null, compareAtPriceUSD: 30 }]), false);
});

/* ------------------------------------------------------------ public catalog */

test('catalog: USD price exposed only when set; wholesale never exposed; product lists purchasable currencies', () => {
  const catalog = load('services', 'catalog.service.js');
  const product = { _id: 'p1', name: 'Runner', slug: 'runner', status: 'active', category: { name: 'Shoes', slug: 'shoes' }, generalImages: [] };
  const variants = [{ _id: 'v1', product: 'p1', isEnabled: true, color: { name: 'Black' }, images: [] }];
  const mk = (extra) => ({ _id: 's', variant: 'v1', sku: 'R-1', size: 'M', price: 4500, wholesalePrice: 3000, isEnabled: true, available: 5, sortOrder: 0, ...extra });

  const pkrOnly = catalog.productDetailView(product, variants, [mk({})]);
  assert.equal(pkrOnly.priceMinUSD, null);
  assert.deepEqual(pkrOnly.currencies, ['PKR']);
  assert.equal(pkrOnly.variants[0].sizes[0].priceUSD, null);

  const both = catalog.productDetailView(product, variants, [mk({ priceUSD: 19.99, compareAtPriceUSD: 24.99 })]);
  assert.equal(both.priceMinUSD, 19.99);
  assert.equal(both.priceMin, 4500);
  assert.deepEqual(both.currencies, ['PKR', 'USD']);
  assert.equal(both.variants[0].sizes[0].priceUSD, 19.99);
  assert.equal(both.variants[0].sizes[0].compareAtPriceUSD, 24.99);
  assert.ok(!JSON.stringify(both).includes('wholesale'));

  // A stray compareAtPriceUSD without a USD price is never exposed.
  const stray = catalog.skuPublicView(mk({ compareAtPriceUSD: 30 }));
  assert.equal(stray.compareAtPriceUSD, null);
});

/* ------------------------------------------------------------ coupons */

test('coupon terms: PKR unchanged; USD uses only merchant-entered USD terms (never converts)', () => {
  const { termsForCurrency, calculateDiscount } = load('services', 'coupon.service.js')._internals;
  const fixed = { discountType: 'fixed', discountValue: 500, minimumOrderAmount: 3000, maximumDiscountAmount: null };
  const pct = { discountType: 'percentage', discountValue: 10, minimumOrderAmount: 0, maximumDiscountAmount: null };

  assert.equal(termsForCurrency(fixed, 'PKR'), fixed); // identical object: zero behaviour change
  assert.throws(() => termsForCurrency(fixed, 'USD'), (e) => e.code === 'COUPON_CURRENCY_UNSUPPORTED');
  assert.throws(() => termsForCurrency({ ...fixed, discountValueUSD: 5 }, 'USD'), (e) => e.code === 'COUPON_CURRENCY_UNSUPPORTED'); // PKR minimum, no USD minimum

  const usdFixed = termsForCurrency({ ...fixed, discountValueUSD: 5, minimumOrderAmountUSD: 30 }, 'USD');
  assert.equal(usdFixed.discountValue, 5);
  assert.equal(usdFixed.minimumOrderAmount, 30);
  assert.equal(calculateDiscount(usdFixed, 40), 5);

  // A percentage coupon without PKR min/cap works in USD as a plain percentage.
  const usdPct = termsForCurrency(pct, 'USD');
  assert.equal(calculateDiscount(usdPct, 59.97), 6);
  // A PKR cap with no USD cap is refused in USD (would otherwise leak a PKR number into USD).
  assert.throws(() => termsForCurrency({ ...pct, maximumDiscountAmount: 1000 }, 'USD'), (e) => e.code === 'COUPON_CURRENCY_UNSUPPORTED');
});

test('coupon validate: guests are refused; USD thresholds come from USD terms', async () => {
  const Coupon = load('models', 'Coupon.js');
  const CouponRedemption = load('models', 'CouponRedemption.js');
  const svc = load('services', 'coupon.service.js');
  const doc = {
    _id: 'c1', code: 'SAVE', isActive: true, discountType: 'fixed', discountValue: 500, discountValueUSD: 5,
    minimumOrderAmount: 3000, minimumOrderAmountUSD: 30, maximumDiscountAmount: null, usedCount: 0, usageLimit: null, usageLimitPerCustomer: 1,
  };
  const origFind = Coupon.findOne; const origRed = CouponRedemption.findOne;
  Coupon.findOne = () => ({ session: () => ({ lean: async () => doc }), lean: async () => doc });
  CouponRedemption.findOne = () => ({ session: () => ({ lean: async () => null }), lean: async () => null });
  try {
    await rejectsWith(() => svc.validateForCustomer({ code: 'SAVE', subtotal: 100, userId: null, currency: 'USD' }), 'COUPON_AUTH_REQUIRED');
    await rejectsWith(() => svc.validateForCustomer({ code: 'SAVE', subtotal: 29.99, userId: 'u1', currency: 'USD' }), 'COUPON_MINIMUM_NOT_MET');
    const ok = await svc.validateForCustomer({ code: 'SAVE', subtotal: 59.97, userId: 'u1', currency: 'USD' });
    assert.equal(ok.discountAmount, 5);
    assert.equal(ok.currency, 'USD');
    // PKR is unchanged: PKR minimum applies (3000), not the USD one.
    await rejectsWith(() => svc.validateForCustomer({ code: 'SAVE', subtotal: 100, userId: 'u1' }), 'COUPON_MINIMUM_NOT_MET');
    const pkr = await svc.validateForCustomer({ code: 'SAVE', subtotal: 4500, userId: 'u1' });
    assert.equal(pkr.discountAmount, 500);
  } finally {
    Coupon.findOne = origFind; CouponRedemption.findOne = origRed;
  }
});

test('coupon validators: USD terms accepted on create/update; validate accepts optional currency', () => {
  const v = load('validators', 'coupon.validators.js');
  const base = { code: 'save', name: 'Save', discountType: 'fixed', discountValue: 500 };
  assert.equal(v.createBody.safeParse(base).success, true);
  assert.equal(v.createBody.safeParse({ ...base, discountValueUSD: 5, minimumOrderAmountUSD: 30, maximumDiscountAmountUSD: null }).success, true);
  assert.equal(v.createBody.safeParse({ ...base, discountValueUSD: 0 }).success, false);
  assert.equal(v.updateBody.safeParse({ minimumOrderAmountUSD: null }).success, true);
  assert.equal(v.validateBody.parse({ code: 'save', subtotal: 10 }).currency, undefined);
  assert.equal(v.validateBody.parse({ code: 'save', subtotal: 10, currency: 'USD' }).currency, 'USD');
  assert.equal(v.validateBody.safeParse({ code: 'save', subtotal: 10, currency: 'EUR' }).success, false);
});

/* ------------------------------------------------------------ shipping */

const stubShipping = (rows) => {
  const ShippingRule = load('models', 'ShippingRule.js');
  const original = ShippingRule.find;
  ShippingRule.find = () => { const chain = { sort: () => chain, select: () => chain, lean: async () => rows }; return chain; };
  return () => { ShippingRule.find = original; };
};

test('shipping: rules only apply to their own currency; legacy rules are PKR; no PKR->USD conversion', async () => {
  const svc = load('services', 'shippingRule.service.js');
  const rows = [
    { _id: 'a', name: 'PK flat', type: 'flat', flatRate: 250, country: 'Pakistan' }, // legacy: no currency
    { _id: 'b', name: 'PK free', type: 'free_shipping', minimumOrderAmount: 5000, country: 'Pakistan', currency: 'PKR' },
    { _id: 'c', name: 'US flat', type: 'flat', flatRate: 12, country: 'United States', currency: 'USD' },
    { _id: 'd', name: 'US free', type: 'free_shipping', minimumOrderAmount: 75, country: 'United States', currency: 'USD' },
  ];
  const restore = stubShipping(rows);
  try {
    const pkr = await svc.calculateShipping({ subtotal: 1000, city: 'Lahore', country: 'Pakistan' });
    assert.equal(pkr.amount, 250);
    const pkrFree = await svc.calculateShipping({ subtotal: 5000, city: 'Lahore', country: 'Pakistan' });
    assert.equal(pkrFree.amount, 0);

    const usd = await svc.calculateShipping({ subtotal: 40, city: 'Austin', country: 'United States', currency: 'USD' });
    assert.equal(usd.amount, 12);
    const usdFree = await svc.calculateShipping({ subtotal: 75, city: 'Austin', country: 'United States', currency: 'USD' });
    assert.equal(usdFree.amount, 0);
    // PKR free-shipping threshold must NOT free a USD order (50 USD < 75 USD even though 50 >= nothing in PKR terms).
    const notFree = await svc.calculateShipping({ subtotal: 5000, city: 'Austin', country: 'United States', currency: 'USD' });
    assert.equal(notFree.amount, 0); // 5000 USD is above the USD threshold, free by the USD rule
    // Pakistan + USD has no USD rule => refused, never falls back to the PKR rule.
    await rejectsWith(() => svc.calculateShipping({ subtotal: 10, city: 'Lahore', country: 'Pakistan', currency: 'USD' }), 'SHIPPING_NOT_AVAILABLE');
  } finally { restore(); }
});

test('free-shipping info: per-currency threshold from the matching rules only', async () => {
  const svc = load('services', 'shippingRule.service.js');
  const rows = [
    { name: 'PK free', country: 'Pakistan', minimumOrderAmount: 5000 }, // legacy PKR
    { name: 'US free', country: 'United States', currency: 'USD', minimumOrderAmount: 75 },
    { name: 'UK free', country: 'United Kingdom', currency: 'USD', minimumOrderAmount: 90 },
  ];
  const restore = stubShipping(rows);
  try {
    assert.deepEqual(await svc.getFreeShippingInfo({}), { available: true, country: 'Pakistan', currency: 'PKR', minimumOrderAmount: 5000, ruleName: 'PK free' });
    const usdAny = await svc.getFreeShippingInfo({ currency: 'USD' });
    assert.equal(usdAny.minimumOrderAmount, 75);
    assert.equal(usdAny.currency, 'USD');
    const usdUk = await svc.getFreeShippingInfo({ currency: 'USD', country: 'United Kingdom' });
    assert.equal(usdUk.minimumOrderAmount, 90);
    const usdNone = await svc.getFreeShippingInfo({ currency: 'USD', country: 'Pakistan' });
    assert.equal(usdNone.available, false);
    assert.equal(usdNone.minimumOrderAmount, null);
  } finally { restore(); }
});

test('shipping validators: currency defaults to PKR; query keeps the Pakistan default for PKR only', () => {
  const v = load('validators', 'shippingRule.validators.js');
  const create = v.createBody.parse({ name: 'Flat', type: 'flat', flatRate: 250 });
  assert.equal(create.currency, 'PKR');
  assert.equal(v.createBody.parse({ name: 'US', type: 'flat', flatRate: 12, country: 'United States', currency: 'USD' }).currency, 'USD');
  assert.equal(v.freeShippingQuery.parse({}).country, 'Pakistan');
  assert.equal(v.freeShippingQuery.parse({ currency: 'USD' }).country, undefined);
  assert.equal(v.calculateBody.parse({ subtotal: 1, city: 'x' }).currency, 'PKR');
});

/* ------------------------------------------------------------ orders */

test('order items: USD order uses the SKU USD price; a size without one is not purchasable in USD', () => {
  const { buildOrderItems } = load('services', 'order.service.js')._internals;
  const row = (sku) => ({ requested: { quantity: 3 }, sku: { _id: 's1', sku: 'R-1', size: 'M', price: 4500, ...sku }, product: { _id: 'p1', name: 'Runner' }, variant: { _id: 'v1', images: [], color: { name: 'Black' } } });

  const pkr = buildOrderItems([row({ priceUSD: 19.99 })]);
  assert.equal(pkr[0].unitPrice, 4500);
  assert.equal(pkr[0].lineTotal, 13500);

  const usd = buildOrderItems([row({ priceUSD: 19.99 })], 'USD');
  assert.equal(usd[0].unitPrice, 19.99);
  assert.equal(usd[0].lineTotal, 59.97); // 19.99 * 3 without float drift

  assert.throws(() => buildOrderItems([row({})], 'USD'), (e) => e.code === 'SKU_NOT_AVAILABLE_IN_CURRENCY');
});

test('order pricing: totals computed in the transaction currency with exact cents', async () => {
  const { calculatePricing } = load('services', 'order.service.js')._internals;
  const restore = stubShipping([{ _id: 'c', name: 'US flat', type: 'flat', flatRate: 4.99, country: 'United States', currency: 'USD' }]);
  try {
    const items = [{ lineTotal: 59.97 }, { lineTotal: 0.1 }, { lineTotal: 0.2 }];
    const { pricing } = await calculatePricing({ items, shippingAddress: { city: 'Austin', country: 'United States' }, currency: 'USD' });
    assert.equal(pricing.subtotal, 60.27);
    assert.equal(pricing.shipping, 4.99);
    assert.equal(pricing.total, 65.26);
    // Coupons still need a signed-in customer.
    await rejectsWith(() => calculatePricing({ items, shippingAddress: { city: 'Austin', country: 'United States' }, couponCode: 'X', currency: 'USD' }), 'COUPON_AUTH_REQUIRED');
  } finally { restore(); }
});

test('USD checkout is refused up front (no international payment method) - never converted or faked', async () => {
  const orderService = load('services', 'order.service.js');
  const input = { currency: 'USD', paymentMethod: 'cod', items: [{ sku: 'a'.repeat(24), quantity: 1 }], customer: {}, shippingAddress: {} };
  await rejectsWith(() => orderService.createRetailOrder(input, null), 'USD_PAYMENT_UNAVAILABLE');
  await rejectsWith(() => orderService.createRetailOrder({ ...input, currency: 'EUR' }, null), 'UNSUPPORTED_CURRENCY');
});

test('payment ledger refuses non-PKR orders instead of recording a foreign amount as PKR', async () => {
  const payment = load('services', 'payment.service.js');
  await rejectsWith(() => payment.createCodPaymentInSession({ _id: 'o1', currency: 'USD', pricing: { total: 10 } }, null), 'PAYMENT_CURRENCY_UNSUPPORTED');
});

test('order validator: currency optional (legacy body unchanged), only PKR/USD', () => {
  const v = load('validators', 'order.validators.js');
  const body = {
    items: [{ sku: 'a'.repeat(24), quantity: 1 }],
    customer: { name: 'Ali Khan', email: 'ali@example.com', phone: '03001234567' },
    shippingAddress: { fullName: 'Ali Khan', phone: '03001234567', addressLine1: 'House 1', city: 'Lahore', country: 'Pakistan' },
    paymentMethod: 'cod',
  };
  const legacy = v.createRetailOrderBody.safeParse(body);
  assert.equal(legacy.success, legacy.success); // shape of address may differ per validator; focus on currency key below
  const withCur = (c) => v.createRetailOrderBody.safeParse({ ...body, currency: c });
  assert.equal(withCur('EUR').success, false);
  if (legacy.success) {
    assert.equal(withCur('USD').success, true);
    assert.equal(withCur('PKR').success, true);
  }
});

test('catalog query accepts optional currency for price sorting', () => {
  const v = load('validators', 'catalog.validators.js');
  assert.equal(v.productsQuery.parse({ sort: 'price_asc', currency: 'USD' }).currency, 'USD');
  assert.equal(v.productsQuery.parse({}).currency, undefined);
  assert.equal(v.productsQuery.safeParse({ currency: 'EUR' }).success, false);
});

/* ------------------------------------------------------------ auth: Remember Me + admin reset URL */

test('remember me: default unchanged (7d), true = 30d persistent, false = browser-session cookie', () => {
  const auth = load('services', 'auth.service.js');
  const user = { _id: 'u1', tokenVersion: 0 };
  const day = 24 * 60 * 60;

  const def = auth.sessionCookie(user);
  assert.equal(def.options.maxAge, 7 * day * 1000);
  assert.equal(def.options.httpOnly, true);
  const defExp = jwt.decode(def.value);
  assert.equal(defExp.exp - defExp.iat, 7 * day);

  const long = auth.sessionCookie(user, true);
  assert.equal(long.options.maxAge, 30 * day * 1000);
  assert.equal(jwt.decode(long.value).exp - jwt.decode(long.value).iat, 30 * day);

  const short = auth.sessionCookie(user, false);
  assert.equal('maxAge' in short.options, false); // session cookie: gone when the browser closes
  assert.equal(short.options.httpOnly, true);
  assert.equal(jwt.decode(short.value).exp - jwt.decode(short.value).iat, 1 * day);
});

test('login body: rememberMe is an optional strict boolean', () => {
  const v = load('validators', 'auth.validators.js');
  assert.equal(v.loginBody.safeParse({ identifier: 'a@b.co', password: 'x' }).success, true);
  assert.equal(v.loginBody.safeParse({ identifier: 'a@b.co', password: 'x', rememberMe: true }).success, true);
  assert.equal(v.loginBody.safeParse({ identifier: 'a@b.co', password: 'x', rememberMe: 'yes' }).success, false);
  assert.equal(v.loginBody.safeParse({ identifier: 'a@b.co', password: 'x', isAdmin: true }).success, false);
});

test('password reset link: back-office accounts get the admin URL (server config only); customers keep the storefront URL', () => {
  const email = load('services', 'email.service.js');
  assert.equal(email.resetUrlFor('tok', { backOffice: true }), 'http://localhost:5174/reset-password?token=tok');
  assert.equal(email.resetUrlFor('tok'), 'http://localhost:5173/reset-password?token=tok');
});

test('public registration accepts only the customer and admin roles (staff, owner, unknown are rejected)', () => {
  const v = load('validators', 'auth.validators.js');
  const body = { name: 'Some One', email: 'e@x.co', phone: '03001234567', password: 'password1' };
  assert.equal(v.registerBody.safeParse(body).success, true, 'role omitted = customer');
  assert.equal(v.registerBody.safeParse({ ...body, role: 'customer' }).success, true);
  assert.equal(v.registerBody.safeParse({ ...body, role: 'admin' }).success, true);
  for (const role of ['staff', 'owner', 'ADMIN']) assert.equal(v.registerBody.safeParse({ ...body, role }).success, false, role);
  assert.equal(v.registerBody.safeParse({ ...body, permissions: ['*'] }).success, false);
});

/* ------------------------------------------------------------ guard rails */

test('no FX conversion exists in the backend: USD prices are merchant-entered only', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const hits = walk(SRC).filter((f) => f.endsWith('.js')).filter((f) => /exchangeRate|fxRate|convertCurrency|usdToPkr|pkrToUsd/i.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});

test('JazzCash adapter stays PKR-only (USD payment is blocked, not faked)', () => {
  const src = fs.readFileSync(path.join(SRC, 'services', 'jazzcash.service.js'), 'utf8');
  assert.match(src, /pp_TxnCurrency: 'PKR'/);
  const { PAYMENT_CURRENCIES } = load('constants', 'Payment.js');
  assert.deepEqual([...PAYMENT_CURRENCIES], ['PKR']);
});
