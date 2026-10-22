import React, { useEffect, useState } from 'react';

/**
 * Admin-managed banner/hero image with every state handled: skeleton while loading, an on-brand
 * placeholder when there is no image or it fails to load, responsive sizing and object-fit.
 * The placeholder is local (no external hotlink) so production never depends on a third-party URL.
 */
export default function BannerImage({ src, alt = '', className = '', icon = 'inventory_2', priority = false, width = 960, height = 720, fit = 'object-cover' }) {
  const [state, setState] = useState(src ? 'loading' : 'missing');
  useEffect(() => { setState(src ? 'loading' : 'missing'); }, [src]);

  if (state === 'missing' || state === 'error') {
    return (
      <div role="img" aria-label={alt || 'Image coming soon'} data-banner-state={state} className={`${className} flex items-center justify-center bg-gradient-to-br from-surface-container to-surface-container-high`}>
        <span className="material-symbols-outlined text-primary/40 text-6xl" aria-hidden="true">{icon}</span>
      </div>
    );
  }
  return (
    <div className={`${className} relative overflow-hidden bg-surface-container`} data-banner-state={state}>
      {state === 'loading' && <div className="absolute inset-0 animate-pulse bg-surface-container-high" aria-hidden="true" />}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
        className={`absolute inset-0 w-full h-full ${fit} transition-opacity duration-300 ${state === 'ready' ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
