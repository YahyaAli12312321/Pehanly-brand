import { get, post, patch, cleanParams } from '../lib/apiClient';

/**
 * Products / variants / SKUs (admin). Backend: /admin/products — catalog.read (GET) / catalog.manage (writes).
 * No delete or duplicate endpoint exists. New products are always created as `draft`; publishing
 * (`status: active`) is a separate step that the backend refuses (409 PRODUCT_NOT_READY) until a
 * sellable colour/size exists. Stock for existing SKUs is NEVER written here (see inventoryApi).
 *
 * List item = product + summary { variantsCount, skuCount, eligibleSkuCount, priceMin, priceMax,
 *   availableStock, lowStockSkus, outOfStockSkus } with `category` populated { _id, name, slug }.
 * Detail = product + variants[ { _id, color{name,hexCode}, variantCode, images[], isEnabled, sortOrder, sizes[sku views] } ]
 *          + summary + readiness { ready, issues[] }.
 */
const media = (arr = []) =>
  arr.filter((i) => i?.url).map((i, idx) => ({ url: i.url, ...(i.publicId ? { publicId: i.publicId } : {}), ...(i.alt ? { alt: i.alt } : {}), sortOrder: idx }));

export const productsApi = {
  list: async (params = {}) => {
    const body = await get('/admin/products', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },
  /** { total, active, draft, inactive, lowStockProducts, lowStockSkus, outOfStockProducts, outOfStockSkus } */
  summary: async () => (await get('/admin/products/summary')).data,
  get: async (id) => (await get(`/admin/products/${id}`)).data,
  create: async (form) => (await post('/admin/products', productBody(form))).data,
  update: async (id, form) => (await patch(`/admin/products/${id}`, productBody(form))).data,
  /** status: draft | active | inactive */
  setStatus: async (id, status) => (await patch(`/admin/products/${id}/status`, { status })).data,
  /** action: activate | deactivate | feature | unfeature  ->  { updated: id[], failed: [{id, reason}] } */
  bulk: async (ids, action) => (await post('/admin/products/bulk', { ids, action })).data,
  createVariant: async (productId, draft) => (await post(`/admin/products/${productId}/variants`, variantBody(draft, true))).data,
  updateVariant: async (productId, variantId, draft) => (await patch(`/admin/products/${productId}/variants/${variantId}`, variantBody(draft, false))).data,
};

function productBody(f) {
  const body = {
    name: f.name.trim(),
    shortDescription: (f.shortDescription || '').trim(),
    description: (f.description || '').trim(),
    category: f.category,
    generalImages: media(f.generalImages),
    isFeatured: !!f.isFeatured,
    isNewArrival: !!f.isNewArrival,
    isBestSeller: !!f.isBestSeller,
    wholesale: f.wholesaleEnabled ? { isEnabled: true, moq: Math.max(1, Math.round(Number(f.wholesaleMoq) || 1)) } : { isEnabled: false },
    seo: { title: (f.seoTitle || '').trim(), description: (f.seoDescription || '').trim() },
  };
  if (f.slug && f.slug.trim()) body.slug = f.slug.trim().toLowerCase();
  return body;
}

const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

function variantBody(d, isCreate) {
  const color = { name: d.color.name.trim() };
  if (/^#[0-9a-fA-F]{6}$/.test(d.color.hexCode || '')) color.hexCode = d.color.hexCode;
  const sizes = d.sizes.map((s) => {
    const row = { size: s.size.trim(), sku: s.sku.trim().toUpperCase(), price: Number(s.price), isEnabled: !!s.isEnabled };
    const lst = num(s.lowStockThreshold);
    if (lst !== undefined) row.lowStockThreshold = lst;
    const cmp = num(s.compareAtPrice);
    const wh = num(s.wholesalePrice);
    const usd = num(s.priceUSD);
    const usdCmp = num(s.compareAtPriceUSD);
    if (isCreate) {
      if (cmp !== undefined) row.compareAtPrice = cmp;
      if (wh !== undefined) row.wholesalePrice = wh;
      if (usd !== undefined) row.priceUSD = usd;
      if (usd !== undefined && usdCmp !== undefined) row.compareAtPriceUSD = usdCmp;
      row.stock = Math.max(0, Math.round(Number(s.stock) || 0));
    } else {
      row.compareAtPrice = cmp === undefined ? null : cmp; // null clears it
      row.wholesalePrice = wh === undefined ? null : wh;
      // Empty USD fields clear the USD price (size is then not sold in USD); null is the API's "clear".
      row.priceUSD = usd === undefined ? null : usd;
      row.compareAtPriceUSD = usd === undefined || usdCmp === undefined ? null : usdCmp;
      if (s.isNew) row.stock = Math.max(0, Math.round(Number(s.stock) || 0)); // existing stock is changed via Inventory only
    }
    return row;
  });
  return {
    color,
    variantCode: d.variantCode.trim().toUpperCase(),
    images: media(d.images),
    isEnabled: !!d.isEnabled,
    sortOrder: Math.max(0, Math.round(Number(d.sortOrder) || 0)),
    sizes,
  };
}
