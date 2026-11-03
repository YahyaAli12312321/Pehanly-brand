import { useEffect, useState } from 'react';
import { chooseFit } from '../utils/imageFit';

/**
 * Fixed frame (4:5 on the product page, 3:4 on shop cards; set with `ratio` = width/height) for every product image so model shots and flat mock-ups look the same size.
 * Images close to the frame's 4:5 shape fill it (cover). Square, landscape or very tall mock-ups are shown whole
 * (contain) over a soft blurred copy of themselves, so nothing is cropped and there are no empty bars.
 */
export default function FramedImage({ src, alt = '', eager = false, hoverZoom = false, width = 800, height = 1000, ratio = 0.8, className = '' }) {
  const [fit, setFit] = useState('cover');
  useEffect(() => { setFit('cover'); }, [src]);
  const onLoad = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (!w || !h) return;
    setFit(chooseFit(w, h, ratio));
  };
  return (
    <div className={`relative w-full h-full overflow-hidden bg-surface-container-low ${className}`}>
      {fit === 'contain' && (
        <img src={src} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40" referrerPolicy="no-referrer" />
      )}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={onLoad}
        className={`relative w-full h-full object-center ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${hoverZoom ? 'transition-transform duration-500 ease-out group-hover:scale-105' : ''}`}
      />
    </div>
  );
}
