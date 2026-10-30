/** Max general images per product. Must match PRODUCT_IMAGE_LIMIT in the backend product validators. */
export const PRODUCT_IMAGE_LIMIT = 25;

/** Product CREATION takes one main image (the shop-card thumbnail). Must match PRODUCT_CREATE_IMAGE_LIMIT in the backend. */
export const PRODUCT_CREATE_IMAGE_LIMIT = 1;

export const AUDIENCE_OPTIONS = [
  { value: '', label: 'Same as category (default)' },
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'unisex', label: 'Unisex (shown under Men and Women)' },
];

/** Returns an error message when a product has more images than the backend accepts, else ''. */
export const imageCountError = (images, max = PRODUCT_IMAGE_LIMIT) =>
  Array.isArray(images) && images.length > max ? `A product can have at most ${max} images (currently ${images.length}).` : '';

/** Limit that applies to this editor session: one image while creating a product, the full gallery when editing one. */
export const imageLimitFor = (isCreation) => (isCreation ? PRODUCT_CREATE_IMAGE_LIMIT : PRODUCT_IMAGE_LIMIT);
