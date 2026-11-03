import { get, post, patch, del, cleanParams } from '../lib/apiClient';

/**
 * Banners (admin) — the ONLY marketing scope (no lookbooks). Backend: /admin/banners — banners.read (GET) / banners.manage (writes).
 * Banner: { _id, title, subtitle, placement, image{url,publicId,alt}, mobileImage|null, cta{label,target}|null, isActive, sortOrder,
 *           startsAt|null, endsAt|null, impressions, clicks, ctr, status(active|inactive|scheduled|expired) }
 * Stats: { totalBanners, liveSlots, averageCtr, impressions, clicks } — all-time totals, computed server-side.
 */
export const PLACEMENTS = { home_hero: 'Home hero', retail_promo: 'Retail promo', wholesale_promo: 'Wholesale promo', manufacturing_promo: 'Manufacturing promo' };
export const BANNER_STATUS_FILTERS = ['active', 'scheduled', 'inactive', 'expired'];

export const bannersApi = {
  /** params: search, placement, status, page, limit */
  list: async (params = {}) => {
    const body = await get('/admin/banners', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },
  stats: async () => (await get('/admin/banners/stats')).data,
  get: async (id) => (await get(`/admin/banners/${id}`)).data,
  create: async (b) => (await post('/admin/banners', b)).data,
  update: async (id, b) => (await patch(`/admin/banners/${id}`, b)).data,
  setActive: async (id, isActive) => (await patch(`/admin/banners/${id}/status`, { isActive })).data,
  remove: async (id) => (await del(`/admin/banners/${id}`)).data,
};
