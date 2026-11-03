import { get, post, patch, cleanParams } from '../lib/apiClient';

/**
 * Admin notifications are OWNER-ONLY on the backend (staff get 403).
 * GET /admin/notifications -> data: { notifications[], unreadCount, meta{page,limit,total,pages} }
 */
export const notificationsApi = {
  list: async (params = {}) => {
    const body = await get('/admin/notifications', cleanParams(params));
    const d = body.data || {};
    return { items: d.notifications || [], unreadCount: d.unreadCount ?? 0, meta: d.meta };
  },
  /** GET /admin/notifications/unread-count -> { unreadCount } */
  unreadCount: async () => (await get('/admin/notifications/unread-count')).data.unreadCount ?? 0,
  /** PATCH /admin/notifications/:id/read */
  markRead: (id) => patch(`/admin/notifications/${id}/read`),
  /** PATCH /admin/notifications/read-all */
  markAllRead: () => patch('/admin/notifications/read-all'),

  /**
   * WhatsApp message history (owner-only). The backend runs the MOCK provider until Meta is connected: status "sent" with
   * provider "mock" / simulated=true is a SIMULATION, nothing was delivered. Credentials are never returned.
   */
  whatsapp: {
    /** GET /admin/notifications/whatsapp?status&event&recipientType&search&from&to&page&limit -> { items, meta, config } */
    list: async (params = {}) => (await get('/admin/notifications/whatsapp', cleanParams(params))).data,
    /** GET .../whatsapp/config -> { provider, simulated, enabled, maxAttempts, events[], statuses[] } */
    config: async () => (await get('/admin/notifications/whatsapp/config')).data,
    /** POST .../whatsapp/:id/retry (failed messages only) */
    retry: async (id) => (await post(`/admin/notifications/whatsapp/${id}/retry`)).data,
    /** POST .../whatsapp/test { to, simulate: success|failure|temporary_failure } through the ACTIVE provider (mock) */
    test: async ({ to, simulate }) => (await post('/admin/notifications/whatsapp/test', { to, simulate })).data,
  },
};
