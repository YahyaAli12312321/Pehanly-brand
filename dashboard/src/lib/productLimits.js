/** Max general images per product. Must match PRODUCT_IMAGE_LIMIT in the backend product validators. */
export const PRODUCT_IMAGE_LIMIT = 25;

export const AUDIENCE_OPTIONS = [
  { value: '', label: 'Same as category (default)' },
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'unisex', label: 'Unisex (shown under Men and Women)' },
];

/** Returns an error message when a product has more images than the backend accepts, else ''. */
export const imageCountError = (images, max = PRODUCT_IMAGE_LIMIT) =>
  Array.isArray(images) && images.length > max ? `A product can have at most ${max} images (currently ${images.length}).` : '';
