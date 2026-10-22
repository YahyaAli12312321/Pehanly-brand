/**
 * Helpers over the public catalog shapes
 * (see backend catalog.service: product card + product detail views).
 */
export const productPath = (product) => `/product/${product.slug}`;

/** Flat list of purchasable SKUs for a product detail: [{ ...sku, variantId, color }] */
export const flattenSkus = (product) =>
  (product?.variants || []).flatMap((variant) =>
    (variant.sizes || []).map((sku) => ({
      ...sku,
      variantId: variant.id,
      color: variant.color,
      images: variant.images,
    })),
  );

export const findSku = (product, variantId, size) =>
  flattenSkus(product).find((s) => s.variantId === variantId && s.size === size) || null;

export const productImage = (product) => product?.image?.url || product?.images?.[0]?.url || '';

/** Line item stored in the cart, derived from a product detail + chosen SKU. */
export const toCartLine = (product, sku, quantity = 1) => ({
  id: sku.id, // cart line id === SKU id (what the backend orders by)
  skuId: sku.id,
  productId: product.id,
  slug: product.slug,
  name: product.name,
  category: product.category?.name || '',
  size: sku.size,
  color: sku.color?.name || '',
  colorHex: sku.color?.hexCode || '',
  image: sku.images?.[0]?.url || productImage(product),
  price: sku.price,
  originalPrice: sku.compareAtPrice ?? null,
  // USD is a separate merchant price (null = this size is not sold in USD).
  priceUSD: sku.priceUSD ?? null,
  originalPriceUSD: sku.compareAtPriceUSD ?? null,
  maxQuantity: sku.maxQuantity,
  qty: quantity,
});

/**
 * Business rule: Ladies' Shoes are RETAIL ONLY. They must never appear in the
 * Wholesale or Manufacturing flows. Matches on category slug or name.
 */
export const isLadiesShoes = (category) => {
  const text = `${category?.slug || ''} ${category?.name || ''}`.toLowerCase().replace(/[-_']/g, ' ');
  return /\bshoes?\b|\bfootwear\b/.test(text) && /\b(ladies|ladys|lady|women|womens|female)\b/.test(text);
};
