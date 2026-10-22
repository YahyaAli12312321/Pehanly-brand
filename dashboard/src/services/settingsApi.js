import { get, post, patch, del, cleanParams } from '../lib/apiClient';

/**
 * Store settings (admin) — /admin/settings (settings.read / settings.manage) and shipping rules — /admin/shipping-rules (shipping.read / shipping.manage).
 * Settings: { storeName, tagline, currency('PKR', read-only), contact{email,phone,whatsapp,address}, social{facebook,instagram,tiktok,youtube},
 *             checkout{guestCheckoutEnabled,codEnabled,jazzcashEnabled}, returns{enabled,windowDays}, announcement{enabled,text,link}, updatedAt, updatedBy }
 * PATCH is partial: only the fields sent change. Payment-gateway SECRETS are never stored or shown here (server-side environment only).
 * Shipping rule: { _id, name, type(flat|city_based|free_shipping), flatRate|null, cityRates[{city,rate}], minimumOrderAmount|null, country, isActive, priority }  (lower priority wins)
 */
export const settingsApi = {
  get: async () => (await get('/admin/settings')).data,
  update: async (patchBody) => (await patch('/admin/settings', patchBody)).data,
};

export const SHIPPING_TYPES = { flat: 'Flat rate', city_based: 'City based', free_shipping: 'Free above amount' };

export const shippingApi = {
  /** params: type, isActive('true'|'false'), search, page, limit */
  list: async (params = {}) => {
    const body = await get('/admin/shipping-rules', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },
  create: async (b) => (await post('/admin/shipping-rules', b)).data,
  update: async (id, b) => (await patch(`/admin/shipping-rules/${id}`, b)).data,
  setActive: async (id, isActive) => (await patch(`/admin/shipping-rules/${id}/status`, { isActive })).data,
  remove: async (id) => (await del(`/admin/shipping-rules/${id}`)).data,
};
