import React from 'react';
import { allocationStatus, toQty } from '../../utils/wholesaleCart';
import { inputCls } from '../B2BForm';

/**
 * Size & colour distribution for one product line. Colours are rows; each colour lists its own sizes
 * in an auto-fitting grid so wide size runs wrap instead of overflowing on phones.
 * The sum must equal the ordered quantity; the backend re-validates on submit.
 */
export default function AllocationPanel({ line, product, onSet, onConfirm, onReset, backendMismatch }) {
  const s = allocationStatus(line.ordered, line.alloc);
  const tone = s.valid ? 'text-primary' : s.over ? 'text-error' : 'text-on-surface';
  const msg = !s.ordered
    ? 'Enter the quantity you need above.'
    : s.valid
      ? `${s.allocated} of ${s.ordered} allocated`
      : s.over
        ? `${-s.remaining} too many — reduce an allocation`
        : `${s.allocated} of ${s.ordered} allocated — ${s.remaining} left`;

  return (
    <div className="mt-4 pt-4 border-t border-border-subtle" data-testid={`alloc-${line.productId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h4 className="font-headline font-bold text-sm text-primary">Size &amp; colour distribution</h4>
        <p role="status" aria-live="polite" className={`text-xs font-bold ${tone}`} data-testid={`alloc-status-${line.productId}`}>{msg}</p>
      </div>
      <div className="mb-3 h-1.5 rounded-full bg-surface-container overflow-hidden" aria-hidden="true"><div className={`h-full ${s.over ? 'bg-error' : 'bg-accent'} transition-all`} style={{ width: `${s.ordered ? Math.min(100, (s.allocated / s.ordered) * 100) : 0}%` }} /></div>

      <div className="flex flex-col gap-4">
        {product.variants.map((v) => {
          const colourTotal = v.sizes.reduce((n, sz) => n + (line.alloc[sz.id] || 0), 0);
          return (
            <fieldset key={v.id} className="min-w-0">
              <legend className="flex items-center gap-2 text-xs font-bold text-on-surface mb-2">
                <span className="w-3.5 h-3.5 rounded-full border border-border-subtle" style={{ backgroundColor: v.hexCode || '#ccc' }} aria-hidden="true" />
                {v.colorName}
                {colourTotal > 0 && <span className="font-medium text-muted">· {colourTotal}</span>}
              </legend>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))' }}>
                {v.sizes.map((sz) => (
                  <div key={sz.id}>
                    <label htmlFor={`a-${line.id}-${sz.id}`} className="block text-[11px] font-semibold text-muted mb-1 truncate">
                      {sz.size}{!sz.inStock && <span className="text-error"> · out</span>}
                    </label>
                    <input
                      id={`a-${line.id}-${sz.id}`}
                      type="number"
                      min="0"
                      max="1000000"
                      inputMode="numeric"
                      value={line.alloc[sz.id] ?? ''}
                      placeholder="0"
                      onChange={(e) => onSet(line.id, sz.id, toQty(e.target.value))}
                      className={`${inputCls(false)} py-2 text-center`}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>

      {backendMismatch && <p role="alert" className="text-xs font-semibold text-error mt-3">PEHANLY could not verify this allocation ({backendMismatch.allocated} allocated vs {backendMismatch.ordered} ordered).</p>}

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button type="button" disabled={!s.valid || line.confirmed} onClick={() => onConfirm(line.id)} className="px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
          {line.confirmed ? 'Allocation saved' : 'Confirm & save allocation'}
        </button>
        <button type="button" onClick={() => onReset(line.id)} disabled={!s.allocated} className="px-4 py-2.5 rounded-lg border border-border-subtle text-xs font-bold uppercase tracking-wider text-on-surface cursor-pointer hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed">Reset allocation</button>
        {line.confirmed && <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><span className="material-symbols-outlined text-[16px]" aria-hidden="true">check_circle</span>Ready for the order summary</span>}
      </div>
    </div>
  );
}
