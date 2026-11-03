import { get, patch, put, cleanParams } from '../lib/apiClient';

/**
 * Reviews moderation (admin). Backend: /admin/reviews — reviews.read (GET) / reviews.manage (writes).
 * Admins CANNOT create or edit customer reviews; only approve / reject / publish an official brand reply (approved reviews only).
 * Review: { _id, product{name,slug,generalImages}, user{name,email}, order{orderNumber}, customer{name}, rating 1-5, title, comment, verifiedPurchase,
 *           status(pending|approved|rejected), moderatedBy, moderatedAt, rejectionReason, brandReply{message,repliedBy,repliedAt}, createdAt }
 */
export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

export const reviewsApi = {
  /** params: search, status, rating(1-5), productId, page, limit */
  list: async (params = {}) => {
    const body = await get('/admin/reviews', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },
  get: async (id) => (await get(`/admin/reviews/${id}`)).data,
  approve: async (id) => (await patch(`/admin/reviews/${id}/approve`)).data,
  reject: async (id, reason) => (await patch(`/admin/reviews/${id}/reject`, reason?.trim() ? { reason: reason.trim() } : {})).data,
  reply: async (id, message) => (await put(`/admin/reviews/${id}/reply`, { message: message.trim() })).data,
};
