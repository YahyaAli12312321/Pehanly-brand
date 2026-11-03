import { get, post, patch, cleanParams } from '../lib/apiClient';

/**
 * Wholesale (admin). Backend: /admin/wholesale — wholesale.read (GET) / wholesale.manage (writes).
 * Requests come from customers (custom bulk or ready pack); admins review / approve / reject only.
 * Request: { _id, requestNumber, requestType(custom|ready_pack), sourcePack{name,slug}, customer{name,email,phone,businessName,businessType,taxNtn},
 *            items[{sku,productName,colorName,size,skuCode,wholesalePrice,quantity,lineTotal}], requestedVolume, partnershipProposal,
 *            discountScheme{name,discountPercent,minimumOrderQuantity}, pricing{subtotal,estimatedTotal}, status, customerNotes, adminNotes,
 *            quote, order, reviewedBy, approvedBy, createdAt }
 * Statuses: pending, under_review, approved, rejected, quoted, accepted, cancelled, converted_to_order.
 * Pack: { _id, name, slug, description, image, items[], isActive, sortOrder, pricing }
 */
export const WHOLESALE_STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'quoted', 'accepted', 'cancelled', 'converted_to_order'];

const page = (body) => ({ items: body.data || [], meta: body.meta || { page: 1, limit: 10, total: 0, totalPages: 1 } });

export const wholesaleApi = {
  /** params: search, status, requestType, page, limit */
  listRequests: async (params = {}) => page(await get('/admin/wholesale/requests', cleanParams(params))),
  getRequest: async (id) => (await get(`/admin/wholesale/requests/${id}`)).data,
  /** { totalInquiries, underReview, approvedPartners, requestedVolume } */
  stats: async () => (await get('/admin/wholesale/stats')).data,
  /** action: 'review' (pending → under_review) | 'reject' */
  review: async (id, { action, adminNotes }) => (await patch(`/admin/wholesale/requests/${id}/review`, { action, ...(adminNotes?.trim() ? { adminNotes: adminNotes.trim() } : {}) })).data,
  /** discountScheme optional: { name, discountPercent 0-100, minimumOrderQuantity >= 1 } */
  approve: async (id, { adminNotes, discountScheme }) => (await patch(`/admin/wholesale/requests/${id}/approve`, { ...(adminNotes?.trim() ? { adminNotes: adminNotes.trim() } : {}), ...(discountScheme ? { discountScheme } : {}) })).data,

  listPacks: async (params = {}) => page(await get('/admin/wholesale/packs', cleanParams(params))),
  getPack: async (id) => (await get(`/admin/wholesale/packs/${id}`)).data,
  /** body: { name, slug, description?, image?{url,publicId,alt}, items[{sku(ObjectId),quantity}], isActive, sortOrder } */
  createPack: async (body) => (await post('/admin/wholesale/packs', body)).data,
  updatePack: async (id, body) => (await patch(`/admin/wholesale/packs/${id}`, body)).data,
  setPackActive: async (id, isActive) => (await patch(`/admin/wholesale/packs/${id}/status`, { isActive })).data,
};
