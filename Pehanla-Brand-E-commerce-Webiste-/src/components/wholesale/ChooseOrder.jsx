import React from 'react';

const Check = ({ children, filled }) => (
  <li className="flex items-start gap-2.5 text-xs text-muted">
    <span className={`material-symbols-outlined text-[18px] shrink-0 ${filled ? 'text-[#7d8f12]' : 'text-primary'}`} aria-hidden="true">{filled ? 'verified' : 'check_circle'}</span>
    <span>{children}</span>
  </li>
);

/** Two clearly separate paths: Ready Packs (convenience bundles) vs Build Your Own (configurable). */
export default function ChooseOrder({ packsAvailable }) {
  return (
    <section aria-labelledby="choose-h" className="w-full px-4 sm:px-8 lg:px-12 py-14 bg-surface border-t border-border-subtle">
      <div className="max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="text-[11px] uppercase tracking-widest font-bold text-[#6f7f10]">Ordering methodology</span>
          <h2 id="choose-h" className="font-headline font-extrabold text-primary text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] mt-1">Choose How You Want to Order</h2>
          <p className="text-sm text-muted mt-2">Start with a curated bulk bundle for instant restocking, or configure an exact breakdown tailor-made for your customer demand.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <article className="bg-white rounded-2xl border border-border-subtle shadow-sm p-6 sm:p-7 flex flex-col gap-4" data-testid="path-packs">
            <div className="flex items-start justify-between gap-3">
              <span className="px-2.5 py-1 bg-surface-container text-on-surface text-[10px] font-bold uppercase tracking-widest rounded">Rapid turnaround</span>
              <span className="material-symbols-outlined text-primary" aria-hidden="true">inventory_2</span>
            </div>
            <h3 className="font-headline font-bold text-xl text-primary">Ready Wholesale Packs</h3>
            <p className="text-sm text-muted">Pre-curated size ratios and high-velocity colorways for immediate storefront shelves. Best for quick reorders without manual SKU allocation.</p>
            <ul className="flex flex-col gap-2.5"><Check filled>Pre-selected optimal ratios across sizes and colours</Check><Check filled>Fixed pack pricing managed by our team</Check><Check filled>One tap to add the whole pack to your wholesale cart</Check></ul>
            <a href="#ready-packs-section" aria-disabled={!packsAvailable} className="mt-auto h-12 rounded-lg bg-surface-container text-on-surface text-xs font-bold uppercase tracking-widest inline-flex items-center justify-center gap-2 hover:bg-surface-container-high transition-colors">View ready packs <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_downward</span></a>
          </article>

          <article className="bg-white rounded-2xl border border-border-subtle shadow-md p-6 sm:p-7 flex flex-col gap-4 relative overflow-hidden" data-testid="path-builder">
            <span className="absolute inset-x-0 top-0 h-1.5 bg-accent" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <span className="px-2.5 py-1 bg-accent text-primary text-[10px] font-bold uppercase tracking-widest rounded">Recommended for custom inventory</span>
              <span className="material-symbols-outlined text-primary" aria-hidden="true">tune</span>
            </div>
            <h3 className="font-headline font-bold text-xl text-primary">Build Your Own Order</h3>
            <p className="text-sm text-muted">Pick the exact garments, assign precise quantities, choose colorways and distribute sizes to match your regional demographic.</p>
            <ul className="flex flex-col gap-2.5"><Check>Mix different silhouettes and fabric weights</Check><Check>Live quantity counter with tier price breakdowns</Check><Check>Granular size-by-colour allocation tool</Check></ul>
            <a href="#builder-section" className="mt-auto h-12 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-widest inline-flex items-center justify-center gap-2 hover:bg-primary-dark transition-colors">Start building now <span className="material-symbols-outlined text-base" aria-hidden="true">tune</span></a>
          </article>
        </div>
      </div>
    </section>
  );
}
