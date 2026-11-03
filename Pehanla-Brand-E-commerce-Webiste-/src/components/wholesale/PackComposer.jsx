import React, { useMemo, useState } from 'react';
import { cleanSelections, groupPackOptions, packSizeOf, selectionItems, selectionProblems, selectionStatus } from '../../utils/packSelection';
import { toQty } from '../../utils/wholesaleCart';
import { inputCls } from '../B2BForm';

/**
 * Lets the buyer build a FLEXIBLE ready pack: any colours/sizes the pack offers, adding up to exactly the pack size.
 * Stock limits shown here come from the live pack (capped at the pack size); the backend re-validates everything on
 * preview and on request, so this panel is feedback, not the rule.
 */
export default function PackComposer({ pack, initial, onSave, onCancel }) {
  const packSize = packSizeOf(pack);
  const groups = useMemo(() => groupPackOptions(pack.items || []), [pack.items]);
  const options = pack.items || [];
  const [sel, setSel] = useState(() => cleanSelections(initial || {}));
  const [open, setOpen] = useState(() => new Set(groups.filter((g) => g.options.some((o) => (initial || {})[String(o.sku)])).map((g) => g.key)));
  const [filter, setFilter] = useState('');
  const [onlyChosen, setOnlyChosen] = useState(false);

  const status = selectionStatus(packSize, sel);
  const problems = selectionProblems(packSize, sel, options);
  const ready = problems.length === 0;
  const tone = status.complete ? 'text-primary' : status.over ? 'text-error' : 'text-on-surface';
  const set = (sku, qty) => setSel((cur) => cleanSelections({ ...cur, [sku]: toQty(qty) }));
  const toggle = (key) => setOpen((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const colourTotal = (g) => g.options.reduce((n, o) => n + (sel[String(o.sku)] || 0), 0);
  const visible = groups.filter((g) => (!filter.trim() || g.label.toLowerCase().includes(filter.trim().toLowerCase())) && (!onlyChosen || colourTotal(g) > 0));
  const chosenColours = groups.filter((g) => colourTotal(g) > 0).length;

  return (
    <section id="pack-composer" aria-labelledby="composer-h" className="mt-8 bg-white border border-border-subtle rounded-2xl p-5 sm:p-6 scroll-mt-28" data-testid="pack-composer">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="composer-h" className="font-headline font-bold text-lg text-primary">Build your pack: {pack.name}</h3>
          <p className="text-xs text-muted mt-1">Choose any colours and sizes you like. The total must be exactly <strong>{packSize}</strong> pieces. You do not have to use every colour.</p>
        </div>
        <button type="button" onClick={onCancel} className="text-xs font-bold underline cursor-pointer">Close</button>
      </div>

      <div className="sticky top-20 z-10 mt-4 bg-white/95 backdrop-blur border border-border-subtle rounded-xl p-3" data-testid="composer-counter">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" aria-live="polite" className={`text-sm font-bold ${tone}`} data-testid="composer-status">
            {status.selected} of {packSize} selected
            <span className="font-medium text-muted"> · {status.over ? `${-status.remaining} too many` : `${status.remaining} remaining`}</span>
          </p>
          <p className="text-xs text-muted">{chosenColours} colour{chosenColours === 1 ? '' : 's'} chosen</p>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-surface-container overflow-hidden" aria-hidden="true"><div className={`h-full ${status.over ? 'bg-error' : 'bg-accent'} transition-all`} style={{ width: `${packSize ? Math.min(100, (status.selected / packSize) * 100) : 0}%` }} /></div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <label className="sr-only" htmlFor="composer-filter">Find a colour</label>
        <input id="composer-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a colour…" className={`${inputCls(false)} max-w-xs py-2`} />
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer"><input type="checkbox" checked={onlyChosen} onChange={(e) => setOnlyChosen(e.target.checked)} />Show chosen colours only</label>
        <button type="button" onClick={() => setSel({})} disabled={!status.selected} className="ml-auto text-xs font-bold underline cursor-pointer disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed">Clear all</button>
      </div>

      <ul className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        {visible.map((g) => {
          const total = colourTotal(g);
          const expanded = open.has(g.key) || total > 0;
          return (
            <li key={g.key} className={`rounded-xl border ${total ? 'border-primary' : 'border-border-subtle'} ${g.inStock ? '' : 'opacity-60'}`} data-testid={`colour-${g.key}`}>
              <button type="button" onClick={() => toggle(g.key)} aria-expanded={expanded} disabled={!g.inStock} className="w-full flex items-center gap-3 p-3 text-left cursor-pointer disabled:cursor-not-allowed">
                <span className="w-5 h-5 rounded-full border border-border-subtle shrink-0" style={{ backgroundColor: g.colorHex || '#ccc' }} aria-hidden="true" />
                <span className="flex-1 min-w-0 text-sm font-bold text-on-surface truncate">{g.label}</span>
                {!g.inStock ? <span className="text-[11px] font-semibold text-error">Out of stock</span> : total > 0 ? <span className="text-xs font-bold text-primary">{total} chosen</span> : <span className="text-[11px] text-muted">{g.options.filter((o) => o.inStock).length} sizes</span>}
                <span className="material-symbols-outlined text-[18px] text-muted" aria-hidden="true">{expanded ? 'expand_less' : 'expand_more'}</span>
              </button>
              {expanded && g.inStock && (
                <div className="px-3 pb-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
                  {g.options.map((o) => {
                    const q = sel[String(o.sku)] || 0;
                    const over = q > o.maxQuantity;
                    const unavailable = !o.inStock || o.maxQuantity < 1;
                    return (
                      <div key={o.sku}>
                        <label htmlFor={`pc-${o.sku}`} className="block text-[11px] font-semibold text-muted mb-1 truncate">{o.size}{unavailable ? <span className="text-error"> · out</span> : <span className="font-normal"> · max {o.maxQuantity}</span>}</label>
                        <input id={`pc-${o.sku}`} type="number" min="0" max={o.maxQuantity} inputMode="numeric" disabled={unavailable} value={q || ''} placeholder="0" aria-invalid={over || undefined}
                          onChange={(e) => set(o.sku, e.target.value)} className={`${inputCls(over)} py-2 text-center`} />
                        {over && <p role="alert" className="text-[11px] font-semibold text-error mt-1">Only {o.maxQuantity} available</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {visible.length === 0 && <p className="text-sm text-muted mt-4">No colours match.</p>}

      {!ready && <ul className="mt-4 text-xs font-semibold text-error flex flex-col gap-1" data-testid="composer-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}

      <div className="flex flex-wrap items-center gap-3 mt-5">
        <button type="button" disabled={!ready} onClick={() => onSave(selectionItems(sel, options))} data-testid="composer-save" className="px-6 py-3 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed">
          {initial && Object.keys(initial).length ? 'Update pack in wholesale cart' : 'Add pack to wholesale cart'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-3 text-xs font-bold cursor-pointer">Cancel</button>
        {ready && <span className="text-xs text-muted">Prices and stock are confirmed again by PEHANLY in your order summary.</span>}
      </div>
    </section>
  );
}
