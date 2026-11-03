import { get, patch, cleanParams } from '../lib/apiClient';

/**
 * Returns & Refunds (admin). Backend: /admin/returns — orders.read (GET) / orders.manage (PATCH).
 * Flow: pending → approve|reject → (approved) receive → (received) inspect → (inspected) prepare refund → complete COD refund.
 * JazzCash provider refunds are NOT implemented by the backend: the refund stays "pending" and must be settled outside the system.
 * List meta uses `pages` (not totalPages).
 */
export const RETURN_STATUSES = ['pending', 'approved', 'rejected', 'received', 'inspected', 'completed', 'cancelled'];
export const REFUND_STATUSES = ['not_required', 'pending', 'processing', 'completed', 'failed', 'cancelled'];
export const ITEM_CONDITIONS = ['restockable', 'damaged', 'not_restockable'];

export const returnsApi = {
  /** params: status, refundStatus, page, limit */
  list: async (params = {}) => {
    const body = await get('/admin/returns', cleanParams(params));
    const m = body.meta || {};
    return { items: body.data || [], meta: { page: m.page || 1, limit: m.limit || 20, total: m.total || 0, totalPages: m.pages || m.totalPages || 1 } };
  },
  get: async (id) => (await get(`/admin/returns/${id}`)).data,
  /** { action: 'approve'|'reject', note? } */
  review: async (id, payload) => (await patch(`/admin/returns/${id}/review`, payload)).data,
  receive: async (id, payload = {}) => (await patch(`/admin/returns/${id}/receive`, payload)).data,
  /** { items: [{ returnItem, condition, restockQuantity }], note? } */
  inspect: async (id, payload) => (await patch(`/admin/returns/${id}/inspect`, payload)).data,
  /** { paymentId, amount } — records a pending refund against a PAID payment of the order */
  prepareRefund: async (id, payload) => (await patch(`/admin/returns/${id}/refund`, payload)).data,
  /** COD only: mark the cash refund as handed back */
  completeCodRefund: async (id) => (await patch(`/admin/returns/${id}/refund/complete-cod`)).data,
};
