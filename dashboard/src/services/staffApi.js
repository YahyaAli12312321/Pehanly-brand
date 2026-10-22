import { get, post, patch, cleanParams } from '../lib/apiClient';

/**
 * Staff management (owner only). Backend: /admin/staff
 * Staff: { _id, name, email, phone, role(admin|staff), permissions[], isActive, lastLoginAt, createdAt }
 * Catalog (GET /permissions): { permissions: string[], templates: { [name]: string[] } }
 * Staff accounts cannot be deleted — deactivate them instead.
 */
const EMPTY_META = { page: 1, limit: 20, total: 0, pages: 1 };

export const staffApi = {
  /** params: search, status(all|active|inactive), page, limit */
  list: async (params = {}) => {
    const body = await get('/admin/staff', cleanParams(params));
    return { items: body.data || [], meta: body.meta || EMPTY_META };
  },
  catalog: async () => (await get('/admin/staff/permissions')).data,
  create: async (b) => (await post('/admin/staff', b)).data,
  update: async (id, b) => (await patch(`/admin/staff/${id}`, b)).data,
  setActive: async (id, isActive) => (await patch(`/admin/staff/${id}/status`, { isActive })).data,
  resetPassword: async (id, password) => (await post(`/admin/staff/${id}/reset-password`, { password })).data,
};
