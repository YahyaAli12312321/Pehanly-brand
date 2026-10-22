import { get, post, patch, cleanParams } from '../lib/apiClient';

/**
 * Quotes (admin). Backend: /admin/quotes — quotes.read (GET) / quotes.manage (writes).
 * Quotes can ONLY be created from an approved wholesale / manufacturing / printing request.
 * Lifecycle: draft → sent → accepted|rejected|expired (customer accepts/rejects) → converted_to_order (admin, with shippingAddress).
 * Admin cannot accept/reject on a customer's behalf (no such endpoint).
 * Quote: { _id, quoteNumber, sourceType, wholesaleRequest|manufacturingRequest|printingRequest {requestNumber,status}, customer{…}, items[{productName,…,unitPrice,quantity,lineTotal}],
 *          pricing{subtotal,discount,shipping,additionalCharges,total}, status, validUntil, customerNotes, adminNotes, terms, sentAt, acceptedAt, rejectedAt, expiredAt, convertedAt, order{orderNumber,…}, auditTrail[] }
 * List response also carries top-level `stats`: { totalFormulated, activeProposals, convertedOrders, pipelineValue }.
 */
export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted_to_order'];
export const QUOTE_SOURCES = ['wholesale', 'manufacturing', 'printing'];

export const quotesApi = {
  /** params: search, status, sourceType, page, limit */
  list: async (params = {}) => {
    const body = await get('/admin/quotes', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 10, total: 0, pages: 1 }, stats: body.stats || null };
  },
  get: async (id) => (await get(`/admin/quotes/${id}`)).data,
  /** Create from a request. sourceType wholesale: no unitPrice. */
  create: async (sourceType, { requestId, unitPrice, discount, shipping, additionalCharges, validUntil, adminNotes, terms }) => {
    const base = { discount: Number(discount) || 0, shipping: Number(shipping) || 0, additionalCharges: Number(additionalCharges) || 0 };
    if (validUntil) base.validUntil = validUntil;
    if (adminNotes?.trim()) base.adminNotes = adminNotes.trim();
    if (terms?.trim()) base.terms = terms.trim();
    if (sourceType === 'wholesale') return (await post('/admin/quotes/wholesale', { wholesaleRequestId: requestId, ...base })).data;
    const idKey = sourceType === 'manufacturing' ? 'manufacturingRequestId' : 'printingRequestId';
    return (await post(`/admin/quotes/${sourceType}`, { [idKey]: requestId, unitPrice: Number(unitPrice), ...base })).data;
  },
  /** Draft only. */
  update: async (id, body) => (await patch(`/admin/quotes/${id}`, body)).data,
  send: async (id) => (await post(`/admin/quotes/${id}/send`)).data,
  /** Accepted quotes only. shippingAddress: { fullName, phone, addressLine1, addressLine2?, city, province?, postalCode?, country } */
  convertToOrder: async (id, shippingAddress) => (await post(`/admin/quotes/${id}/convert-to-order`, { shippingAddress })).data,
};
