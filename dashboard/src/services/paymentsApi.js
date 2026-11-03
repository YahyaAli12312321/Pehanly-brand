import { get, patch, cleanParams } from '../lib/apiClient';

/**
 * Payments (admin). Backend: /admin/payments — payments.read (GET) / payments.manage (writes).
 * Gateways: cod | jazzcash only. Refunds are NOT issued from here: they are part of the Returns & Refunds flow.
 *
 * List item: { _id, paymentNumber, order, gateway, transactionId, amount, gatewayFee, netAmount, currency, status,
 *              providerResponse, failureReason, paidAt, failedAt, cancelledAt, refundedAt, createdAt,
 *              orderData{ _id, orderNumber, orderType, orderStatus, paymentStatus, customer{name,email,phone}, pricing } }
 * Detail:    same fields but the order is populated under `order`.
 */
export const GATEWAY_LABELS = { cod: 'COD Cash', jazzcash: 'JazzCash' };

export const paymentsApi = {
  /** params: search, status, gateway(cod|jazzcash), from, to (ISO with offset), page, limit */
  list: async (params = {}) => {
    const body = await get('/admin/payments', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },
  /** { totalSettled, pendingGatewayInflow, disbursedRefunds(null), refundPaymentCount, gatewayEfficiency, currency }
   *  Requires the GET /admin/payments/summary route (added in backend patch; 404 on older builds). */
  summary: async () => (await get('/admin/payments/summary')).data,
  get: async (id) => (await get(`/admin/payments/${id}`)).data,
  /** Mark a COD payment as received. Idempotent; refused for cancelled orders. */
  confirmCod: async (id) => (await patch(`/admin/payments/${id}/cod/confirm`)).data,
};
