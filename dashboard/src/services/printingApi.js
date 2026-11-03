import { get, post, patch, del, cleanParams } from '../lib/apiClient';

/**
 * Printing & Branding (admin). Backend: /admin/printing — printing.read (GET) / printing.manage (writes).
 * Request: { _id, requestNumber, customer{…}, selection{service,serviceName,serviceSlug}, garmentSource(pehanly|customer_supplied), garmentDetails, colors[],
 *            quantity, requirements, placements[{name,description}], artwork[{url,publicId,originalName,format,bytes,resourceType}], customerNotes, adminNotes,
 *            status, quote, order, reviewedBy, approvedBy, createdAt }
 * Admin actions: review (adminNotes optional), approve (adminNotes optional), reject (adminNotes REQUIRED).
 * Service: { _id, name, slug, description, media[{url,publicId,alt,sortOrder}], isActive, sortOrder }.
 */
export const PRINT_STATUSES = ['pending', 'under_review', 'approved', 'rejected', 'quoted', 'accepted', 'cancelled', 'converted_to_order'];
export const GARMENT_SOURCES = { pehanly: 'PEHAN LY garment', customer_supplied: 'Customer-supplied garment' };

const page = (body) => ({ items: body.data || [], meta: body.meta || { page: 1, limit: 10, total: 0, pages: 1 } });

export const printingApi = {
  /** params: search, status, garmentSource, page, limit */
  listRequests: async (params = {}) => page(await get('/admin/printing/requests', cleanParams(params))),
  getRequest: async (id) => (await get(`/admin/printing/requests/${id}`)).data,
  review: async (id, adminNotes) => (await patch(`/admin/printing/requests/${id}/review`, adminNotes?.trim() ? { adminNotes: adminNotes.trim() } : {})).data,
  approve: async (id, adminNotes) => (await patch(`/admin/printing/requests/${id}/approve`, adminNotes?.trim() ? { adminNotes: adminNotes.trim() } : {})).data,
  reject: async (id, adminNotes) => (await patch(`/admin/printing/requests/${id}/reject`, { adminNotes: adminNotes.trim() })).data,

  /** params: search, isActive('true'|'false'), page, limit */
  listServices: async (params = {}) => page(await get('/admin/printing/services', cleanParams(params))),
  getService: async (id) => (await get(`/admin/printing/services/${id}`)).data,
  createService: async (b) => (await post('/admin/printing/services', b)).data,
  updateService: async (id, b) => (await patch(`/admin/printing/services/${id}`, b)).data,
  deleteService: async (id) => (await del(`/admin/printing/services/${id}`)).data,
};
