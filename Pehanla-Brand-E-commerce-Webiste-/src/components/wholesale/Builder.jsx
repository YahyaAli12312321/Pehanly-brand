import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useWholesaleCartStore } from '../../store/useWholesaleCartStore';
import { formatMoney } from '../../utils/currency';
import { toQty } from '../../utils/wholesaleCart';
import { activeTierIndex, buildTierRows, estimateUnit } from '../../utils/wholesaleTiers';
import { ErrorBlock, LoadingBlock } from '../StateViews';
import { SignInGate, inputCls } from '../B2BForm';
import BannerImage from '../BannerImage';

const money = (n) => formatMoney(n, 'PKR');

function ProductCard({ p, inCart, onAdd }) {
  const rows = useMemo(() => buildTierRows(p), [p]);
  const moq = Math.max(1, p.moq || 1);
  const [qty, setQty] = useState(moq);
  const q = toQty(qty);
  const idx = activeTierIndex(rows, q);
  const est = estimateUnit(rows, q);
  const belowMoq = q < moq;
  const retail = p.retailPrice;
  const stepTo = (n) => setQty(Math.max(1, n));

  return (
    <li className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden flex flex-col min-w-0" data-testid="wholesale-product">
      <div className="flex gap-4 p-4 sm:p-5">
        <BannerImage src={p.image} alt={p.name} width={96} height={120} icon="checkroom" className="w-20 h-24 sm:w-24 sm:h-28 rounded-lg shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="font-headline font-bold text-primary leading-snug">{p.name}</h3>
          {p.shortDescription && <p className="text-xs text-muted mt-0.5 line-clamp-2">{p.shortDescription}</p>}
          <p className="text-[11px] text-muted mt-1 font-mono truncate">{p.variants?.[0]?.sizes?.[0]?.sku ? `SKU ${p.variants[0].sizes[0].sku.replace(/-[^-]*$/, '')}` : ''}</p>
          <p className="text-sm font-bold text-on-surface mt-1.5">
            {p.basePrice != null ? <>{money(p.basePrice)} <span className="text-xs font-medium text-muted">/ piece base</span></> : '—'}
            {retail > 0 && p.basePrice != null && <span className="ml-2 text-xs font-medium text-muted line-through" title="Retail price for comparison">{money(retail)}</span>}
          </p>
          <p className="text-xs text-muted">{p.moq ? `MOQ ${p.moq} pieces (mixed colours & sizes)` : 'No minimum quantity'}</p>
        </div>
      </div>

      <div className="px-4 sm:px-5 overflow-x-auto">
        <table className="w-full text-xs border border-border-subtle rounded-lg overflow-hidden" aria-label={`Volume pricing for ${p.name}`}>
          <thead className="bg-surface-container text-muted"><tr><th scope="col" className="px-3 py-1.5 text-left font-semibold">Quantity</th><th scope="col" className="px-3 py-1.5 text-right font-semibold">Price / piece</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.from} aria-current={i === idx ? 'true' : undefined} data-active={i === idx ? 'true' : 'false'} className={`border-t border-border-subtle ${i === idx ? 'bg-accent/25 font-bold text-primary' : ''}`}>
                <td className="px-3 py-1.5 whitespace-nowrap">{r.label}{i === idx && <span className="ml-1.5 text-[9px] uppercase tracking-widest">Active</span>}</td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">{r.quoteOnly ? 'Request quote' : r.unitPrice != null ? money(r.unitPrice) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 sm:p-5 mt-auto flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center" role="group" aria-label={`Quantity for ${p.name}`}>
            <button type="button" aria-label="Decrease quantity" onClick={() => stepTo(q - 1)} className="w-10 h-10 rounded-l-lg border border-border-subtle bg-surface-container text-lg font-bold cursor-pointer hover:bg-surface-container-high">−</button>
            <input aria-label="Quantity" type="number" min="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls(belowMoq)} !rounded-none w-20 h-10 py-0 text-center`} />
            <button type="button" aria-label="Increase quantity" onClick={() => stepTo(q + 1)} className="w-10 h-10 rounded-r-lg border border-border-subtle bg-surface-container text-lg font-bold cursor-pointer hover:bg-surface-container-high">+</button>
          </div>
          <div className="text-right" data-testid="builder-estimate">
            <p className="text-[10px] uppercase tracking-widest text-muted">Estimated total</p>
            <p className="font-headline font-bold text-primary">{est.unitPrice != null && q > 0 ? money(est.unitPrice * q) : '—'}</p>
            {est.quote && <p className="text-[10px] font-semibold text-[#6f7f10]">Quote required at this volume</p>}
          </div>
        </div>
        {belowMoq && <p role="alert" className="text-xs font-semibold text-error">Minimum order is {moq}.</p>}
        <p className="text-[10px] text-muted">Estimate uses the base price per tier; final totals, freight and tax are confirmed by PEHANLY in your order summary.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button type="button" disabled={belowMoq || !q} onClick={() => onAdd(p, q, true)} className="h-11 rounded-lg border-2 border-primary text-primary text-[11px] font-bold uppercase tracking-widest cursor-pointer hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed">Allocate sizes &amp; colors</button>
          <button type="button" disabled={inCart || belowMoq || !q} onClick={() => onAdd(p, q, false)} className="h-11 rounded-lg bg-primary text-white text-[11px] font-bold uppercase tracking-widest cursor-pointer hover:bg-primary-dark disabled:opacity-60 disabled:cursor-default">{inCart ? 'In wholesale cart' : 'Add to wholesale cart'}</button>
        </div>
      </div>
    </li>
  );
}

export default function Builder({ catalog }) {
  const { isAuthenticated, navigate, showToast } = useApp();
  const { lines, addManual, setOrdered } = useWholesaleCartStore();
  const [search, setSearch] = useState('');

  const shown = useMemo(() => (catalog.data || []).filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())), [catalog.data, search]);

  if (!isAuthenticated) return <SignInGate onSignIn={() => navigate('account')} what="see wholesale pricing and build your own order" />;
  if (catalog.isLoading) return <LoadingBlock label="Loading wholesale catalogue…" className="py-10" />;
  if (catalog.isError) return <ErrorBlock error={catalog.error} onRetry={catalog.refetch} className="py-10" />;
  if (!(catalog.data || []).length) return <p className="text-sm text-muted">No products are open for wholesale right now.</p>;

  const add = (prod, q, goAllocate) => {
    const lineId = `m-${prod.id}`;
    if (!lines.some((l) => l.id === lineId)) { addManual(prod, q); showToast(`${prod.name} added — now allocate sizes & colours`); }
    else if (goAllocate) setOrdered(lineId, q);
    if (goAllocate) setTimeout(() => document.getElementById(`wline-${lineId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  return (
    <>
      <div className="flex justify-end mb-5">
        <label htmlFor="ws-search" className="sr-only">Search wholesale products</label>
        <input id="ws-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" className={`${inputCls(false)} w-full sm:w-64`} />
      </div>
      {shown.length === 0 ? <p className="text-sm text-muted">No products match your search.</p> : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
          {shown.map((p) => <ProductCard key={p.id} p={p} inCart={lines.some((l) => l.id === `m-${p.id}`)} onAdd={add} />)}
        </ul>
      )}
    </>
  );
}
