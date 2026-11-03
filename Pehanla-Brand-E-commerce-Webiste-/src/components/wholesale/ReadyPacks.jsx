import React from 'react';
import { useApp } from '../../context/AppContext';
import { useWholesaleCartStore } from '../../store/useWholesaleCartStore';
import { formatMoney } from '../../utils/currency';
import { ErrorBlock, LoadingBlock } from '../StateViews';
import BannerImage from '../BannerImage';
import { isFlexiblePack, packSizeOf } from '../../utils/packSelection';

/** Every figure here (pieces, assortment, size curve, prices) is computed by the backend from the pack's live SKUs. */
function PackCard({ pack, inCart, onAdd, onRequest, onCustomise }) {
  const { isAuthenticated } = useApp();
  const c = pack.computed || {};
  const pieces = c.totalPieces ?? (pack.items || []).reduce((n, i) => n + (i.quantity || 0), 0);
  const flexible = isFlexiblePack(pack);
  const priced = isAuthenticated && !c.pricingHidden && c.packPrice != null;
  const ranged = flexible && isAuthenticated && !c.pricingHidden && c.packPrice == null && c.perPieceMin != null;

  return (
    <li className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden flex flex-col" data-testid="pack-card">
      <div className="relative">
        <BannerImage src={pack.image?.url} alt={pack.image?.alt || pack.name} width={480} height={320} icon="checkroom" className="w-full aspect-[3/2]" />
        {pack.badge && <span className="absolute top-3 left-3 px-2.5 py-1 rounded bg-accent text-primary text-[10px] font-bold uppercase tracking-widest shadow-sm">{pack.badge}</span>}
        {pack.isFeatured && <span className="absolute top-3 right-3 px-2 py-1 rounded bg-primary text-white text-[10px] font-bold uppercase tracking-widest shadow-sm">Featured</span>}
      </div>
      <div className="p-5 sm:p-6 flex flex-col gap-3 flex-1">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#6f7f10]">{flexible ? packSizeOf(pack) : pieces} pieces{flexible && ' · you choose'}</p>
          <h3 className="font-headline font-bold text-lg text-primary mt-0.5">{pack.name}</h3>
          {pack.description && <p className="text-xs text-muted mt-1 line-clamp-3">{pack.description}</p>}
        </div>

        {flexible && (
          <p className="text-xs text-on-surface" data-testid="pack-flex-note">Pick any {packSizeOf(pack)} pieces from {c.colors || (pack.items || []).length} colours and sizes{c.products?.length > 1 ? ` across ${c.products.length} styles` : ''}. You do not have to use every colour.</p>
        )}
        {c.assortment?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1">Assortment ratio</p>
            <ul className="text-xs text-on-surface grid grid-cols-1 gap-0.5">{c.assortment.map((a) => <li key={a.colorName} className="flex justify-between gap-3"><span className="truncate">{a.colorName}</span><span className="font-semibold">{a.quantity}</span></li>)}</ul>
          </div>
        )}
        {c.sizeCurve?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted mb-1">Size curve</p>
            <p className="text-xs text-on-surface font-medium">{c.sizeCurve.map((s) => `${s.size}(${s.quantity})`).join(', ')}</p>
          </div>
        )}

        <div className="border-t border-border-subtle pt-3" data-testid="pack-price">
          {!isAuthenticated || c.pricingHidden ? <p className="text-xs font-medium text-muted">Sign in to see wholesale pricing</p>
            : ranged ? <p className="font-headline font-bold text-xl text-primary">{c.perPieceMin === c.perPieceMax ? formatMoney(c.perPieceMin, 'PKR') : `${formatMoney(c.perPieceMin, 'PKR')} – ${formatMoney(c.perPieceMax, 'PKR')}`}<span className="text-xs font-medium text-muted"> / piece</span></p>
            : !priced ? <p className="text-xs font-medium text-error">Price unavailable</p>
            : (
              <>
                <p className="font-headline font-bold text-xl text-primary">{formatMoney(c.packPrice, 'PKR')}{pack.compareAtValue > c.packPrice && <span className="ml-2 text-xs font-medium text-muted line-through">{formatMoney(pack.compareAtValue, 'PKR')}</span>}</p>
                {c.perPiece != null && <p className="text-xs text-muted">{formatMoney(c.perPiece, 'PKR')} / piece wholesale</p>}
              </>
            )}
        </div>
        {(pack.dispatchText || pack.moq) && (
          <p className="text-[11px] text-muted flex flex-wrap gap-x-3">
            {pack.dispatchText && <span className="inline-flex items-center gap-1"><span className="material-symbols-outlined text-[14px]" aria-hidden="true">local_shipping</span>{pack.dispatchText}</span>}
            {pack.moq > 1 && <span>Min. {pack.moq} packs</span>}
          </p>
        )}

        <div className="mt-auto pt-2 flex flex-col gap-2">
          {flexible ? (
            <button type="button" onClick={() => onCustomise(pack)} data-testid="pack-customise" className="h-11 rounded-lg bg-primary text-white text-[11px] font-bold uppercase tracking-widest cursor-pointer hover:bg-primary-dark transition-colors">{inCart ? 'Change colours & sizes' : 'Choose colours & sizes'}</button>
          ) : (
            <>
              <button type="button" disabled={inCart} onClick={() => onAdd(pack)} className="h-11 rounded-lg bg-primary text-white text-[11px] font-bold uppercase tracking-widest cursor-pointer hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:cursor-default">{inCart ? 'Pack in wholesale cart' : 'Add pack to wholesale cart'}</button>
              <button type="button" onClick={() => onRequest(pack)} className="text-[11px] font-bold uppercase tracking-wider text-primary underline cursor-pointer self-center">Request this pack</button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ReadyPacks({ packs, loading, error, onRetry, onRequest, onCustomise }) {
  const { lines, addPack } = useWholesaleCartStore();
  const { showToast } = useApp();
  const add = (pack) => { addPack(pack); showToast(`${pack.name} added to wholesale cart`); };
  if (loading) return <LoadingBlock label="Loading packs…" className="py-10" />;
  if (error) return <ErrorBlock error={error} onRetry={onRetry} className="py-10" />;
  if (!packs.length) return <p className="text-sm text-muted">No ready packs are available right now. You can still build your own order below.</p>;
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6">
      {packs.map((pk) => (
        <PackCard key={pk._id || pk.id || pk.slug} pack={pk} inCart={lines.some((l) => l.id === `p-${pk._id || pk.id}`)} onAdd={add} onRequest={onRequest} onCustomise={onCustomise} />
      ))}
    </ul>
  );
}
