'use strict';

/*
 * INTEGRATION TESTS - need a reachable MongoDB REPLICA SET (Atlas works).
 *
 *   npm run test:integration
 *
 * test/setup-env.js has already verified that MONGODB_TEST_URI points at a
 * database whose name contains "test" and differs from MONGODB_URI. All
 * documents created here are tagged and removed afterwards.
 *
 * STATUS: written but NOT executed by the author (no MongoDB was reachable in
 * the build environment). Run them against your Atlas test database.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');

const SRC = path.join(__dirname, '..', '..', 'src');
const load = (...p) => require(path.join(SRC, ...p));

const { connectDB, disconnectDB } = load('config', 'db.js');
const Sku = load('models', 'Sku.js');
const Category = load('models', 'Category.js');
const Media = load('models', 'Media.js');
const CancellationRequest = load('models', 'CancellationRequest.js');
const stockReservation = load('services', 'stockReservation.service.js');
const lifecycle = load('services', 'orderLifecycle.service.js');
const mediaReferences = load('services', 'mediaReference.service.js');
const { nextSequence } = load('services', 'counter.services.js');

const TAG = `ITEST-${Date.now()}`;

before(async () => {
  await connectDB();
  await Promise.all([Sku.init(), Media.init(), CancellationRequest.init()]);
});

after(async () => {
  // If connecting failed there is nothing to clean up; without this guard the
  // deleteMany calls below would just buffer for 10s and bury the real error.
  if (mongoose.connection.readyState !== 1) return;

  await Sku.deleteMany({ sku: new RegExp(`^${TAG}`) });
  await Category.collection.deleteMany({ name: new RegExp(`^${TAG}`) });
  await Media.deleteMany({ publicId: new RegExp(`^${TAG}`) });
  await CancellationRequest.deleteMany({ reason: new RegExp(`^${TAG}`) });
  await mongoose.connection.db.collection('counters').deleteMany({ key: new RegExp(`^${TAG}`) }).catch(() => {});
  await disconnectDB();
});

async function makeSku(stock, suffix) {
  const _id = new mongoose.Types.ObjectId();

  await Sku.collection.insertOne({
    _id,
    product: new mongoose.Types.ObjectId(),
    variant: new mongoose.Types.ObjectId(),
    sku: `${TAG}-${suffix}`,
    size: '42',
    price: 1000,
    stock,
    reservedStock: 0,
    available: stock,
    lowStockThreshold: 2,
    stockStatus: 'ok',
    isEnabled: true,
  });

  return _id;
}

async function inTransaction(fn) {
  const session = await mongoose.startSession();

  try {
    return await session.withTransaction(() => fn(session));
  } finally {
    await session.endSession();
  }
}

test('reserve -> release returns the SKU to its original state', async () => {
  const id = await makeSku(10, 'A');

  await inTransaction((session) => stockReservation.reserveSku(id, 3, session));
  let sku = await Sku.findById(id).lean();
  assert.deepEqual([sku.stock, sku.reservedStock, sku.available], [10, 3, 7]);

  await inTransaction((session) => stockReservation.releaseSku(id, 3, session));
  sku = await Sku.findById(id).lean();
  assert.deepEqual([sku.stock, sku.reservedStock, sku.available], [10, 0, 10]);
});

test('reserve -> commit deducts physical stock once and keeps available unchanged', async () => {
  const id = await makeSku(10, 'B');

  await inTransaction((session) => stockReservation.reserveSku(id, 4, session));

  const order = { orderType: 'retail', items: [{ sku: id, quantity: 4 }] };

  await inTransaction((session) => lifecycle.commitOrderStock(order, session));
  const sku = await Sku.findById(id).lean();

  assert.deepEqual([sku.stock, sku.reservedStock, sku.available], [6, 0, 6]);
  assert.ok(order.stockCommittedAt);

  // second call (same in-memory order) must not deduct again
  await inTransaction((session) => lifecycle.commitOrderStock(order, session));
  assert.equal((await Sku.findById(id).lean()).stock, 6);
});

test('overselling is impossible: 20 concurrent reservations on 5 units', async () => {
  const id = await makeSku(5, 'C');

  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () => inTransaction((session) => stockReservation.reserveSku(id, 1, session))),
  );

  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const sku = await Sku.findById(id).lean();

  assert.equal(ok, 5, 'exactly the available units may be reserved');
  assert.deepEqual([sku.stock, sku.reservedStock, sku.available], [5, 5, 0]);
  assert.equal(sku.stockStatus, 'out');
});

test('a failed multi-SKU reservation rolls back every SKU', async () => {
  const plenty = await makeSku(10, 'D1');
  const scarce = await makeSku(1, 'D2');

  await assert.rejects(
    inTransaction(async (session) => {
      await stockReservation.reserveSku(plenty, 2, session);
      await stockReservation.reserveSku(scarce, 5, session); // insufficient
    }),
    (error) => error.code === 'INSUFFICIENT_STOCK',
  );

  const a = await Sku.findById(plenty).lean();
  assert.deepEqual([a.reservedStock, a.available], [0, 10]);
});

test('counters stay unique under concurrency', async () => {
  const key = `${TAG}-counter`;
  const values = await Promise.all(Array.from({ length: 25 }, () => nextSequence(key)));

  assert.equal(new Set(values).size, 25);
  assert.equal(Math.min(...values), 1);
  assert.equal(Math.max(...values), 25);
});

test('only one pending cancellation request per order (unique partial index)', async () => {
  const order = new mongoose.Types.ObjectId();
  const user = new mongoose.Types.ObjectId();

  await CancellationRequest.create({ order, user, requestedBy: 'customer', reason: `${TAG} first` });

  await assert.rejects(
    CancellationRequest.create({ order, user, requestedBy: 'customer', reason: `${TAG} second` }),
    (error) => error.code === 11000,
  );
});

test('media still referenced by a document is detected; unreferenced is not', async () => {
  const used = `${TAG}-used`;
  const free = `${TAG}-free`;

  await Category.collection.insertOne({ name: `${TAG} category`, image: { url: 'https://x/y.png', publicId: used } });

  assert.equal((await mediaReferences.isReferenced(used)).referenced, true);
  assert.equal((await mediaReferences.isReferenced(free)).referenced, false);
});

test('Media.publicId is unique', async () => {
  const doc = {
    publicId: `${TAG}-dup`,
    resourceType: 'image',
    url: 'https://res.cloudinary.com/demo/image/upload/v1/x.png',
    purpose: 'avatar',
    folder: 'pehanly/test/avatars',
    uploadedBy: new mongoose.Types.ObjectId(),
    uploadedByRole: 'customer',
  };

  await Media.create(doc);
  await assert.rejects(Media.create(doc), (error) => error.code === 11000);
});
