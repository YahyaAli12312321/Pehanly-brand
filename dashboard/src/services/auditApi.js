import { get, cleanParams } from '../lib/apiClient';

/**
 * Audit logs (owner only, read-only). Backend: GET /admin/audit-logs
 * Entry: { id, action, entityType, entityId, actor:{id,name,email,role}|null, metadata|null, ip|null, createdAt }
 * params: page, limit, action, entityType, entityId, admin(user id), from, to (ISO)
 */
export const auditApi = {
  list: async (params = {}) => {
    const body = await get('/admin/audit-logs', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 30, total: 0, pages: 1 } };
  },
};
