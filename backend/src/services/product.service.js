'use strict';
const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Sku = require('../models/Sku');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const { slugify, escapeRegex } = require('../utils/slugify');
const categoryService = require('./category.service');
const { audienceCondition } = require('./audience');
const audit = require('./audit.service');
const { variantView, summarize } = require('../utils/presenter');
const deletion = require('./deletion.service');
const InventoryTransaction = require('../models/InventoryTransaction');
const { SALES_CHANNELS, effectiveChannel, channelFilter } = require('../constants/salesChannel');

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

/**
 * Resolve the sales channel + wholesale flag of a create/update so the two can never contradict each other.
 *   wholesale | both -> wholesale.isEnabled = true (MOQ required); retail -> wholesale.isEnabled = false.
 * A legacy client that only sends `wholesale` keeps working: enabling it on a retail product makes it "both"; disabling it on a
 * wholesale-ONLY product is refused (it would leave the product sellable nowhere).
 * Returns the fields to set (salesChannel / wholesale) or {} when neither was given.
 */
function resolveChannel(input, existing) {
  const hasChannel = input.salesChannel !== undefined;
  const hasWholesale = input.wholesale !== undefined;
  if (!hasChannel && !hasWholesale) return {};
  const current = existing ? effectiveChannel(existing) : SALES_CHANNELS.RETAIL;
  let channel;
  if (hasChannel) {
    channel = input.salesChannel;
    if (hasWholesale && Boolean(input.wholesale.isEnabled) !== (channel !== SALES_CHANNELS.RETAIL)) {
      throw ApiError.badRequest(`Sales channel "${channel}" conflicts with wholesale.isEnabled=${input.wholesale.isEnabled}`, 'SALES_CHANNEL_CONFLICT');
    }
  } else if (input.wholesale.isEnabled) {
    channel = current === SALES_CHANNELS.RETAIL ? SALES_CHANNELS.BOTH : current;
  } else if (current === SALES_CHANNELS.WHOLESALE) {
    throw ApiError.badRequest('This product is wholesale-only. Change its sales channel instead of disabling wholesale.', 'SALES_CHANNEL_CONFLICT');
  } else {
    channel = SALES_CHANNELS.RETAIL;
  }
  const wholesaleOn = channel !== SALES_CHANNELS.RETAIL;
  const prev = existing?.wholesale?.toObject ? existing.wholesale.toObject() : existing?.wholesale || {};
  const wholesale = wholesaleOn
    ? { ...(hasWholesale ? input.wholesale : prev), isEnabled: true }
    : { ...(hasWholesale ? input.wholesale : prev), isEnabled: false };
  if (wholesaleOn && !(wholesale.moq >= 1)) {
    throw ApiError.badRequest('A minimum wholesale quantity (MOQ) is required for wholesale products', 'WHOLESALE_MOQ_REQUIRED');
  }
  return { salesChannel: channel, wholesale };
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
  if (q.channel) filter.$and = [...(filter.$and || []), channelFilter(q.channel)];
  if (q.featured !== undefined) filter.isFeatured = q.featured;
  if (q.category) filter.category = { $in: (await categoryService.subtreeIds(q.category)).map((i) => new mongoose.Types.ObjectId(i)) };
  if (q.audience) {
    const cond = await audienceCondition(q.audience, categoryService);
    filter.$and = [...(filter.$and || []), cond];
  }
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
    salesChannel: effectiveChannel(d),
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
    salesChannel: effectiveChannel(product),
    variants: variants.map((v) => variantView(v, skus)),
    summary: summarize(variants, skus),
    readiness: readiness(variants, skus),
  };
}

async function create(input, actor, req) {
  await assertCategory(input.category);
  await categoryService.assertAssignable(input.category); // inactive categories cannot receive new products
  const channelFields = resolveChannel(input, null);
  await assertWholesaleAllowed(input.category, (channelFields.wholesale || input.wholesale)?.isEnabled);
  input = { ...input, ...channelFields };
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
  if (input.category && String(input.category) !== String(doc.category)) await categoryService.assertAssignable(input.category); // only when it changes
  const finalCategory = input.category ?? doc.category;
  const channelFields = resolveChannel(input, doc);
  input = { ...input, ...channelFields };
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

/**
 * What a permanent delete would remove, and what is stopping it.
 * The admin dashboard calls this before showing the confirmation, so the warning is specific rather than generic.
 */
async function deletePreview(id) {
  const product = await Product.findById(id).select('name status').lean();
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');

  const [variants, skus, blockers] = await Promise.all([
    ProductVariant.countDocuments({ product: id }),
    Sku.countDocuments({ product: id }),
    deletion.productBlockers(id),
  ]);

  return { id: String(product._id), name: product.name, status: product.status, variants, skus, blockers, canDelete: blockers.length === 0 };
}

/**
 * Permanently removes a product and everything that exists only to describe it: its variants, their SKUs, the stock
 * ledger for those SKUs and its reviews. Refused while anything else still references the product, so order, quote,
 * return and wholesale history can never end up pointing at a product that no longer exists.
 */
async function remove(id, actor, req) {
  const preview = await deletePreview(id);

  if (!preview.canDelete) {
    throw ApiError.conflict(
      `This product is used by ${deletion.describe(preview.blockers)}, so it cannot be deleted. Deactivate it instead to hide it from the store.`,
      'PRODUCT_IN_USE',
    );
  }

  const Review = mongoose.modelNames().includes('Review') ? mongoose.model('Review') : null;

  await Promise.all([
    Sku.deleteMany({ product: id }),
    ProductVariant.deleteMany({ product: id }),
    InventoryTransaction.deleteMany({ product: id }),
    Review ? Review.deleteMany({ product: id }) : Promise.resolve(),
  ]);
  await Product.deleteOne({ _id: id });

  await audit.record(actor, 'product.delete', 'Product', id, { name: preview.name, variants: preview.variants, skus: preview.skus }, req);
  return { id: String(id), name: preview.name, variants: preview.variants, skus: preview.skus };
}

module.exports = { list, summary, getById, create, update, changeStatus, bulk, deletePreview, remove, _internals: { resolveChannel } };
