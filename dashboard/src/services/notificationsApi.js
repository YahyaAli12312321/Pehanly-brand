import { get, patch, cleanParams } from '../lib/apiClient';

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
};
