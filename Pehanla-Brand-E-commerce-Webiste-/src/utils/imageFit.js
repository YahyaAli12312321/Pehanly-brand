/** 'cover' when the picture is within 15% of the frame's shape (fills it), otherwise 'contain' (shown whole, never cropped). */
export function chooseFit(naturalWidth, naturalHeight, frameRatio = 0.8) {
  if (!naturalWidth || !naturalHeight) return 'cover';
  return Math.abs(naturalWidth / naturalHeight / frameRatio - 1) <= 0.15 ? 'cover' : 'contain';
}
