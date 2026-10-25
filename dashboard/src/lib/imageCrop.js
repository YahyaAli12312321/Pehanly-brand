/**
 * Pure crop maths + canvas export for the product image adjuster.
 * Nothing here stretches an image: the output canvas always has exactly the aspect ratio of the
 * source rectangle it is drawn from, so the picture is only ever cropped and scaled uniformly.
 */

/** Product images are normally kept to the same cap the backend applies (2400px long side). */
export const MAX_OUTPUT_SIDE = 2400;

/** ratio = width / height; null = keep the file exactly as chosen (no crop). */
export const CROP_PRESETS = [
  { id: 'original', label: 'Original', hint: 'Upload unchanged', ratio: null },
  { id: 'square', label: 'Square 1:1', hint: 'Instagram-style', ratio: 1 },
  { id: 'portrait', label: 'Portrait 4:5', hint: 'Storefront standard', ratio: 4 / 5 },
  { id: 'landscape', label: 'Landscape 3:2', hint: 'Wide mock-ups', ratio: 3 / 2 },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * The largest rectangle of the given aspect ratio that fits in the image, divided by zoom (>= 1).
 * Returns source-pixel width/height of the crop window.
 */
export function cropSize(imgW, imgH, ratio, zoom = 1) {
  const z = Math.max(1, zoom);
  let w; let h;
  if (imgW / imgH > ratio) { h = imgH; w = h * ratio; } else { w = imgW; h = w / ratio; }
  return { w: w / z, h: h / z };
}

/** cx/cy = centre of the crop window as 0..1 fractions of the image. Returns the clamped top-left in source px. */
export function cropRect(imgW, imgH, ratio, zoom, cx = 0.5, cy = 0.5) {
  const { w, h } = cropSize(imgW, imgH, ratio, zoom);
  return {
    x: clamp(cx * imgW - w / 2, 0, imgW - w),
    y: clamp(cy * imgH - h / 2, 0, imgH - h),
    w,
    h,
  };
}

/** Output pixel size for a crop window: never upscaled, long side capped. */
export function outputSize(w, h, maxSide = MAX_OUTPUT_SIDE) {
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

/**
 * CSS percentages that place the full image inside a frame so it shows exactly the crop rect.
 * Used by the live preview, so what the admin sees is what gets exported.
 */
export function previewStyle(imgW, imgH, rect) {
  return {
    position: 'absolute',
    width: `${(imgW / rect.w) * 100}%`,
    height: `${(imgH / rect.h) * 100}%`,
    left: `${(-rect.x / rect.w) * 100}%`,
    top: `${(-rect.y / rect.h) * 100}%`,
    maxWidth: 'none',
  };
}

const extFor = (type) => (type === 'image/png' ? 'png' : 'jpg');

/** Draw the crop rect to a canvas and return a File. Throws a readable Error on failure. */
export async function exportCrop(img, rect, file) {
  const { width, height } = outputSize(rect.w, rect.h);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images. Upload the original instead.');
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  if (type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error('Could not create the adjusted image. Try a smaller image or upload the original.');
  const base = (file.name || 'image').replace(/\.[^.]+$/, '');
  return new File([blob], `${base}-cropped.${extFor(type)}`, { type });
}
