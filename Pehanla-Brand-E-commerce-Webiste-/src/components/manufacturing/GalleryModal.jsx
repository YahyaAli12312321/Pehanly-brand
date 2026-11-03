import React, { useEffect, useMemo, useRef, useState } from 'react';

const VIEW_LABEL = { model: 'Model', mockup: 'Mockup', other: 'Detail' };

/**
 * Gallery for one style. Tabs and colour chips are built ONLY from the media/variants that exist
 * (no hardcoded counts). "Request a quote" hands the chosen colour back to the inquiry form.
 */
export default function GalleryModal({ open, onClose, styleName, categoryName, variants, initialVariantId = '', onRequest }) {
  const [variantId, setVariantId] = useState(initialVariantId);
  const [view, setView] = useState('all');
  const [index, setIndex] = useState(0);
  const closeRef = useRef(null);
  const returnRef = useRef(null);

  useEffect(() => { if (open) { setVariantId(initialVariantId); setView('all'); setIndex(0); } }, [open, initialVariantId]);

  const all = useMemo(() => variants.flatMap((v) => (v.media || []).map((m) => ({ ...m, variantId: v._id || v.id }))).filter((m) => m.url), [variants]);
  const inColour = useMemo(() => all.filter((m) => !variantId || m.variantId === variantId), [all, variantId]);
  const views = useMemo(() => [...new Set(inColour.map((m) => m.viewType).filter(Boolean))], [inColour]);
  const shown = useMemo(() => inColour.filter((m) => view === 'all' || m.viewType === view), [inColour, view]);
  const current = shown[Math.min(index, Math.max(shown.length - 1, 0))];
  const variant = variants.find((v) => (v._id || v.id) === variantId);

  useEffect(() => setIndex(0), [variantId, view]);
  useEffect(() => { if (view !== 'all' && !views.includes(view)) setView('all'); }, [views, view]);

  useEffect(() => {
    if (!open) return undefined;
    returnRef.current = document.activeElement;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, shown.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; returnRef.current?.focus?.(); };
  }, [open, onClose, shown.length]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`${styleName} gallery`} className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-0 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()} data-testid="mf-gallery">
      <div className="bg-surface w-full max-w-5xl max-h-full sm:max-h-[92vh] sm:rounded-2xl overflow-y-auto flex flex-col">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-border-subtle">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-bold text-primary">{categoryName}</p>
            <h2 className="font-headline font-bold text-xl text-primary">{styleName}</h2>
          </div>
          <button ref={closeRef} type="button" aria-label="Close gallery" onClick={onClose} className="p-1 text-on-surface hover:text-primary cursor-pointer"><span className="material-symbols-outlined" aria-hidden="true">close</span></button>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6">
          <div className="min-w-0">
            {current ? (
              <div className="relative bg-surface-container rounded-xl overflow-hidden">
                <img src={current.url} alt={current.alt || `${styleName}${variant ? ` in ${variant.colorName}` : ''}`} referrerPolicy="no-referrer" className="w-full max-h-[60vh] object-contain" />
                {shown.length > 1 && (
                  <>
                    <button type="button" aria-label="Previous image" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 disabled:opacity-30 cursor-pointer"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></button>
                    <button type="button" aria-label="Next image" disabled={index >= shown.length - 1} onClick={() => setIndex((i) => i + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 disabled:opacity-30 cursor-pointer"><span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
                  </>
                )}
              </div>
            ) : <p className="text-sm text-muted p-8 bg-surface-container rounded-xl">No images are available for this selection yet.</p>}
            {shown.length > 1 && (
              <ul className="flex gap-2 mt-3 overflow-x-auto pb-1">
                {shown.map((m, i) => (
                  <li key={m.url + i} className="shrink-0"><button type="button" aria-label={`Image ${i + 1} of ${shown.length}`} aria-current={index === i} onClick={() => setIndex(i)} className={`block w-16 h-16 rounded-lg overflow-hidden cursor-pointer ${index === i ? 'ring-2 ring-primary' : 'opacity-70'}`}><img src={m.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" /></button></li>
                ))}
              </ul>
            )}
          </div>

          <aside className="flex flex-col gap-5">
            {views.length > 1 && (
              <div role="group" aria-label="View type" className="flex flex-wrap gap-2">
                {['all', ...views].map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${view === v ? 'bg-primary text-white' : 'bg-surface-container text-muted'}`}>{v === 'all' ? 'All' : VIEW_LABEL[v] || v}</button>)}
              </div>
            )}
            {variants.length > 0 && (
              <div>
                <p className="text-xs font-bold text-on-surface mb-2">Colour</p>
                <div role="group" aria-label="Colour" className="flex flex-wrap gap-2">
                  <button type="button" aria-pressed={!variantId} onClick={() => setVariantId('')} className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${!variantId ? 'bg-accent text-primary' : 'bg-surface-container text-muted'}`}>All colours</button>
                  {variants.map((v) => { const vid = v._id || v.id; return <button key={vid} type="button" aria-pressed={variantId === vid} onClick={() => setVariantId(vid)} className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${variantId === vid ? 'bg-accent text-primary' : 'bg-surface-container text-muted'}`}>{v.colorName || v.name || v.variantCode}</button>; })}
                </div>
              </div>
            )}
            <div className="bg-surface-container-low border border-border-subtle rounded-xl p-4 text-sm" data-testid="mf-selected-config">
              <p className="text-xs font-bold uppercase tracking-wider text-primary mb-2">Selected configuration</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted">Garment</dt><dd className="font-semibold">{categoryName}</dd>
                <dt className="text-muted">Style</dt><dd className="font-semibold">{styleName}</dd>
                <dt className="text-muted">Colour</dt><dd className="font-semibold">{variant ? variant.colorName : 'No preference'}</dd>
              </dl>
            </div>
            <button type="button" onClick={() => onRequest(variantId)} className="h-12 px-6 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-lg cursor-pointer">Customize &amp; request quote</button>
          </aside>
        </div>
      </div>
    </div>
  );
}
