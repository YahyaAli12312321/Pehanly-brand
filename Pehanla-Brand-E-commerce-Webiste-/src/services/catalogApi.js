import { ApiError, http, getData, getList } from './http';

const clean = (params) =>
  Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export const catalogApi = {
  categories: (params) => getData(http.get('/catalog/categories', { params: clean(params) })),
  products: (params) => getList(http.get('/catalog/products', { params: clean(params) })),
  product: async (slug) => {
    const product = await getData(http.get(`/catalog/products/${encodeURIComponent(slug)}`));
    // A response without an id is not a product (misrouted/proxy error page): treat as missing.
    if (!product || Array.isArray(product) || !product.id) {
      throw new ApiError({ message: 'Product not found', status: 404, code: 'PRODUCT_NOT_FOUND' });
    }
    return product;
  },
};

export const reviewsApi = {
  summary: (productId) => getData(http.get(`/reviews/products/${productId}/summary`)),
  list: (productId, params) => getList(http.get(`/reviews/products/${productId}`, { params: clean(params) })),
  eligibility: (productId) => getData(http.get(`/reviews/products/${productId}/eligibility`)),
  create: (productId, body) => getData(http.post(`/reviews/products/${productId}`, body)),
};

export const contentApi = {
  banners: (placement, limit) => getData(http.get('/banners', { params: clean({ placement, limit }) })),
  bannerImpression: (id) => http.post(`/banners/${id}/impression`).catch(() => undefined),
  bannerClick: (id) => http.post(`/banners/${id}/click`).catch(() => undefined),
  publicSettings: () => getData(http.get('/settings/public')),
};
