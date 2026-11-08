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
const { audienceCondition } = require('./audience');
const { RETAIL_VISIBLE_FILTER } = require('../constants/salesChannel');

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
    // Sizes that can be bought right now (used by the size filter and shown on cards).
    sizes: [...new Set(eligible.filter((s) => s.available > 0).map((s) => s.size))],
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
    audience: product.audience || null,
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
    // Who the product is for. The product's own audience wins; otherwise the storefront falls back to the
    // category's audience (which is where "kids" lives, since Product.audience is men|women|unisex).
    categoryAudience: product.category?.audience || null,
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

async function listCategories({ audience, homeOnly, parentOnly, section } = {}) {
  const filter = { isActive: true };
  if (section) {
    // A dedicated section's own page: the section (must be active) and its ACTIVE sub-categories.
    const root = await Category.findOne({ slug: section, isActive: true, dedicatedSection: true, parentCategory: null }).select('_id').lean();
    if (!root) return [];
    const ids = (await categoryService.subtreeIds(root._id)).map((id) => new mongoose.Types.ObjectId(id));
    filter._id = { $in: ids };
  } else {
    // The general catalog never lists a dedicated section or anything inside it.
    const hidden = await categoryService.dedicatedSectionIds();
    if (hidden.length) filter._id = { $nin: hidden.map((id) => new mongoose.Types.ObjectId(id)) };
  }
  if (audience) filter.audience = ['men', 'women'].includes(audience) ? { $in: [audience, 'unisex'] } : audience;
  if (homeOnly) filter.showOnHome = true;
  if (parentOnly) filter.parentCategory = null; // matches null AND missing: schema-based, no names or ids

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
    ...(section ? { dedicatedSection: Boolean(c.dedicatedSection) } : {}),
  }));
}

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const emptyPage = (q) => ({ items: [], meta: { page: q.page, limit: q.limit, total: 0, pages: 1, totalPages: 1 } });

/**
 * Which category ids a listing may draw from.
 *  - general catalog (no `section`): active categories that are NOT inside a dedicated section;
 *  - dedicated section page (`section` + `category`): only that section's active subtree.
 * Returns null when the request cannot match anything.
 */
async function resolveCategoryScope({ category, section }) {
  const active = await activeCategoryIds();
  const hidden = new Set((await categoryService.dedicatedSectionIds()).map(String));

  if (section) {
    if (!category) return null;
    const cat = await Category.findOne({ slug: category, isActive: true }).select('_id').lean();
    if (!cat || !hidden.has(String(cat._id))) return null; // `section` only unlocks dedicated sections
    const subtree = new Set(await categoryService.subtreeIds(cat._id));
    return active.filter((id) => subtree.has(String(id)));
  }

  const general = active.filter((id) => !hidden.has(String(id)));
  if (!category) return general;
  const cat = await Category.findOne({ slug: category, isActive: true }).select('_id').lean();
  if (!cat) return null;
  const subtree = new Set(await categoryService.subtreeIds(cat._id));
  return general.filter((id) => subtree.has(String(id)));
}

const needsRefinement = (q) => Boolean(q.size || q.color || q.minPrice != null || q.maxPrice != null || q.inStock);

/** Size / colour / price / availability refinements on product cards (exact, case-insensitive for text). */
function passesRefinements(card, q) {
  const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  if (q.size && !(card.sizes || []).some((z) => eq(z, q.size))) return false;
  if (q.color && !(card.colors || []).some((c) => eq(c.name, q.color))) return false;
  if (q.inStock && !card.inStock) return false;
  if (q.minPrice != null || q.maxPrice != null) {
    const usd = q.currency === 'USD';
    const lo = usd ? card.priceMinUSD : card.priceMin;
    const hi = usd ? card.priceMaxUSD : card.priceMax;
    if (lo == null || hi == null) return false; // not sold in this currency
    if (q.minPrice != null && hi < q.minPrice) return false;
    if (q.maxPrice != null && lo > q.maxPrice) return false;
  }
  return true;
}

async function listProducts(q) {
  const scope = await resolveCategoryScope(q);
  if (!scope || !scope.length) return emptyPage(q);
  // RETAIL_VISIBLE_FILTER keeps wholesale-only products out of every retail listing, search, sort and count.
  const filter = { status: 'active', ...RETAIL_VISIBLE_FILTER, category: { $in: scope } };

  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ name: re }, { shortDescription: re }];
  }

  if (q.featured !== undefined) filter.isFeatured = q.featured;
  // Strict flag match: a product is a New Arrival only when an admin set isNewArrival=true (never inferred from createdAt).
  if (q.newArrival === true) filter.isNewArrival = true;
  else if (q.newArrival === false) filter.isNewArrival = { $ne: true };

  if (q.audience) {
    const cond = await audienceCondition(q.audience, categoryService);
    filter.$and = [...(filter.$and || []), cond];
  }

  const sortMap = { newest: { createdAt: -1 }, name: { name: 1 } };
  const byPrice = q.sort === 'price_asc' || q.sort === 'price_desc';

  // Price sorting and size/colour/price/stock refinements need the SKU rollup (another collection):
  // build the cards for every match, then refine, sort and page in memory so totals and pages stay exact.
  if (byPrice || needsRefinement(q)) {
    const all = await Product.find(filter).sort(byPrice ? {} : { ...sortMap[q.sort], _id: -1 }).populate('category', 'name slug').lean();
    const { variants, skus } = await loadChildren(all.map((p) => p._id));
    let cards = all.map((p) => productCardView(p, variantsOf(variants, p), skusOf(skus, p)));
    cards = cards.filter((c) => passesRefinements(c, q));

    if (byPrice) {
      const usd = q.currency === 'USD';
      cards.sort((a, b) => {
        const x = (usd ? a.priceMinUSD : a.priceMin) ?? Infinity;
        const y = (usd ? b.priceMinUSD : b.priceMin) ?? Infinity;
        return q.sort === 'price_asc' ? x - y : y - x;
      });
    }

    const start = (q.page - 1) * q.limit;
    return { items: cards.slice(start, start + q.limit), meta: pageMeta(q, cards.length) };
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

/**
 * Filter options for one category page, computed from the products actually on sale there, so the storefront can hide
 * filters that have no data. Sub-categories (active, direct children) come with their product counts.
 */
async function categoryFacets({ category, section, currency }) {
  const scope = await resolveCategoryScope({ category, section });
  const empty = { total: 0, sizes: [], colors: [], priceMin: null, priceMax: null, inStockCount: 0, subcategories: [] };
  if (!scope || !scope.length) return empty;

  const docs = await Product.find({ status: 'active', ...RETAIL_VISIBLE_FILTER, category: { $in: scope } }).populate('category', 'name slug').lean();
  const { variants, skus } = await loadChildren(docs.map((p) => p._id));
  const cards = docs.map((p) => productCardView(p, variantsOf(variants, p), skusOf(skus, p)));
  const usd = currency === 'USD';

  const sizes = [...new Set(cards.flatMap((c) => c.sizes))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const colorMap = new Map();
  cards.forEach((c) => c.colors.forEach((col) => col?.name && !colorMap.has(col.name) && colorMap.set(col.name, col.hexCode)));
  const lows = cards.map((c) => (usd ? c.priceMinUSD : c.priceMin)).filter((n) => n != null);
  const highs = cards.map((c) => (usd ? c.priceMaxUSD : c.priceMax)).filter((n) => n != null);

  // Direct active children of the requested category, with how many products sit in each subtree.
  const root = await Category.findOne({ slug: category, isActive: true }).select('_id').lean();
  const children = root ? await Category.find({ parentCategory: root._id, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean() : [];
  const subcategories = [];
  for (const child of children) {
    const ids = new Set(await categoryService.subtreeIds(child._id));
    subcategories.push({ id: String(child._id), name: child.name, slug: child.slug, count: docs.filter((p) => ids.has(String(p.category?._id))).length });
  }

  return {
    total: cards.length,
    sizes,
    colors: [...colorMap.entries()].map(([name, hexCode]) => ({ name, hexCode })),
    priceMin: lows.length ? Math.min(...lows) : null,
    priceMax: highs.length ? Math.max(...highs) : null,
    inStockCount: cards.filter((c) => c.inStock).length,
    subcategories,
  };
}

async function getProductBySlug(slug) {
  const product = await Product.findOne({ slug, status: 'active', ...RETAIL_VISIBLE_FILTER }).populate('category', 'name slug isActive audience').lean();

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
  categoryFacets,
  getProductBySlug,
  // exported for tests
  productCardView,
  productDetailView,
  skuPublicView,
  MAX_PURCHASABLE_QUANTITY,
};
