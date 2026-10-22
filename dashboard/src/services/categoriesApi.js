import { get, post, patch, cleanParams } from '../lib/apiClient';

/**
 * Categories (admin). Backend: /admin/categories — requires catalog.read (GET) / catalog.manage (writes).
 * There is NO delete / duplicate / export endpoint, so the UI does not offer them.
 *
 * Item: { _id, name, slug, description, image{url,publicId,alt}|null, parentCategory{_id,name,slug}|null,
 *         audience, isActive, showOnHome, retailOnly, sortOrder, productsCount, seo, createdAt, updatedAt }
 * List: { data: Item[], meta: { page, limit, total, totalPages } }
 */
const imageRef = (img) => (img?.url ? { url: img.url, ...(img.publicId ? { publicId: img.publicId } : {}), ...(img.alt ? { alt: img.alt } : {}) } : null);

export const categoriesApi = {
  list: async (params = {}) => {
    const body = await get('/admin/categories', cleanParams(params));
    return { items: body.data || [], meta: body.meta || { page: 1, limit: 20, total: 0, totalPages: 1 } };
  },
  get: async (id) => (await get(`/admin/categories/${id}`)).data,
  /** { total, active, inactive, showOnHome, topLevel } */
  summary: async () => (await get('/admin/categories/summary')).data,
  audiences: async () => (await get('/admin/categories/audiences')).data || [],
  create: async (form) => (await post('/admin/categories', toBody(form))).data,
  update: async (id, form) => (await patch(`/admin/categories/${id}`, toBody(form))).data,
  setStatus: async (id, isActive) => (await patch(`/admin/categories/${id}/status`, { isActive })).data,
};

/** Form state -> exact body the (strict) validator accepts. Only defined keys are sent. */
function toBody(form) {
  const body = {};
  if ('name' in form) body.name = String(form.name).trim();
  if (form.slug) body.slug = String(form.slug).trim().toLowerCase();
  if ('description' in form) body.description = String(form.description ?? '').trim();
  if ('image' in form) body.image = imageRef(form.image);
  if ('parentCategory' in form) body.parentCategory = form.parentCategory || null;
  if ('audience' in form && form.audience) body.audience = String(form.audience).trim().toLowerCase();
  if ('isActive' in form) body.isActive = !!form.isActive;
  if ('showOnHome' in form) body.showOnHome = !!form.showOnHome;
  if ('sortOrder' in form) body.sortOrder = Math.max(0, Math.round(Number(form.sortOrder) || 0));
  return body;
}
