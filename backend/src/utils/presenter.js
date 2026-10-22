'use strict';

const sizeView = (s) => ({
  _id: s._id, size: s.size, sku: s.sku, price: s.price, compareAtPrice: s.compareAtPrice ?? null, priceUSD: s.priceUSD ?? null, compareAtPriceUSD: s.compareAtPriceUSD ?? null, wholesalePrice: s.wholesalePrice ?? null,
  stock: s.stock, reservedStock: s.reservedStock, available: s.available, lowStockThreshold: s.lowStockThreshold ?? null,
  stockStatus: s.stockStatus, isEnabled: s.isEnabled,
});

/** Variant in the approved API shape: color + images + sizes[] (sizes come from Sku documents). */
function variantView(variant, skus) {
  const v = typeof variant.toObject === 'function' ? variant.toObject() : variant;
  const sizes = skus
    .filter((s) => String(s.variant) === String(v._id))
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.size.localeCompare(b.size, undefined, { numeric: true }))
    .map(sizeView);
  return { ...v, sizes };
}

/** Price/availability rollup over eligible SKUs (enabled SKU in an enabled variant). Product has no price/stock of its own. */
function summarize(variants, skus) {
  const enabledVariants = new Set(variants.filter((v) => v.isEnabled).map((v) => String(v._id)));
  const eligible = skus.filter((s) => s.isEnabled && enabledVariants.has(String(s.variant)));
  const prices = eligible.map((s) => s.price);
  return {
    variantsCount: variants.length,
    skuCount: skus.length,
    eligibleSkuCount: eligible.length,
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    availableStock: eligible.reduce((n, s) => n + s.available, 0),
    lowStockSkus: eligible.filter((s) => s.stockStatus === 'low').length,
    outOfStockSkus: eligible.filter((s) => s.stockStatus === 'out').length,
  };
}

module.exports = { sizeView, variantView, summarize };
