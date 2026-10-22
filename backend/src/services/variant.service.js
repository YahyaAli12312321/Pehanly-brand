'use strict';
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Sku = require('../models/Sku');
const InventoryTransaction = require('../models/InventoryTransaction');
const ApiError = require('../utils/ApiError');
const { stockStatus } = require('../utils/stock');
const categoryService = require('./category.service');
const audit = require('./audit.service');
const { variantView } = require('../utils/presenter');
const { runInTransaction } = require('../utils/transaction');

async function loadProduct(productId) {
  const product = await Product.findById(productId).select('category name').lean();
  if (!product) throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
  return product;
}

async function assertWholesalePricingAllowed(product, sizes) {
  if (sizes.some((s) => s.wholesalePrice != null) && (await categoryService.isRetailOnly(product.category))) {
    throw ApiError.badRequest('Retail-only products cannot have wholesale prices', 'RETAIL_ONLY');
  }
}

async function assertSkusFree(skus, exceptVariantId) {
  const clash = await Sku.find({ sku: { $in: skus }, ...(exceptVariantId ? { variant: { $ne: exceptVariantId } } : {}) }).select('sku').lean();
  if (clash.length) throw ApiError.conflict(`SKU already in use: ${clash.map((c) => c.sku).join(', ')}`, 'SKU_EXISTS');
}

function newSkuDoc(product, variant, s, index) {
  const stock = s.stock ?? 0;
  const doc = {
    product, variant, sku: s.sku, size: s.size, price: s.price,
    compareAtPrice: s.compareAtPrice ?? undefined, wholesalePrice: s.wholesalePrice ?? undefined,
    priceUSD: s.priceUSD ?? undefined, compareAtPriceUSD: s.compareAtPriceUSD ?? undefined,
    lowStockThreshold: s.lowStockThreshold, isEnabled: s.isEnabled ?? true,
    stock, reservedStock: 0, available: stock, sortOrder: index,
  };
  doc.stockStatus = stockStatus(doc);
  return doc;
}

async function recordInitialStock(skuDocs, actor, session) {
  const rows = skuDocs.filter((s) => s.stock > 0).map((s) => ({
    product: s.product, variant: s.variant, sku: s.sku, type: 'stock_in', quantity: s.stock,
    previousStock: 0, newStock: s.stock, reason: 'Initial stock', createdBy: actor.id,
  }));
  if (rows.length) await InventoryTransaction.insertMany(rows, { session });
}

async function create(productId, input, actor, req) {
  const product = await loadProduct(productId);
  await assertWholesalePricingAllowed(product, input.sizes);
  if (await ProductVariant.exists({ product: productId, variantCode: input.variantCode })) {
    throw ApiError.conflict('This variant code is already used for the product', 'VARIANT_CODE_EXISTS');
  }
  await assertSkusFree(input.sizes.map((s) => s.sku));

  const { sizes, ...variantFields } = input;

  // Variant + SKUs + opening stock ledger commit together or not at all.
  const variant = await runInTransaction(async (session) => {
    const [created] = await ProductVariant.create([{ ...variantFields, product: productId }], { session });
    const docs = await Sku.insertMany(input.sizes.map((s, i) => newSkuDoc(productId, created._id, s, i)), { session });
    await recordInitialStock(docs, actor, session);
    return created;
  });

  await audit.record(actor, 'variant.create', 'ProductVariant', variant._id, { product: productId, skus: input.sizes.map((s) => s.sku) }, req);
  return getVariant(productId, variant._id);
}

async function getVariant(productId, variantId) {
  const variant = await ProductVariant.findOne({ _id: variantId, product: productId }).lean();
  if (!variant) throw ApiError.notFound('Variant not found', 'VARIANT_NOT_FOUND');
  return variantView(variant, await Sku.find({ variant: variantId }).lean());
}

async function update(productId, variantId, input, actor, req) {
  const product = await loadProduct(productId);
  const variant = await ProductVariant.findOne({ _id: variantId, product: productId });
  if (!variant) throw ApiError.notFound('Variant not found', 'VARIANT_NOT_FOUND');

  if (input.variantCode && input.variantCode !== variant.variantCode
    && (await ProductVariant.exists({ product: productId, variantCode: input.variantCode, _id: { $ne: variantId } }))) {
    throw ApiError.conflict('This variant code is already used for the product', 'VARIANT_CODE_EXISTS');
  }

  const upserts = input.sizes ?? [];
  const existing = await Sku.find({ variant: variantId });
  const bySku = new Map(existing.map((s) => [s.sku, s]));
  await assertWholesalePricingAllowed(product, upserts);

  const toCreate = upserts.filter((s) => !bySku.has(s.sku));
  toCreate.forEach((s) => {
    if (!s.size || s.price === undefined) throw ApiError.validation([{ field: 'sizes', message: `New SKU ${s.sku} needs a size and a price` }]);
  });
  if (toCreate.length) await assertSkusFree(toCreate.map((s) => s.sku));

  // Validate every change before writing anything.
  for (const s of upserts) {
    const cur = bySku.get(s.sku);
    if (!cur) continue;
    if (s.stock !== undefined && s.stock !== cur.stock) {
      throw ApiError.badRequest('Change existing stock from Inventory, not here', 'STOCK_VIA_INVENTORY');
    }
    const price = s.price ?? cur.price;
    const compare = s.compareAtPrice === undefined ? cur.compareAtPrice : s.compareAtPrice;
    if (compare != null && compare <= price) throw ApiError.validation([{ field: 'sizes', message: `Compare price must be higher than price (${s.sku})` }]);
    const usd = s.priceUSD === undefined ? cur.priceUSD : s.priceUSD;
    const usdCompare = s.compareAtPriceUSD === undefined ? cur.compareAtPriceUSD : s.compareAtPriceUSD;
    if (usdCompare != null && (usd == null || usdCompare <= usd)) {
      throw ApiError.validation([{ field: 'sizes', message: `USD compare price must be higher than the USD price (${s.sku})` }]);
    }
  }

  const { sizes: _sizes, ...variantFields } = input;
  const priceChanges = [];

  // Variant fields, SKU edits and new SKUs (with opening stock ledger) commit together.
  await runInTransaction(async (session) => {
    priceChanges.length = 0;

    Object.entries(variantFields).forEach(([k, v]) => variant.set(k, v));
    await variant.save({ session });

    for (const s of upserts) {
      const cur = bySku.get(s.sku);
      if (!cur) continue;
      const set = {};
      const unset = {};
      ['size', 'price', 'isEnabled', 'lowStockThreshold'].forEach((k) => { if (s[k] !== undefined) set[k] = s[k]; });
      ['compareAtPrice', 'wholesalePrice', 'priceUSD', 'compareAtPriceUSD'].forEach((k) => { if (s[k] === null) unset[k] = ''; else if (s[k] !== undefined) set[k] = s[k]; });
      if (s.lowStockThreshold !== undefined) set.stockStatus = stockStatus({ available: cur.available, lowStockThreshold: s.lowStockThreshold });
      if (Object.keys(set).length || Object.keys(unset).length) {
        await Sku.updateOne(
          { _id: cur._id },
          { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
          { session },
        );
      }
      if (s.price !== undefined && s.price !== cur.price) priceChanges.push({ sku: cur.sku, from: cur.price, to: s.price });
      if (s.priceUSD !== undefined && (s.priceUSD ?? null) !== (cur.priceUSD ?? null)) priceChanges.push({ sku: cur.sku, currency: 'USD', from: cur.priceUSD ?? null, to: s.priceUSD });
    }

    if (toCreate.length) {
      const docs = await Sku.insertMany(toCreate.map((s, i) => newSkuDoc(productId, variantId, s, existing.length + i)), { session });
      await recordInitialStock(docs, actor, session);
    }
  });

  for (const change of priceChanges) {
    await audit.record(actor, 'sku.price', 'Sku', change.sku, { from: change.from, to: change.to, ...(change.currency ? { currency: change.currency } : {}) }, req);
  }

  return getVariant(productId, variantId);
}

module.exports = { create, update, getVariant };
