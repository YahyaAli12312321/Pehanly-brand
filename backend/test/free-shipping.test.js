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
const ShippingRule = require(path.join(SRC, 'models', 'ShippingRule.js'));
const service = require(path.join(SRC, 'services', 'shippingRule.service.js'));
const validators = require(path.join(SRC, 'validators', 'shippingRule.validators.js'));

/** Replace ShippingRule.find with a chainable stub returning `rows`. */
const stubFind = (rows) => {
  const original = ShippingRule.find;
  let lastFilter = null;
  ShippingRule.find = (filter) => {
    lastFilter = filter;
    const chain = {
      sort: () => chain,
      select: () => chain,
      lean: async () => rows,
    };
    return chain;
  };
  return { restore: () => { ShippingRule.find = original; }, filter: () => lastFilter };
};

test('getFreeShippingInfo: reports the lowest threshold of active free_shipping rules for the country', async () => {
  const stub = stubFind([
    { name: 'Free over 8000', country: 'Pakistan', minimumOrderAmount: 8000 },
    { name: 'Free over 5000', country: 'pakistan', minimumOrderAmount: 5000 },
    { name: 'UAE free', country: 'UAE', minimumOrderAmount: 100 },
  ]);
  try {
    const info = await service.getFreeShippingInfo({ country: 'Pakistan' });
    assert.deepEqual(info, {
      available: true,
      country: 'Pakistan',
      currency: 'PKR',
      minimumOrderAmount: 5000,
      ruleName: 'Free over 5000',
    });
    assert.deepEqual(stub.filter(), { isActive: true, type: 'free_shipping' });
  } finally {
    stub.restore();
  }
});

test('getFreeShippingInfo: not available when there is no applicable rule (never invents a threshold)', async () => {
  const stub = stubFind([{ name: 'UAE free', country: 'UAE', minimumOrderAmount: 100 }, { name: 'bad', country: 'Pakistan' }]);
  try {
    const info = await service.getFreeShippingInfo({});
    assert.equal(info.available, false);
    assert.equal(info.minimumOrderAmount, null);
    assert.equal(info.ruleName, null);
  } finally {
    stub.restore();
  }
});

test('freeShippingQuery validator: defaults country and rejects unknown keys', () => {
  assert.equal(validators.freeShippingQuery.parse({}).country, 'Pakistan');
  assert.throws(() => validators.freeShippingQuery.parse({ foo: 'bar' }));
});

test('route is registered publicly on /shipping/free-shipping', () => {
  const router = require(path.join(SRC, 'routes', 'shippingRule.routes.js'));
  const layers = router.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
  assert.ok(layers.includes('GET /free-shipping'));
  assert.ok(layers.includes('POST /calculate'));
});
