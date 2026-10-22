import React from 'react';
import { useManufacturingVariantsQuery } from '../../hooks/useQueries';

const list = (d) => (Array.isArray(d) ? d : d?.items || []);

/** A silhouette/style card. Image + colour count come from the style's real variants. */
export default function StyleCard({ style, selected, onSelect, onGallery, compact = false }) {
  const sid = style._id || style.id;
  const { data } = useManufacturingVariantsQuery(sid);
  const variants = list(data);
  const image = variants.flatMap((v) => v.media || []).find((m) => m.url)?.url;
  return (
    <li className={`bg-white rounded-2xl border overflow-hidden flex flex-col ${selected ? 'border-primary ring-1 ring-primary' : 'border-border-subtle'}`} data-testid="mf-style-card">
      <div className="aspect-4/3 bg-surface-container overflow-hidden">
        {image ? <img src={image} alt={style.name} width="480" height="360" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted"><span className="material-symbols-outlined text-4xl" aria-hidden="true">checkroom</span></div>}
      </div>
      <div className="p-5 flex flex-col gap-2 flex-1">
        <h3 className="font-headline font-bold text-primary">{style.name}</h3>
        {!compact && style.description && <p className="text-sm text-muted line-clamp-3">{style.description}</p>}
        {variants.length > 0 && <p className="text-xs text-muted">{variants.length} {variants.length === 1 ? 'colour' : 'colours'} available</p>}
        <div className="mt-auto pt-2 flex flex-wrap gap-3">
          {onSelect && <button type="button" aria-pressed={selected} onClick={() => onSelect(sid)} className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer ${selected ? 'bg-primary text-white' : 'bg-surface-container text-primary'}`}>{selected ? 'Selected' : 'Select style'}</button>}
          {onGallery && <button type="button" onClick={() => onGallery(sid)} className="text-xs font-bold uppercase tracking-wider text-primary underline cursor-pointer">View gallery</button>}
        </div>
      </div>
    </li>
  );
}
