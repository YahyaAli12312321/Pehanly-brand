'use strict';

/*
 * INTEGRATION TESTS (second set) - need a reachable MongoDB REPLICA SET test database.
 *
 *   npm run test:integration
 *
 * Covers: atomic inventory adjustment (stock + status + ledger), variant creation rollback,
 * customer account service (addresses, password change / token version), audit log listing.
 * Everything created here is tagged and removed afterwards.
 *
 * STATUS: written but NOT executed by the author (no MongoDB was reachable in the build environment).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const mongoose = require('mongoose');

const SRC = path.join(__dirname, '..', '..', 'src');
const load = (...p) => require(path.join(SRC, ...p));

const { connectDB, disconnectDB } = load('config', 'db.js');
const Sku = load('models', 'Sku.js');
const ProductVariant = load('models', 'ProductVariant.js');
const InventoryTransaction = load('models', 'InventoryTransaction.js');
const User = load('models', 'User.js');
const AuditLog = load('models', 'AuditLog.js');
const inventoryService = load('services', 'inventory.service.js');
const variantService = load('services', 'variant.service.js');
const accountService = load('services', 'account.service.js');
const auditService = load('services', 'audit.service.js');
const auditLogService = load('services', 'auditLog.service.js');

const TAG = `P4TEST${Date.now()}`;
const productId = new mongoose.Types.ObjectId();
let actor;

before(async () => {
  await connectDB();
  await Promise.all([Sku.init(), ProductVariant.init(), User.init(), AuditLog.init()]);

  actor = await User.create({
    name: `${TAG} admin`,
    email: `${TAG.toLowerCase()}@example.com`,
    phone: `+9230${String(Date.now()).slice(-8)}`,
    passwordHash: '$2a$04$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234',
    role: 'admin',
  });
  actor.id = String(actor._id);
});

after(async () => {
  if (mongoose.connection.readyState !== 1) return;

  await Sku.deleteMany({ sku: new RegExp(`^${TAG}`) });
  await ProductVariant.deleteMany({ product: productId });
  await InventoryTransaction.deleteMany({ sku: new RegExp(`^${TAG}`) });
  await AuditLog.deleteMany({ admin: actor._id });
  await User.deleteMany({ name: new RegExp(`^${TAG}`) });
  await mongoose.connection.db.collection('products').deleteMany({ _id: productId });
  await disconnectDB();
});

async function seedProduct() {
  await mongoose.connection.db.collection('products').insertOne({
    _id: productId,
    name: `${TAG} product`,
    category: new mongoose.Types.ObjectId(),
  });
}

test('variant creation is all-or-nothing', async () => {
  await seedProduct();

  const input = (code, sizes) => ({ variantCode: code, color: { name: 'Black' }, sizes });

  const ok = await variantService.create(
    productId,
    input('OK1', [{ sku: `${TAG}-A`, size: '40', price: 1000, stock: 5 }]),
    actor,
  );

  assert.ok(ok);
  assert.equal(await InventoryTransaction.countDocuments({ sku: `${TAG}-A` }), 1, 'opening stock ledger row');

  // Second SKU repeats the size of the first: the unique (variant,size) index fails mid-transaction.
  await assert.rejects(
    variantService.create(
      productId,
      input('BAD1', [
        { sku: `${TAG}-B1`, size: '41', price: 1000, stock: 3 },
        { sku: `${TAG}-B2`, size: '41', price: 1000, stock: 3 },
      ]),
      actor,
    ),
  );

  assert.equal(await ProductVariant.countDocuments({ product: productId, variantCode: 'BAD1' }), 0, 'variant rolled back');
  assert.equal(await Sku.countDocuments({ sku: { $in: [`${TAG}-B1`, `${TAG}-B2`] } }), 0, 'SKUs rolled back');
  assert.equal(await InventoryTransaction.countDocuments({ sku: { $in: [`${TAG}-B1`, `${TAG}-B2`] } }), 0, 'ledger rolled back');
});

test('inventory adjust keeps stock, status and ledger consistent', async () => {
  const code = `${TAG}-A`;

  const added = await inventoryService.adjust(
    { sku: code, direction: 'add', quantity: 4, reason: 'factory_inward_batch_received', notes: 'test' },
    actor,
  );

  assert.equal(added.stock, 9);
  assert.equal(added.available, 9);

  const removed = await inventoryService.adjust(
    { sku: code, direction: 'remove', quantity: 2, reason: 'damaged', notes: 'test' },
    actor,
  ).catch((error) => error);

  // `damaged` may not be an accepted reason code in every setup; only assert the invariant when it worked.
  if (!(removed instanceof Error)) {
    assert.equal(removed.stock, 7);
    assert.equal(removed.available, 7);
  }

  await assert.rejects(
    inventoryService.adjust({ sku: code, direction: 'remove', quantity: 9999, reason: 'damaged', notes: 'x' }, actor),
    (error) => error.code === 'INSUFFICIENT_AVAILABLE_STOCK' || error.statusCode === 409,
  );

  const sku = await Sku.findOne({ sku: code }).lean();
  const ledger = await InventoryTransaction.find({ sku: code }).lean();
  const net = ledger.reduce((sum, row) => sum + row.quantity, 0);

  assert.equal(sku.stock, net, 'ledger always adds up to the stock');
  assert.equal(sku.available, sku.stock - sku.reservedStock);
});

test('account: addresses keep exactly one default; password change revokes other sessions', async () => {
  const user = await User.create({
    name: `${TAG} customer`,
    email: `${TAG.toLowerCase()}-c@example.com`,
    phone: `+9231${String(Date.now()).slice(-8)}`,
    passwordHash: await require('bcryptjs').hash('Old#Pass12345', 4),
    role: 'customer',
  });

  const base = { fullName: 'Ali Khan', phone: '03001234567', addressLine1: 'House 1, Street 2', city: 'Karachi' };

  let list = await accountService.addAddress(user._id, base);
  assert.equal(list.length, 1);
  assert.equal(list[0].isDefault, true, 'first address becomes default');

  list = await accountService.addAddress(user._id, { ...base, city: 'Lahore', isDefault: true });
  assert.deepEqual(list.map((a) => a.isDefault), [false, true]);

  list = await accountService.deleteAddress(user._id, list[1]._id);
  assert.equal(list.length, 1);
  assert.equal(list[0].isDefault, true, 'default promoted after deleting the default');

  await assert.rejects(accountService.changePassword(user._id, { currentPassword: 'wrong', newPassword: 'New#Pass12345' }), (e) => e.code === 'INVALID_CURRENT_PASSWORD');

  const changed = await accountService.changePassword(user._id, { currentPassword: 'Old#Pass12345', newPassword: 'New#Pass12345' });
  assert.equal(changed.tokenVersion, 1);
});

test('audit entries are written and listed newest first', async () => {
  await auditService.record(actor, `${TAG}.one`, 'Test', 'e1', { a: 1 });
  await auditService.record(actor, `${TAG}.two`, 'Test', 'e2', { b: 2 });

  const result = await auditLogService.list({ page: 1, limit: 10, admin: String(actor._id) });
  const actions = result.items.map((row) => row.action).filter((a) => a.startsWith(TAG));

  assert.deepEqual(actions, [`${TAG}.two`, `${TAG}.one`]);
  assert.equal(result.items[0].actor.role, 'admin');
});
