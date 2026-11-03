import React from 'react';
import BannerImage from '../BannerImage';

const FEATURES = [
  { icon: 'inventory', title: 'Flexible Bulk Quantities', text: 'Low minimum order quantities designed for growing boutiques and established retailers alike.', tag: 'Minimal deadstock risk' },
  { icon: 'shuffle', title: 'Mix & Match Freely', text: 'Combine hoodies, tees and more in one consolidated order while meeting each product minimum.', tag: 'Unified freight packing' },
  { icon: 'percent', title: 'Automatic Tiered Pricing', text: 'Real-time price breaks applied instantly as your order quantity adjusts.', tag: 'Instant line discounts' },
  { icon: 'support_agent', title: 'Dedicated B2B Desk', text: 'Direct quote handling and invoicing support from our wholesale team.', tag: 'Account manager on call' },
];
const POINTS = ['Mix products & collections', 'Choose custom sizes & colors', 'Manual direct quantity input', 'Automatic MOQ & tier discounts'];

export default function WholesaleHero({ banner, metrics }) {
  return (
    <>
      <section aria-labelledby="wh-h" className="w-full px-4 sm:px-8 lg:px-12 pt-8 pb-12 lg:pt-12 lg:pb-16 bg-surface">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-8 lg:gap-12 items-center">
          <div className="min-w-0 flex flex-col gap-5">
            <span className="w-fit px-3 py-1 rounded-full bg-surface-container text-primary text-[11px] font-bold uppercase tracking-widest">PEHANLY Wholesale · B2B apparel supply</span>
            <h1 id="wh-h" className="font-headline font-extrabold text-primary leading-[1.05] text-[clamp(2.25rem,1.6rem+3vw,4rem)]">
              Wholesale Made <span className="relative inline-block text-[#7d8f12]">Flexible.<span className="absolute left-0 right-0 -bottom-1 h-1 bg-accent rounded-full" aria-hidden="true" /></span>
            </h1>
            <p className="text-base text-muted max-w-xl leading-relaxed">
              Stock your store your way. Choose ready-made wholesale packs for rapid dispatch, or build a custom bulk order from our active apparel catalog with tiered volume pricing and flexible variant breakdowns.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <a href="#builder-section" className="h-12 px-7 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-lg inline-flex items-center gap-2 hover:bg-primary-dark transition-colors">Build your own order <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_downward</span></a>
              <a href="#ready-packs-section" className="h-12 px-7 bg-white border border-border-subtle text-primary text-xs font-bold uppercase tracking-widest rounded-lg inline-flex items-center gap-2 hover:bg-surface-container transition-colors">Explore ready packs <span className="material-symbols-outlined text-base" aria-hidden="true">inventory_2</span></a>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-2 text-xs font-semibold text-on-surface">
              {POINTS.map((p) => <li key={p} className="flex items-center gap-2"><span className="material-symbols-outlined text-[#7d8f12] text-[18px]" aria-hidden="true">check_circle</span>{p}</li>)}
            </ul>
          </div>

          <figure className="relative min-w-0 m-0" data-testid="wholesale-hero-visual">
            <BannerImage src={banner?.image?.url} alt={banner?.image?.alt || banner?.title || 'PEHANLY wholesale production floor'} priority className="w-full aspect-[4/3] lg:aspect-[5/4] max-h-[460px] rounded-2xl shadow-lg" />
            {metrics.length > 0 && (
              <dl className="absolute top-3 right-3 flex flex-wrap justify-end gap-2 m-0">
                {metrics.map((m) => <div key={m.label} className="px-3 py-1.5 rounded-lg bg-primary text-white shadow flex items-baseline gap-1.5"><dd className="font-headline font-bold text-sm text-accent m-0">{m.value}</dd><dt className="text-[10px] uppercase tracking-widest">{m.label}</dt></div>)}
              </dl>
            )}
            {(banner?.title || banner?.subtitle) && (
              <figcaption className="absolute left-3 right-3 bottom-3 sm:right-auto sm:max-w-xs bg-white/95 backdrop-blur rounded-xl p-3 shadow">
                {banner.title && <p className="font-headline font-bold text-sm text-primary m-0">{banner.title}</p>}
                {banner.subtitle && <p className="text-xs text-muted m-0 mt-0.5 line-clamp-2">{banner.subtitle}</p>}
              </figcaption>
            )}
          </figure>
        </div>
      </section>

      <section aria-label="Wholesale advantages" className="w-full px-4 sm:px-8 lg:px-12 pb-12 bg-surface">
        <ul className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="bg-white border border-border-subtle rounded-xl p-5 flex flex-col gap-2 shadow-sm">
              <span className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center"><span className="material-symbols-outlined text-primary text-[20px]" aria-hidden="true">{f.icon}</span></span>
              <h3 className="font-headline font-bold text-sm text-primary mt-1">{f.title}</h3>
              <p className="text-xs text-muted leading-relaxed">{f.text}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary mt-auto pt-2">{f.tag}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
