'use strict';

const MB = 1024 * 1024;

/*
 * Upload purposes. Each purpose fixes the Cloudinary folder, the accepted
 * real file kinds and the size limit, and says who may upload.
 *
 *   access "staff"    -> admin, or staff with the media.manage permission
 *   access "customer" -> any signed-in, active user
 */
const MEDIA_PURPOSES = Object.freeze({
  product_image: { folder: 'products', kinds: ['image'], maxBytes: 8 * MB, access: 'staff' },
  variant_image: { folder: 'variants', kinds: ['image'], maxBytes: 8 * MB, access: 'staff' },
  category_image: { folder: 'categories', kinds: ['image'], maxBytes: 5 * MB, access: 'staff' },
  banner_image: { folder: 'banners', kinds: ['image'], maxBytes: 8 * MB, access: 'staff' },
  manufacturing_catalog: { folder: 'manufacturing/catalog', kinds: ['image'], maxBytes: 8 * MB, access: 'staff' },
  wholesale_pack_image: { folder: 'wholesale/packs', kinds: ['image'], maxBytes: 8 * MB, access: 'staff' },

  avatar: { folder: 'avatars', kinds: ['image'], maxBytes: 3 * MB, access: 'customer' },
  return_image: { folder: 'returns', kinds: ['image'], maxBytes: 5 * MB, access: 'customer' },
  manufacturing_reference: { folder: 'manufacturing/references', kinds: ['image'], maxBytes: 8 * MB, access: 'customer' },
  manufacturing_document: { folder: 'manufacturing/documents', kinds: ['image', 'document'], maxBytes: 10 * MB, access: 'customer' },
  printing_artwork: { folder: 'printing/artwork', kinds: ['image', 'document'], maxBytes: 10 * MB, access: 'customer' },
});

const MEDIA_PURPOSE_NAMES = Object.freeze(Object.keys(MEDIA_PURPOSES));

const MAX_UPLOAD_BYTES = Math.max(
  ...Object.values(MEDIA_PURPOSES).map((purpose) => purpose.maxBytes),
);

module.exports = {
  MEDIA_PURPOSES,
  MEDIA_PURPOSE_NAMES,
  MAX_UPLOAD_BYTES,
};
