import { get, patch, cleanParams } from '../lib/apiClient';

/**
 * Customers (admin, read-mostly). Backend: /admin/customers — customers.read / customers.manage.
 * Customers sign up themselves; the backend has NO admin "create customer" or export endpoint.
 *
 * List item: { _id, name, email, phone, customerNumber, accountTier(retail|wholesale|vip), isActive, status(active|suspended),
 *              city, region, primaryAddress, addresses[], totalOrders, lifetimeValue (delivered orders only), lastOrderAt, createdAt }
 */
export const customersApi = {
  /** params: search, status(all|active|suspended), tier(all|retail|wholesale|vip), sortBy(createdAt|name|orders|ltv), sortDir, page, limit */
  list: async (params = {}) => {
    const body = await get('/admin/customers', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },
  /** { totalAccounts, activeAccounts, suspendedAccounts, b2bWholesaleAccounts, retailVipPatrons, cumulativeLtv } */
  summary: async () => (await get('/admin/customers/summary')).data,
  get: async (id) => (await get(`/admin/customers/${id}`)).data,
  /** { items: [{ _id, orderNumber, orderType, itemCount, total, paymentStatus, orderStatus, placedAt }], meta } */
  orders: async (id, params = {}) => {
    const body = await get(`/admin/customers/${id}/orders`, cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },
  /** status: active | suspended; reason (3-500 chars) is optional. Suspending signs the customer out everywhere. */
  setStatus: async (id, status, reason) => (await patch(`/admin/customers/${id}/status`, { status, ...(reason?.trim() ? { reason: reason.trim() } : {}) })).data,
};
