'use strict';

/*
 * Pakistan-wide delivery + COD (Karachi only) + manual JazzCash wallet. No MongoDB: models are stubbed.
 */
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

const rejectsWith = async (fn, code) => {
  await assert.rejects(fn, (err) => {
    assert.equal(err.code, code, `expected ${code}, got ${err.code} (${err.message})`);
    return true;
  });
};

const WALLET_ON = { checkout: { codEnabled: true, jazzcashManual: { enabled: true, walletNumber: '03001234567', accountTitle: 'PEHANLY', instructions: 'Send the exact total and keep the receipt.' } } };
const WALLET_OFF = { checkout: { codEnabled: true } };

/* ------------------------------------------------------------ policy: the brief's examples */

test('delivery is available everywhere in Pakistan; COD only in Karachi, Sindh', () => {
  const { paymentOptions } = load('services', 'deliveryPolicy.service.js');
  const cases = [
    ['Karachi', 'Sindh', true, true],
    ['karachi', undefined, true, true], // province is optional
    ['Karachi East', 'Sindh', true, true],
    ['Lahore', 'Punjab', true, false],
    ['Islamabad', 'Islamabad Capital Territory', true, false],
    ['Rawalpindi', 'Punjab', true, false],
    ['Peshawar', 'Khyber Pakhtunkhwa', true, false],
    ['Quetta', 'Balochistan', true, false],
    ['Gilgit', 'Gilgit-Baltistan', true, false],
    ['Hyderabad', 'Sindh', true, false], // Sindh is not Karachi
    ['Karachi', 'Punjab', true, false], // inconsistent address is not Karachi
  ];
  for (const [city, province, deliverable, cod] of cases) {
    const o = paymentOptions({ country: 'Pakistan', city, province, settings: WALLET_ON });
    assert.equal(o.deliverable, deliverable, `${city} deliverable`);
    assert.equal(o.cod.available, cod, `${city} COD`);
    assert.equal(o.jazzcashManual.available, true, `${city} wallet`);
    assert.deepEqual(o.methods, cod ? ['cod', 'jazzcash_manual'] : ['jazzcash_manual'], `${city} methods`);
  }
  // COD unavailable is NOT delivery unavailable, and says why.
  const lhr = paymentOptions({ country: 'Pakistan', city: 'Lahore', province: 'Punjab', settings: WALLET_ON });
  assert.equal(lhr.deliverable, true);
  assert.match(lhr.cod.reason, /Karachi only/);
});

test('a non-Pakistan address is not deliverable and has no payment method', () => {
  const { paymentOptions, assessDelivery } = load('services', 'deliveryPolicy.service.js');
  const o = paymentOptions({ country: 'United Arab Emirates', city: 'Dubai', settings: WALLET_ON });
  assert.equal(o.deliverable, false);
  assert.deepEqual(o.methods, []);
  assert.equal(assessDelivery({ country: 'UAE', city: 'Dubai' }).deliverable, false);
  assert.equal(assessDelivery({ country: 'PK', city: 'Sukkur' }).deliverable, true);
  assert.equal(assessDelivery({ city: 'Sukkur' }).deliverable, true); // API default country = Pakistan
});

test('manual wallet needs the store to enable it AND set a wallet number; COD can be switched off; USD has none', () => {
  const { paymentOptions } = load('services', 'deliveryPolicy.service.js');
  const lhr = { country: 'Pakistan', city: 'Lahore', province: 'Punjab' };
  assert.deepEqual(paymentOptions({ ...lhr, settings: WALLET_OFF }).methods, []);
  assert.deepEqual(paymentOptions({ ...lhr, settings: { checkout: { jazzcashManual: { enabled: true } } } }).methods, []); // no number
  assert.deepEqual(paymentOptions({ ...lhr, settings: { checkout: { jazzcashManual: { enabled: false, walletNumber: '0300' } } } }).methods, []);
  assert.deepEqual(paymentOptions({ country: 'Pakistan', city: 'Karachi', settings: { checkout: { codEnabled: false } } }).methods, []);
  assert.deepEqual(paymentOptions({ ...lhr, currency: 'USD', settings: WALLET_ON }).methods, []); // USD still BLOCKED
});

test('public settings expose only customer-facing wallet details, and only when usable', async () => {
  const StoreSettings = load('models', 'StoreSettings.js');
  const cache = load('services', 'cache.service.js');
  const settingsSvc = load('services', 'settings.service.js');
  const row = { key: 'store', currency: 'PKR', checkout: { jazzcashManual: { enabled: true, walletNumber: '03001234567', accountTitle: 'PEHANLY', instructions: 'x', merchantSecret: 'NEVER' } } };
  StoreSettings.findOneAndUpdate = () => ({ lean: async () => row });
  cache.remember = async (_k, _t, fn) => fn();
  const pub = await settingsSvc.getPublicSettings();
  assert.deepEqual(pub.checkout.jazzcashManual, { enabled: true, accountTitle: 'PEHANLY', walletNumber: '03001234567', instructions: 'x' });
  assert.equal(JSON.stringify(pub).includes('NEVER'), false);
  row.checkout.jazzcashManual.walletNumber = '';
  assert.deepEqual((await settingsSvc.getPublicSettings()).checkout.jazzcashManual, { enabled: false });
});

/* ------------------------------------------------------------ shipping: serviceability vs charge */

test('Pakistani city with no city rate falls back to the Pakistan flat rule; never free by accident', async () => {
  const ShippingRule = load('models', 'ShippingRule.js');
  const svc = load('services', 'shippingRule.service.js');
  const rules = [
    { _id: 'r1', isActive: true, type: 'city_based', country: 'Pakistan', cityRates: [{ city: 'Karachi', rate: 200 }], priority: 1 },
    { _id: 'r2', isActive: true, type: 'flat', country: 'Pakistan', flatRate: 450, priority: 9 },
  ];
  ShippingRule.find = () => ({ sort: () => ({ lean: async () => rules }) });
  assert.equal((await svc.calculateShipping({ subtotal: 5000, city: 'Karachi' })).amount, 200);
  assert.equal((await svc.calculateShipping({ subtotal: 5000, city: 'Gilgit' })).amount, 450);
  rules.pop(); // no Pakistan-wide rule configured
  await rejectsWith(() => svc.calculateShipping({ subtotal: 5000, city: 'Gilgit' }), 'SHIPPING_RATE_NOT_CONFIGURED');
  await rejectsWith(() => svc.calculateShipping({ subtotal: 5000, city: 'Dubai', country: 'UAE' }), 'SHIPPING_NOT_AVAILABLE');
});

test('POST /shipping/options: Lahore is deliverable with a flat charge, COD off, wallet on', async () => {
  const ShippingRule = load('models', 'ShippingRule.js');
  const StoreSettings = load('models', 'StoreSettings.js');
  const svc = load('services', 'shippingRule.service.js');
  ShippingRule.find = () => ({ sort: () => ({ lean: async () => [{ _id: 'r2', isActive: true, type: 'flat', name: 'Pakistan-wide', country: 'Pakistan', flatRate: 450, priority: 9 }] }) });
  StoreSettings.findOneAndUpdate = () => ({ lean: async () => ({ key: 'store', ...WALLET_ON }) });

  const lhr = await svc.getCheckoutOptions({ subtotal: 5000, city: 'Lahore', province: 'Punjab' });
  assert.equal(lhr.deliverable, true);
  assert.equal(lhr.shipping.amount, 450);
  assert.deepEqual(lhr.payment.methods, ['jazzcash_manual']);
  assert.equal(lhr.payment.cod.available, false);
  assert.equal(lhr.payment.jazzcashManual.walletNumber, '03001234567');

  const khi = await svc.getCheckoutOptions({ subtotal: 5000, city: 'Karachi', province: 'Sindh' });
  assert.deepEqual(khi.payment.methods, ['cod', 'jazzcash_manual']);

  const dxb = await svc.getCheckoutOptions({ subtotal: 5000, city: 'Dubai', country: 'UAE' });
  assert.equal(dxb.deliverable, false);
  assert.deepEqual(dxb.payment.methods, []);
  assert.equal('walletNumber' in dxb.payment.jazzcashManual, false); // details only when usable

  ShippingRule.find = () => ({ sort: () => ({ lean: async () => [] }) });
  const noRate = await svc.getCheckoutOptions({ subtotal: 5000, city: 'Lahore', province: 'Punjab' });
  assert.equal(noRate.deliverable, true); // still deliverable ...
  assert.equal(noRate.shipping, null); // ... but the charge is a visible config gap, not Rs. 0
  assert.equal(noRate.shippingIssue.code, 'SHIPPING_RATE_NOT_CONFIGURED');
});

/* ------------------------------------------------------------ the API enforces it (not just the UI) */

const orderBody = (over = {}) => ({
  items: [{ sku: '64b000000000000000000001', quantity: 1 }],
  customer: { name: 'Ali Khan', email: 'ali@example.com', phone: '03001234567' },
  shippingAddress: { fullName: 'Ali Khan', phone: '03001234567', addressLine1: 'House 1, Street 2', city: 'Lahore', province: 'Punjab', country: 'Pakistan' },
  paymentMethod: 'cod',
  ...over,
});

test('order validator: cod + jazzcash_manual accepted, the online gateway is not', () => {
  const v = load('validators', 'order.validators.js');
  assert.equal(v.createRetailOrderBody.safeParse(orderBody()).success, true);
  assert.equal(v.createRetailOrderBody.safeParse(orderBody({ paymentMethod: 'jazzcash_manual', paymentReference: 'T250611123456' })).success, true);
  assert.equal(v.createRetailOrderBody.safeParse(orderBody({ paymentMethod: 'jazzcash' })).success, false);
  assert.equal(v.createRetailOrderBody.safeParse(orderBody({ paymentMethod: 'cod', paymentReference: 'ab' })).success, false);
});

test('a hand-made API request cannot create COD outside Karachi, nor use a disabled wallet', async () => {
  const StoreSettings = load('models', 'StoreSettings.js');
  const orders = load('services', 'order.service.js');
  StoreSettings.findOneAndUpdate = () => ({ lean: async () => ({ key: 'store', ...WALLET_ON }) });

  await rejectsWith(() => orders.createRetailOrder(orderBody()), 'COD_NOT_AVAILABLE_FOR_LOCATION');
  await rejectsWith(() => orders.createRetailOrder(orderBody({ shippingAddress: { ...orderBody().shippingAddress, city: 'Karachi', province: 'Punjab' } })), 'COD_NOT_AVAILABLE_FOR_LOCATION');
  await rejectsWith(() => orders.createRetailOrder(orderBody({ shippingAddress: { ...orderBody().shippingAddress, country: 'United Arab Emirates', city: 'Dubai' } })), 'DELIVERY_COUNTRY_UNSUPPORTED');
  await rejectsWith(() => orders.createRetailOrder(orderBody({ currency: 'USD', paymentMethod: 'jazzcash_manual' })), 'USD_PAYMENT_UNAVAILABLE');
  await rejectsWith(() => orders.createRetailOrder(orderBody({ paymentMethod: 'jazzcash_manual', paymentReference: 'T250611123456', shippingAddress: { ...orderBody().shippingAddress, city: 'Karachi', province: 'Sindh' } }).paymentReference ? orderBody({ paymentMethod: 'cod', paymentReference: 'T250611123456', shippingAddress: { ...orderBody().shippingAddress, city: 'Karachi', province: 'Sindh' } }) : orderBody()), 'PAYMENT_REFERENCE_NOT_APPLICABLE');

  StoreSettings.findOneAndUpdate = () => ({ lean: async () => ({ key: 'store', ...WALLET_OFF }) });
  await rejectsWith(() => orders.createRetailOrder(orderBody({ paymentMethod: 'jazzcash_manual' })), 'PAYMENT_METHOD_UNAVAILABLE');
});

/* ------------------------------------------------------------ manual payment ledger row */

test('manual wallet payment row: gateway jazzcash_manual, pending, reference kept in the non-unique snapshot', async () => {
  const Payment = load('models', 'Payment.js');
  const Counter = load('models', 'Counter.model.js');
  const pay = load('services', 'payment.service.js');
  let created;
  Counter.findOneAndUpdate = async () => ({ sequence: 7 });
  Payment.findOne = () => ({ session: () => ({ sort: async () => null }) });
  Payment.create = async ([doc]) => { created = doc; return [doc]; };
  const order = { _id: 'o1', user: null, currency: 'PKR', pricing: { total: 4950 } };
  await pay.createManualWalletPaymentInSession(order, {}, 'T250611123456');
  assert.equal(created.gateway, 'jazzcash_manual');
  assert.equal(created.status, 'pending');
  assert.equal(created.amount, 4950);
  assert.equal(created.providerResponse.reference, 'T250611123456');
  assert.equal(created.transactionId, undefined);
  await rejectsWith(() => pay.createManualWalletPaymentInSession({ ...order, currency: 'USD' }, {}), 'PAYMENT_CURRENCY_UNSUPPORTED');
  assert.equal(load('constants', 'Payment.js').PAYMENT_GATEWAYS.JAZZCASH_MANUAL, 'jazzcash_manual');
});
