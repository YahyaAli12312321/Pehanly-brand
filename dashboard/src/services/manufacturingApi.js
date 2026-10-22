import { get, post, patch, cleanParams } from '../lib/apiClient';

/**
 * Manufacturing (admin). Backend: /admin/manufacturing — manufacturing.read (GET) / manufacturing.manage (writes).
 * Requests: { _id, requestNumber, user, customer{…}, selection{categoryName,styleName,variantName,variantCode,colorName}, quantity, requirements,
 *             customerNotes, adminNotes, status, quote{quoteNumber,status,pricing}, order{orderNumber,…}, reviewedBy, approvedBy, createdAt }
 * Admin actions: review (pending → under_review) | reject; approve. Quote creation is in quotesApi (manufacturing source).
 * Catalog (category → style → variant) is returned as a plain array (not paginated).
 */
export const MFG_STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'quoted', 'accepted', 'cancelled', 'converted_to_order'];

export const manufacturingApi = {
  /** params: search, status, page, limit */
  listRequests: async (params = {}) => {
    const body = await get('/admin/manufacturing/requests', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 10, total: 0, pages: 1 } };
  },
  getRequest: async (id) => (await get(`/admin/manufacturing/requests/${id}`)).data,
  review: async (id, { action, adminNotes }) => (await patch(`/admin/manufacturing/requests/${id}/review`, { action, ...(adminNotes?.trim() ? { adminNotes: adminNotes.trim() } : {}) })).data,
  approve: async (id, { adminNotes } = {}) => (await patch(`/admin/manufacturing/requests/${id}/approve`, adminNotes?.trim() ? { adminNotes: adminNotes.trim() } : {})).data,

  /** type: category | style | variant */
  catalog: async (type) => (await get(`/admin/manufacturing/catalog/${type}`)).data || [],
  setCatalogActive: async (type, id, isActive) => (await patch(`/admin/manufacturing/catalog/${type}/${id}/status`, { isActive })).data,
  createCategory: async (b) => (await post('/admin/manufacturing/categories', b)).data,
  updateCategory: async (id, b) => (await patch(`/admin/manufacturing/categories/${id}`, b)).data,
  createStyle: async (b) => (await post('/admin/manufacturing/styles', b)).data,
  updateStyle: async (id, b) => (await patch(`/admin/manufacturing/styles/${id}`, b)).data,
  createVariant: async (b) => (await post('/admin/manufacturing/variants', b)).data,
  updateVariant: async (id, b) => (await patch(`/admin/manufacturing/variants/${id}`, b)).data,
};
