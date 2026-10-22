'use strict';

/*
|--------------------------------------------------------------------------
| Public storefront catalog (read-only)
|--------------------------------------------------------------------------
|
| Only ACTIVE products in ACTIVE categories, with ENABLED variants and SKUs.
| Deliberately never exposed: exact stock / reserved counts, wholesale price,
| draft / inactive items, admin fields.
|
| Shoppers see availability as `inStock` and a purchasable `maxQuantity`
| (capped), not as inventory figures.
|--------------------------------------------------------------------------
*/

const mongoose = require('mongoose');

const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Sku = require('../models/Sku');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const { escapeRegex } = require('../utils/slugify');
const categoryService = require('./category.service');

const MAX_PURCHASABLE_QUANTITY = 20;

function skuPublicView(sku) {
  return {
    id: String(sku._id),
    sku: sku.sku,
    size: sku.size,
    price: sku.price,
    compareAtPrice: sku.compareAtPrice ?? null,
    // USD is a separate merchant-entered price; null = this size is not sold in USD.
    priceUSD: sku.priceUSD ?? null,
    compareAtPriceUSD: sku.priceUSD != null ? (sku.compareAtPriceUSD ?? null) : null,
    inStock: sku.available > 0,
    maxQuantity: Math.max(0, Math.min(sku.available, MAX_PURCHASABLE_QUANTITY)),
  };
}

function summarizePublic(variants, skus) {
  const enabledVariantIds = new Set(variants.filter((v) => v.isEnabled).map((v) => String(v._id)));
  const eligible = skus.filter((s) => s.isEnabled && enabledVariantIds.has(String(s.variant)));
  const prices = eligible.map((s) => s.price);
  const usdPrices = eligible.filter((s) => s.priceUSD != null).map((s) => s.priceUSD);

  return {
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    priceMinUSD: usdPrices.length ? Math.min(...usdPrices) : null,
    priceMaxUSD: usdPrices.length ? Math.max(...usdPrices) : null,
    // Purchasable currencies for this product (USD only if at least one size has a USD price).
    currencies: usdPrices.length ? ['PKR', 'USD'] : ['PKR'],
    inStock: eligible.some((s) => s.available > 0),
    colors: variants.filter((v) => v.isEnabled).map((v) => ({ name: v.color?.name, hexCode: v.color?.hexCode })),
  };
}

function productCardView(product, variants, skus) {
  const firstVariantImage = variants.find((v) => v.isEnabled && v.images?.length)?.images?.[0];
  const cover = product.generalImages?.[0] || firstVariantImage || null;

  return {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription,
    category: product.category
      ? { name: product.category.name, slug: product.category.slug }
      : null,
    image: cover ? { url: cover.url, alt: cover.alt } : null,
    isFeatured: Boolean(product.isFeatured),
    isNewArrival: Boolean(product.isNewArrival),
    isBestSeller: Boolean(product.isBestSeller),
    ...summarizePublic(variants, skus),
  };
}

function productDetailView(product, variants, skus) {
  const enabledVariants = variants.filter((v) => v.isEnabled);

  return {
    ...productCardView(product, variants, skus),
    description: product.description,
    images: (product.generalImages || []).map((i) => ({ url: i.url, alt: i.alt })),
    seo: product.seo
      ? { title: product.seo.title, description: product.seo.description, canonicalUrl: product.seo.canonicalUrl, index: product.seo.index }
      : undefined,
    variants: enabledVariants.map((variant) => ({
      id: String(variant._id),
      color: { name: variant.color?.name, hexCode: variant.color?.hexCode },
      variantCode: variant.variantCode,
      images: (variant.images || []).map((i) => ({ url: i.url, alt: i.alt })),
      sizes: skus
        .filter((s) => s.isEnabled && String(s.variant) === String(variant._id))
        .sort((a, b) => (a.sortOrder - b.sortOrder) || a.size.localeCompare(b.size, undefined, { numeric: true }))
        .map(skuPublicView),
    })),
  };
}

async function activeCategoryIds() {
  const rows = await Category.find({ isActive: true }).select('_id').lean();
  return rows.map((r) => r._id);
}

async function listCategories({ audience, homeOnly } = {}) {
  const filter = { isActive: true };
  if (audience) filter.audience = audience;
  if (homeOnly) filter.showOnHome = true;

  const rows = await Category.find(filter).sort({ sortOrder: 1, name: 1 }).lean();

  return rows.map((c) => ({
    id: String(c._id),
    name: c.name,
    slug: c.slug,
    description: c.description,
    image: c.image ? { url: c.image.url, alt: c.image.alt } : null,
    parentId: c.parentCategory ? String(c.parentCategory) : null,
    audience: c.audience || null,
    showOnHome: Boolean(c.showOnHome),
  }));
}

async function listProducts(q) {
  const allowedCategories = await activeCategoryIds();
  const filter = { status: 'active', category: { $in: allowedCategories } };

  if (q.category) {
    const category = await Category.findOne({ slug: q.category, isActive: true }).select('_id').lean();

    if (!category) {
      return { items: [], meta: { page: q.page, limit: q.limit, total: 0, pages: 1, totalPages: 1 } };
    }

    const subtree = (await categoryService.subtreeIds(category._id)).map((id) => new mongoose.Types.ObjectId(id));
    filter.category = { $in: subtree.filter((id) => allowedCategories.some((a) => String(a) === String(id))) };
  }

  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ name: re }, { shortDescription: re }];
  }

  if (q.featured !== undefined) filter.isFeatured = q.featured;

  // Price sorting needs the SKU rollup, which lives on another collection.
  // Keep the query simple and sort price in memory only for the requested page window.
  const sortMap = { newest: { createdAt: -1 }, name: { name: 1 } };

  if (q.sort === 'price_asc' || q.sort === 'price_desc') {
    const all = await Product.find(filter).populate('category', 'name slug').lean();
    const { variants, skus } = await loadChildren(all.map((p) => p._id));
    const cards = all.map((p) => productCardView(p, variantsOf(variants, p), skusOf(skus, p)));

    const usd = q.currency === 'USD';

    cards.sort((a, b) => {
      const x = (usd ? a.priceMinUSD : a.priceMin) ?? Infinity;
      const y = (usd ? b.priceMinUSD : b.priceMin) ?? Infinity;
      return q.sort === 'price_asc' ? x - y : y - x;
    });

    const start = (q.page - 1) * q.limit;

    return {
      items: cards.slice(start, start + q.limit),
      meta: pageMeta(q, cards.length),
    };
  }

  const [total, docs] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort({ ...sortMap[q.sort], _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('category', 'name slug')
      .lean(),
  ]);

  const { variants, skus } = await loadChildren(docs.map((p) => p._id));

  return {
    items: docs.map((p) => productCardView(p, variantsOf(variants, p), skusOf(skus, p))),
    meta: pageMeta(q, total),
  };
}

async function getProductBySlug(slug) {
  const product = await Product.findOne({ slug, status: 'active' }).populate('category', 'name slug isActive').lean();

  if (!product || product.category?.isActive === false) {
    throw ApiError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
  }

  const { variants, skus } = await loadChildren([product._id]);

  return productDetailView(product, variants, skus);
}

async function loadChildren(productIds) {
  const [variants, skus] = await Promise.all([
    ProductVariant.find({ product: { $in: productIds } }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    Sku.find({ product: { $in: productIds } }).lean(),
  ]);

  return { variants, skus };
}

const variantsOf = (variants, product) => variants.filter((v) => String(v.product) === String(product._id));
const skusOf = (skus, product) => skus.filter((s) => String(s.product) === String(product._id));

function pageMeta(q, total) {
  const pages = Math.max(1, Math.ceil(total / q.limit));
  return { page: q.page, limit: q.limit, total, pages, totalPages: pages };
}

module.exports = {
  listCategories,
  listProducts,
  getProductBySlug,
  // exported for tests
  productCardView,
  productDetailView,
  skuPublicView,
  MAX_PURCHASABLE_QUANTITY,
};
