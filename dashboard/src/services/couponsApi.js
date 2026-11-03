import { get, post, patch, del, cleanParams } from '../lib/apiClient';

/**
 * Coupons (admin). Backend: /admin/coupons — coupons.read (GET) / coupons.manage (writes).
 * Coupon: { _id, code, name, description, discountType(percentage|fixed), discountValue, minimumOrderAmount, maximumDiscountAmount|null,
 *           startsAt|null, expiresAt|null, usageLimit|null, usageLimitPerCustomer|null, usedCount, isActive, createdAt }
 * Used coupons cannot be deleted (409) — disable them instead. There is no aggregate stats endpoint.
 */
export const couponsApi = {
  /** params: search, discountType, isActive('true'|'false'), page, limit */
  list: async (params = {}) => {
    const body = await get('/admin/coupons', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },
  get: async (id) => (await get(`/admin/coupons/${id}`)).data,
  create: async (b) => (await post('/admin/coupons', b)).data,
  update: async (id, b) => (await patch(`/admin/coupons/${id}`, b)).data,
  setActive: async (id, isActive) => (await patch(`/admin/coupons/${id}/status`, { isActive })).data,
  remove: async (id) => (await del(`/admin/coupons/${id}`)).data,
};
