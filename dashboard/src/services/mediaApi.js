import { apiClient, get, del, cleanParams } from '../lib/apiClient';
import { toApiError } from '../lib/apiError';

/**
 * Media API. Files go to the BACKEND (POST /media, multipart field "file" + "purpose"),
 * which stores them in Cloudinary. The browser never talks to Cloudinary directly and
 * never holds Cloudinary credentials.
 *
 * Upload view: { id, publicId, url, optimizedUrl, thumbUrl, resourceType, format, bytes, width, height, purpose, originalName, createdAt }
 */
export const MEDIA_PURPOSES = {
  product_image: { label: 'Product image', maxMb: 8 },
  variant_image: { label: 'Variant image', maxMb: 8 },
  category_image: { label: 'Category image', maxMb: 5 },
  banner_image: { label: 'Banner image', maxMb: 8 },
  manufacturing_catalog: { label: 'Manufacturing catalog image', maxMb: 8 },
  wholesale_pack_image: { label: 'Wholesale pack image', maxMb: 8 },
};

export const mediaApi = {
  /** POST /media -> data: media view. onProgress(0..100) is optional. */
  upload: async (file, purpose, { onProgress, signal } = {}) => {
    const form = new FormData();
    form.append('purpose', purpose);
    form.append('file', file);
    try {
      const res = await apiClient.post('/media', form, {
        signal,
        timeout: 120000,
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      return res.data.data;
    } catch (err) {
      throw toApiError(err);
    }
  },
  /** DELETE /media/:id — 409 MEDIA_IN_USE when still referenced. */
  remove: (id) => del(`/media/${id}`),
  /** GET /admin/media (media.read) */
  listAll: async (params = {}) => {
    const body = await get('/admin/media', cleanParams(params));
    return { items: body.data || [], meta: body.meta };
  },
};

/** Shape the backend validators expect for an image reference. */
export const toImageRef = (media, alt) =>
  media ? { url: media.url, publicId: media.publicId, ...(alt ? { alt } : {}) } : null;
