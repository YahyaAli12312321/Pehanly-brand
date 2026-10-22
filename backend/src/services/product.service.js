'use strict';
const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Sku = require('../models/Sku');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const { slugify, escapeRegex } = require('../utils/slugify');
const categoryService = require('./category.service');
const audit = require('./audit.service');
const { variantView, summarize } = require('../utils/presenter');

async function uniqueSlug(base, excludeId) {
  const root = slugify(base) || 'product';
  let slug = root;
  for (let i = 2; i < 200; i += 1) {
    if (!(await Product.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }))) return slug;
    slug = `${root}-${i}`;
  }
  throw ApiError.conflict('Could not generate a unique slug', 'SLUG_CONFLICT');
}

async function assertCategory(categoryId) {
  if (!(await Category.exists({ _id: categoryId }))) throw ApiError.badRequest('Category not found', 'INVALID_CATEGORY');
}

/** Retail-only categories (e.g. Ladies Shoes) can never be wholesale-enabled. */
async function assertWholesaleAllowed(categoryId, wholesaleEnabled) {
  if (wholesaleEnabled && (await categoryService.isRetailOnly(categoryId))) {
    throw ApiError.badRequest('Products in this category are retail only and cannot be offered wholesale', 'RETAIL_ONLY');
  }
}

async function loadVariantsAndSkus(productIds) {
  const [variants, skus] = await Promise.all([
    ProductVariant.find({ product: { $in: productIds } }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    Sku.find({ product: { $in: productIds } }).lean(),
  ]);
  return { variants, skus };
}

function readiness(variants, skus) {
  const s = summarize(variants, skus);
  const issues = [];
  if (s.eligibleSkuCount === 0) issues.push('Add at least one enabled color with an enabled size and price.');
  return { ready: issues.length === 0, issues };
}

async function list(q) {
  const filter = {};
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), 'i');
    const bySku = await Sku.distinct('product', { sku: new RegExp(escapeRegex(q.search), 'i') });
    filter.$or = [{ name: re }, { slug: re }, ...(bySku.length ? [{ _id: { $in: bySku } }] : [])];
  }
  if (q.status) filter.status = q.status;
  if (q.featured !== undefined) filter.isFeatured = q.featured;
  if (q.category) filter.category = { $in: (await categoryService.subtreeIds(q.category)).map((i) => new mongoose.Types.ObjectId(i)) };
  if (q.stock) {
    const ids = await Sku.distinct('product', { isEnabled: true, stockStatus: q.stock });
    filter._id = { $in: ids };
  }
  const [total, docs] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter).sort({ [q.sortBy]: q.sortDir === 'asc' ? 1 : -1, _id: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).populate('category', 'name slug').lean(),
  ]);
  const { variants, skus } = await loadVariantsAndSkus(docs.map((d) => d._id));
  const items = docs.map((d) => ({
    ...d,
    ...summarize(variants.filter((v) => String(v.product) === String(d._id)), skus.filter((s) => String(s.product) === String(d._id))),
  }));
  return { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

async function summary() {
  const [total, active, draft, inactive, lowProducts, outProducts] = await Promise.all([
    Product.countDocuments({}),
    Product.countDocuments({ status: 'active' }),
    Product.countDocuments({ status: 'draft' }),
    Product.countDocuments({ status: 'inactive' }),
    Sku.distinct('product', { isEnabled: true, stockStatus: 'low' }),
    Sku.distinct('product', { isEnabled: true, stockStatus: 'out' }),
  ]);
  const [lowSkus, outSkus] = await Promise.all([Sku.countDocuments({ isEnabled: true, stockStatus: 'low' }), Sku.countDocuments({ isEnabled: true, stockStatus: 'out' })]);
  return { total, active, draft, inactive, lowStockProducts: lowProducts.length, lowStockSkus: lowSkus, outOfStockProducts: outProducts.length, outOfStockSkus: outSkus };
}

async function getById(id) {
  const product = await Product.findById(id).populate('category', 'name slug retailOnly').lean();
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
  const { variants, skus } = await loadVariantsAndSkus([product._id]);
  return {
    ...product,
    variants: variants.map((v) => variantView(v, skus)),
    summary: summarize(variants, skus),
    readiness: readiness(variants, skus),
  };
}

async function create(input, actor, req) {
  await assertCategory(input.category);
  await assertWholesaleAllowed(input.category, input.wholesale?.isEnabled);
  const slug = input.slug || (await uniqueSlug(input.name));
  if (input.slug && (await Product.exists({ slug }))) throw ApiError.conflict('This slug is already used', 'SLUG_CONFLICT');
  const doc = await Product.create({ ...input, slug, status: 'draft' }); // publishing is a separate, validated step
  await audit.record(actor, 'product.create', 'Product', doc._id, { name: doc.name }, req);
  return getById(doc._id);
}

async function update(id, input, actor, req) {
  const doc = await Product.findById(id);
  if (!doc) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
  if (input.category) await assertCategory(input.category);
  const finalCategory = input.category ?? doc.category;
  const finalWholesale = input.wholesale ? input.wholesale.isEnabled : doc.wholesale?.isEnabled;
  await assertWholesaleAllowed(finalCategory, finalWholesale);
  if (input.slug && input.slug !== doc.slug && (await Product.exists({ slug: input.slug, _id: { $ne: id } }))) {
    throw ApiError.conflict('This slug is already used', 'SLUG_CONFLICT');
  }
  Object.entries(input).forEach(([k, v]) => doc.set(k, v));
  await doc.save();
  return getById(id);
}

async function changeStatus(id, status, actor, req) {
  const doc = await Product.findById(id);
  if (!doc) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
  if (status === 'active') {
    const { variants, skus } = await loadVariantsAndSkus([doc._id]);
    const r = readiness(variants, skus);
    if (!r.ready) throw ApiError.conflict(`Product isn't ready to publish. ${r.issues.join(' ')}`, 'PRODUCT_NOT_READY');
  }
  const previous = doc.status;
  doc.status = status;
  await doc.save();
  await audit.record(actor, 'product.status', 'Product', doc._id, { from: previous, to: status }, req);
  return getById(id);
}

async function bulk({ ids, action }, actor, req) {
  const results = { updated: [], failed: [] };
  for (const id of ids) {
    try {
      if (action === 'activate') await changeStatus(id, 'active', actor, req);
      else if (action === 'deactivate') await changeStatus(id, 'inactive', actor, req);
      else {
        const r = await Product.updateOne({ _id: id }, { $set: { isFeatured: action === 'feature' } });
        if (!r.matchedCount) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
        await audit.record(actor, `product.${action}`, 'Product', id, {}, req);
      }
      results.updated.push(id);
    } catch (err) {
      if (!err.isOperational) throw err;
      results.failed.push({ id, reason: err.message });
    }
  }
  return results;
}

module.exports = { list, summary, getById, create, update, changeStatus, bulk };
