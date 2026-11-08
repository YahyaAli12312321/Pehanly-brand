'use strict';

/*
 * Permanent delete for products and categories. Mongoose models are replaced by stubs, so these tests check the
 * rules and the cascade (what is deleted, what is refused), not a real MongoDB.
 */
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-unit-test-secret-1234';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pehanly_unit_test';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Product = require('../src/models/Product');
const ProductVariant = require('../src/models/ProductVariant');
const Sku = require('../src/models/Sku');
const Category = require('../src/models/Category');
const InventoryTransaction = require('../src/models/InventoryTransaction');
const productService = require('../src/services/product.service');
const categoryService = require('../src/services/category.service');
const deletion = require('../src/services/deletion.service');
const Review = require('../src/models/Review');

const PID = '507f1f77bcf86cd799439011';
const CID = '507f1f77bcf86cd799439022';
const actor = { id: '507f1f77bcf86cd799439099' };

/** Counts returned by the optional models, keyed by model name. */
let counts;
let deleted;

const lean = (v) => ({ lean: async () => v, select: () => ({ lean: async () => v }) });

beforeEach(() => {
  counts = { Order: 0, ReturnRefundRequest: 0, Quote: 0, Wholesale: 0, Category: 0, Product: 0 };
  deleted = [];

  Product.findById = () => lean({ _id: PID, name: 'Heavy Tee', status: 'active' });
  Product.deleteOne = async (f) => { deleted.push(['Product', f]); return { deletedCount: 1 }; };
  ProductVariant.countDocuments = async () => 2;
  ProductVariant.deleteMany = async (f) => { deleted.push(['ProductVariant', f]); };
  Sku.countDocuments = async () => 7;
  Sku.deleteMany = async (f) => { deleted.push(['Sku', f]); };
  InventoryTransaction.deleteMany = async (f) => { deleted.push(['InventoryTransaction', f]); };
  Category.findById = () => lean({ _id: CID, name: 'Tops', slug: 'tops', isActive: true });
  Category.deleteOne = async (f) => { deleted.push(['Category', f]); return { deletedCount: 1 }; };
  Category.find = () => ({ select: () => ({ lean: async () => [] }) });
  Category.countDocuments = async () => counts.Category;

  // The deletion service holds direct model references; stub their counts.
  for (const [name, Model] of Object.entries(deletion._models)) {
    if (name === 'Category') continue;                       // Category is stubbed above
    Model.countDocuments = async () => counts[name] || 0;
  }
  Review.deleteMany = async (f) => { deleted.push(['Review', f]); };
  mongoose.modelNames = () => ['Review'];
  mongoose.model = () => Review;
});

test('every model the checks rely on is really loaded - an unimported model can never look like "no references"', () => {
  assert.deepEqual(
    Object.entries(deletion._models).filter(([, M]) => !M).map(([n]) => n),
    [],
  );
});

/* ----------------------------- product preview ---------------------------- */

test('preview reports what would be removed when nothing references the product', async () => {
  const p = await productService.deletePreview(PID);
  assert.deepEqual(p, { id: PID, name: 'Heavy Tee', status: 'active', variants: 2, skus: 7, blockers: [], canDelete: true });
});

test('preview lists every kind of reference that blocks a delete', async () => {
  counts.Order = 2;
  counts.Quote = 1;
  counts.Wholesale = 3;

  const p = await productService.deletePreview(PID);
  assert.equal(p.canDelete, false);
  assert.deepEqual(p.blockers.map((b) => [b.key, b.count, b.text]), [
    ['orders', 2, '2 orders'],
    ['quotes', 1, '1 quote'],
    ['packs', 3, '3 wholesale packs or requests'],
  ]);
});

/* ------------------------------ product delete ---------------------------- */

test('an unused product is removed with its variants, SKUs, stock ledger and reviews', async () => {
  const res = await productService.remove(PID, actor);

  assert.deepEqual(res, { id: PID, name: 'Heavy Tee', variants: 2, skus: 7 });
  assert.deepEqual(deleted.map(([m]) => m).sort(), ['InventoryTransaction', 'Product', 'ProductVariant', 'Review', 'Sku']);
  for (const [, filter] of deleted) assert.ok(String(filter.product || filter._id) === PID, 'every delete is scoped to this product');
});

test('a product that has been ordered is refused, and nothing is deleted', async () => {
  counts.Order = 1;

  await assert.rejects(() => productService.remove(PID, actor), (err) => {
    assert.equal(err.statusCode, 409);
    assert.equal(err.code, 'PRODUCT_IN_USE');
    assert.match(err.message, /used by 1 order/);
    assert.match(err.message, /Deactivate it instead/);
    return true;
  });
  assert.deepEqual(deleted, []);
});

test('the refusal message counts every reference in plain English', async () => {
  counts.Order = 2;
  counts.ReturnRefundRequest = 1;

  await assert.rejects(() => productService.remove(PID, actor), (err) => {
    assert.match(err.message, /2 orders and 1 return or refund request/);
    return true;
  });
});

test('deleting a product that does not exist is a 404', async () => {
  Product.findById = () => lean(null);
  await assert.rejects(() => productService.remove(PID, actor), (err) => err.statusCode === 404 && err.code === 'PRODUCT_NOT_FOUND');
});

/* ------------------------------ category delete --------------------------- */

test('an empty category is removed', async () => {
  const res = await categoryService.remove(CID, actor);
  assert.deepEqual(res, { id: CID, name: 'Tops' });
  assert.deepEqual(deleted, [['Category', { _id: CID }]]);
});

test('a category with sub-categories or products is refused', async () => {
  counts.Category = 2;
  counts.Product = 5;

  const preview = await categoryService.deletePreview(CID);
  assert.equal(preview.canDelete, false);
  assert.deepEqual(preview.blockers.map((b) => b.text), ['2 sub-categories', '5 products']);

  await assert.rejects(() => categoryService.remove(CID, actor), (err) => {
    assert.equal(err.statusCode, 409);
    assert.equal(err.code, 'CATEGORY_NOT_EMPTY');
    assert.match(err.message, /2 sub-categories and 5 products/);
    assert.match(err.message, /deactivate the category instead/);
    return true;
  });
  assert.deepEqual(deleted, []);
});

test('products anywhere in the subtree block the delete, not just direct children', async () => {
  Category.find = () => ({ select: () => ({ lean: async () => [{ _id: '507f1f77bcf86cd799439033', parentCategory: CID }] }) });
  counts.Product = 1;

  const preview = await categoryService.deletePreview(CID);
  assert.deepEqual(preview.blockers.map((b) => b.text), ['1 product']);
});

test('deleting a category that does not exist is a 404', async () => {
  Category.findById = () => lean(null);
  await assert.rejects(() => categoryService.remove(CID, actor), (err) => err.statusCode === 404 && err.code === 'CATEGORY_NOT_FOUND');
});

/* --------------------------------- helpers -------------------------------- */

test('describe() reads naturally, including irregular plurals', () => {
  assert.equal(deletion.describe([]), '');
  assert.equal(deletion.describe([{ label: 'order', count: 1 }]), '1 order');
  assert.equal(deletion.describe([{ label: 'order', count: 2 }, { label: 'quote', count: 1 }]), '2 orders and 1 quote');
  assert.equal(deletion.describe([{ label: 'sub-category', count: 2 }]), '2 sub-categories');
  assert.equal(
    deletion.describe([{ label: 'order', count: 2 }, { label: 'quote', count: 3 }, { label: 'wholesale pack', count: 1 }]),
    '2 orders, 3 quotes and 1 wholesale pack',
  );
});

test('a check that cannot run blocks the delete instead of silently allowing it', async () => {
  deletion._models.Order.countDocuments = async () => { throw new Error('connection lost'); };

  const preview = await productService.deletePreview(PID);
  assert.equal(preview.canDelete, false);
  assert.deepEqual(preview.blockers.map((b) => b.key), ['unverified']);

  await assert.rejects(() => productService.remove(PID, actor), (err) => err.code === 'PRODUCT_IN_USE');
  assert.deepEqual(deleted, [], 'nothing is deleted when a reference check failed');
});

test('a failed check is reported alongside the references that were found', async () => {
  counts.Order = 1;
  deletion._models.Quote.countDocuments = async () => { throw new Error('boom'); };

  const preview = await productService.deletePreview(PID);
  assert.deepEqual(preview.blockers.map((b) => b.key), ['orders', 'unverified']);
});
