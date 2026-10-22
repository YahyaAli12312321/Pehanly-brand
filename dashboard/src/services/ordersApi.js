import { get, patch, cleanParams } from '../lib/apiClient';

/**
 * Orders + cancellation requests (admin). Backend: /admin/orders, /admin/cancellations
 * — orders.read (GET) / orders.manage (writes). There is NO admin "create order" endpoint:
 * orders come from checkout, or from accepted quotes (see quotesApi.convert).
 *
 * Order: { _id, orderNumber, user?{name,email,phone}, customer{name,email,phone}, orderType, items[], shippingAddress{fullName,phone,addressLine1,addressLine2,city,province,postalCode,country},
 *          pricing{subtotal,discount,shipping,additionalCharges,total}, paymentStatus, orderStatus, quote?, coupon?, shipment?{courierName,trackingNumber,trackingUrl,shippedAt,deliveredAt},
 *          statusHistory[{status,note,changedAt,changedBy}], customerNotes, adminNotes, placedAt, createdAt }
 * Item:  { _id, productName, colorName, size, skuCode, image?{url}, unitPrice, quantity, lineTotal, manufacturing and printing snapshots }
 */
export const ordersApi = {
  /** params: search, status, paymentStatus, type, from, to (ISO), page, limit */
  list: async (params = {}) => {
    const body = await get('/admin/orders', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },
  /** { total, pending, confirmed, processing, shipped, delivered, cancelled } */
  summary: async () => (await get('/admin/orders/summary')).data,
  get: async (id) => (await get(`/admin/orders/${id}`)).data,
  /** Moves must follow the lifecycle; backend answers 409 otherwise. */
  updateStatus: async (id, status, note) => (await patch(`/admin/orders/${id}/status`, { status, ...(note?.trim() ? { note: note.trim() } : {}) })).data,
  /** any of courierName, trackingNumber, trackingUrl (not allowed once delivered/cancelled) */
  updateShipment: async (id, shipment) => {
    const body = {};
    for (const k of ['courierName', 'trackingNumber', 'trackingUrl']) {
      const v = shipment[k]?.trim();
      if (v) body[k] = v;
    }
    return (await patch(`/admin/orders/${id}/shipment`, body)).data;
  },
  updateNotes: async (id, adminNotes) => (await patch(`/admin/orders/${id}/notes`, { adminNotes })).data,

  cancellations: {
    /** params: status(pending|approved|rejected), page, limit  — item.order populated {orderNumber,orderStatus,paymentStatus,pricing,customer,placedAt} */
    list: async (params = {}) => {
      const body = await get('/admin/cancellations', cleanParams(params));
      return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
    },
    /** action: approve | reject */
    review: async (id, action, note) => (await patch(`/admin/cancellations/${id}/review`, { action, ...(note?.trim() ? { note: note.trim() } : {}) })).data,
  },
};
