import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useBannersQuery, useCategoriesQuery, useFreeShippingInfoQuery, useProductsQuery, usePublicSettingsQuery, useWholesalePacksQuery } from '../hooks/useQueries';
import { contentApi } from '../services/catalogApi';
import { HERO_FALLBACK_IMAGE, RETAIL_LOOKBOOK_IMAGE } from '../config/brandImages';
import Seo from '../seo/Seo';
import { organizationSchema, websiteSchema } from '../seo/schema';
import { useCurrency } from '../store/useCurrencyStore';
import { formatMoney, priceRange } from '../utils/currency';

/** Banner CTA: internal paths use the router, anything else is a normal (safe) link. */
function CtaLink({ cta, className, onClick }) {
  if (!cta?.label || !cta?.target) return null;
  const internal = cta.target.startsWith('/');
  return internal ? (
    <Link to={cta.target} onClick={onClick} className={className}>{cta.label}</Link>
  ) : (
    <a href={cta.target} onClick={onClick} rel="noopener noreferrer" className={className}>{cta.label}</a>
  );
}

const btnPrimary = 'h-12 px-8 bg-primary text-white text-xs font-semibold uppercase tracking-widest flex items-center justify-center rounded-lg hover:bg-primary-dark shadow-md transition-colors';
const btnSecondary = 'h-12 px-8 bg-white/95 text-primary border-2 border-primary text-xs font-semibold uppercase tracking-widest flex items-center justify-center rounded-lg hover:bg-white transition-colors';

function Hero() {
  const { data: banners } = useBannersQuery('home_hero', 5);
  const [current, setCurrent] = useState(0);
  const seen = useRef(new Set());
  const slides = useMemo(() => (banners?.length
    ? banners.map((b) => ({ ...b, id: b.id || b._id }))
    : [{ id: 'default', title: 'Wear Your Identity.', subtitle: 'Everyday essentials, heavyweight streetwear and statement pieces made in Pakistan.', image: { url: HERO_FALLBACK_IMAGE, alt: 'PEHANLY collection' }, cta: { label: 'Shop Retail', target: '/shop' }, fallback: true }]), [banners]);

  useEffect(() => {
    if (slides.length < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setCurrent((c) => (c + 1) % slides.length), 7000);
    return () => clearInterval(t);
  }, [slides.length]);

  // Record one impression per banner per page view.
  useEffect(() => {
    const s = slides[current];
    if (s && !s.fallback && s.id && !seen.current.has(s.id)) {
      seen.current.add(s.id);
      contentApi.bannerImpression(s.id);
    }
  }, [current, slides]);

  return (
    <section aria-roledescription="carousel" aria-label="Featured" className="w-full max-w-7xl mx-auto px-4 sm:px-8 pt-2 pb-10">
      <div className="relative w-full bg-surface-container rounded-2xl overflow-hidden min-h-[520px] lg:min-h-[640px] border border-border-subtle shadow-sm flex items-end">
        {slides.map((slide, i) => {
          const on = i === current;
          return (
            <div key={slide.id || i} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`} aria-hidden={!on} inert={!on ? '' : undefined}
              className={`absolute inset-0 z-10 flex items-end p-8 sm:p-12 lg:p-16 transition-opacity duration-700 ${on ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <div className="absolute inset-0 z-0">
                <picture>
                  {slide.mobileImage?.url && <source media="(max-width: 640px)" srcSet={slide.mobileImage.url} />}
                  <img className="w-full h-full object-cover object-center" alt={slide.image?.alt || ''} src={slide.image?.url} width="1280" height="640" referrerPolicy="no-referrer"
                    {...(i === 0 ? { fetchPriority: 'high' } : { loading: 'lazy' })} />
                </picture>
                <div className="absolute inset-0 bg-linear-to-t from-primary/95 via-primary/50 to-black/20" />
              </div>
              <div className="relative z-10 max-w-2xl flex flex-col gap-4 text-white">
                <h2 className="font-headline font-extrabold text-4xl sm:text-5xl lg:text-6xl leading-[1.08] tracking-tight">{slide.title}</h2>
                {slide.subtitle && <p className="font-body text-base lg:text-lg text-surface-container-high max-w-xl leading-relaxed">{slide.subtitle}</p>}
                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <CtaLink cta={slide.cta} className={btnPrimary} onClick={() => !slide.fallback && slide.id && contentApi.bannerClick(slide.id)} />
                  {slide.fallback && <Link to="/shop?sort=newest" className={btnSecondary}>New Arrivals</Link>}
                </div>
              </div>
            </div>
          );
        })}
        {slides.length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-black/40 border border-white/10">
            {slides.map((s, idx) => (
              <button key={s.id || idx} type="button" onClick={() => setCurrent(idx)} aria-label={`Go to slide ${idx + 1}`} aria-current={current === idx}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${current === idx ? 'w-6 bg-accent' : 'w-2 bg-white/40 hover:bg-white/70'}`} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TrustStrip() {
  const { data: settings } = usePublicSettingsQuery();
  const { currency } = useCurrency();
  const { data: ship } = useFreeShippingInfoQuery(currency);
  const { isAuthenticated } = useApp();
  const items = [
    ship?.available && { icon: 'local_shipping', text: `Free shipping over ${formatMoney(ship.minimumOrderAmount, currency)}` },
    settings?.checkout?.codEnabled && (settings?.currencies?.paymentMethods?.[currency] ?? (currency === 'PKR' ? ['cod'] : [])).includes('cod') && { icon: 'payments', text: 'Cash on Delivery' },
    settings?.returns?.enabled && { icon: 'published_with_changes', text: `${settings.returns.windowDays}-day returns` },
    isAuthenticated && { icon: 'sell', text: 'Member coupons at checkout' },
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <section aria-label="Shopping benefits" className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-3 mb-8">
      <ul className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-around gap-5">
        {items.map((it) => (
          <li key={it.text} className="flex items-center gap-2.5 text-xs font-semibold text-on-surface">
            <span className="material-symbols-outlined text-primary text-[20px]" aria-hidden="true">{it.icon}</span>{it.text}
          </li>
        ))}
      </ul>
      {!isAuthenticated && (
        <p className="text-center text-xs text-muted mt-3">
          <Link to="/account" className="font-bold text-primary underline">Create an account</Link> to unlock member offers and track your orders.
        </p>
      )}
    </section>
  );
}

function Journey() {
  const card = 'relative bg-white border border-border-subtle rounded-2xl p-8 lg:p-10 shadow-sm hover:shadow-md transition-all flex flex-col justify-between';
  return (
    <section aria-labelledby="journey-h" className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-10">
      <div className="flex flex-col gap-2 pb-8 text-center max-w-3xl mx-auto">
        <span className="text-xs uppercase tracking-widest font-bold text-primary">PEHANLY Ecosystem</span>
        <h2 id="journey-h" className="font-headline font-bold text-3xl lg:text-4xl text-on-surface">How Would You Like to Work With PEHANLY?</h2>
        <p className="text-sm text-muted leading-relaxed">Shop for your wardrobe, source stock for your store, or build your own label - choose your path.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className={card}>
          <div>
            <span className="px-3 py-1 bg-surface-container text-primary font-headline text-[11px] font-bold uppercase tracking-wider rounded-md">B2B Bulk Supply</span>
            <h3 className="font-headline font-bold text-2xl lg:text-3xl text-primary mt-4">Wholesale Solutions</h3>
            <p className="text-sm text-muted mt-2 leading-relaxed">Stock your boutique, online store or campus shop. Choose a ready pack or build your own order and request a quote.</p>
          </div>
          <Link to="/wholesale" className="mt-8 inline-flex items-center justify-center gap-2 w-full h-12 bg-primary text-white text-xs font-semibold uppercase tracking-widest rounded-lg hover:bg-primary-dark transition-colors">
            <span>Explore Wholesale</span><span className="material-symbols-outlined text-sm" aria-hidden="true">arrow_forward</span>
          </Link>
        </div>
        <div className={card}>
          <div>
            <span className="px-3 py-1 bg-accent/20 text-primary font-headline text-[11px] font-bold uppercase tracking-wider rounded-md">Custom Production</span>
            <h3 className="font-headline font-bold text-2xl lg:text-3xl text-primary mt-4">Custom Manufacturing &amp; Printing</h3>
            <p className="text-sm text-muted mt-2 leading-relaxed">Private-label garments made to your specification, plus printing and branding services for your designs.</p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Link to="/custom-manufacturing" className="inline-flex items-center justify-center h-12 bg-primary text-white text-xs font-semibold uppercase tracking-widest rounded-lg hover:bg-primary-dark transition-colors">Manufacturing</Link>
            <Link to="/printing-branding" className="inline-flex items-center justify-center h-12 border-2 border-primary text-primary text-xs font-semibold uppercase tracking-widest rounded-lg hover:bg-surface-container transition-colors">Printing</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function RetailEntry() {
  const { data: promos } = useBannersQuery('retail_promo', 1);
  const promo = promos?.[0] && { ...promos[0], id: promos[0].id || promos[0]._id };
  return (
    <section aria-labelledby="retail-h" className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-10">
      <div className="bg-surface-container border border-border-subtle rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 shadow-sm">
        <div className="lg:col-span-7 p-8 lg:p-14 flex flex-col justify-center gap-4">
          <span className="text-xs uppercase tracking-widest font-bold text-primary">Shop PEHANLY</span>
          <h2 id="retail-h" className="font-headline font-bold text-3xl lg:text-4xl text-primary leading-tight">{promo?.title || 'Shop Retail'}</h2>
          <p className="text-sm lg:text-base text-muted max-w-xl">{promo?.subtitle || 'Premium everyday essentials, streetwear and pret, crafted to endure frequent wear.'}</p>
          <div className="flex items-center gap-4 pt-3">
            <Link to="/shop" className={btnPrimary}>Shop All Products</Link>
            {promo?.cta && <CtaLink cta={promo.cta} onClick={() => contentApi.bannerClick(promo.id)} className="text-xs font-semibold uppercase tracking-wider text-primary underline underline-offset-4" />}
          </div>
        </div>
        <div className="lg:col-span-5 relative min-h-[260px] lg:min-h-[360px] bg-surface-container-low overflow-hidden">
          <img alt={promo?.image?.alt || 'PEHANLY retail collection'} className="w-full h-full object-cover" src={promo?.image?.url || RETAIL_LOOKBOOK_IMAGE} width="640" height="480" loading="lazy" referrerPolicy="no-referrer" />
        </div>
      </div>
    </section>
  );
}

function Categories() {
  const { data: categories } = useCategoriesQuery();
  if (!categories?.length) return null;
  return (
    <section aria-labelledby="cat-h" className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-12 border-t border-border-subtle">
      <div className="flex items-end justify-between mb-8">
        <h2 id="cat-h" className="font-headline font-bold text-2xl lg:text-3xl text-on-surface">Shop By Category</h2>
        <Link to="/shop" className="text-xs font-bold uppercase tracking-wider text-primary underline">View all</Link>
      </div>
      <ul className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {categories.map((c) => (
          <li key={c.id || c.slug}>
            <Link to={`/shop/${c.slug}`} className="group block text-center">
              <div className="aspect-square rounded-xl bg-surface-container overflow-hidden border border-border-subtle">
                {c.image?.url ? (
                  <img src={c.image.url} alt="" width="240" height="240" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted"><span className="material-symbols-outlined text-4xl" aria-hidden="true">checkroom</span></div>
                )}
              </div>
              <h3 className="mt-2 font-headline text-xs font-bold uppercase tracking-wider text-on-surface group-hover:text-primary transition-colors">{c.name}</h3>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewArrivals() {
  const { currency } = useCurrency();
  const { data } = useProductsQuery({ sort: 'newest', limit: 4 });
  const items = data?.items || [];
  if (!items.length) return null;
  return (
    <section aria-labelledby="new-h" className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-12 border-t border-border-subtle">
      <div className="flex items-end justify-between mb-8">
        <h2 id="new-h" className="font-headline font-bold text-2xl lg:text-3xl text-on-surface">New Arrivals</h2>
        <Link to="/shop" className="text-xs font-bold uppercase tracking-wider text-primary underline">Shop all</Link>
      </div>
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {items.map((p) => {
          return (
            <li key={p.id}>
              <Link to={`/product/${p.slug}`} className="group block bg-white rounded-xl border border-border-subtle overflow-hidden hover:shadow-lg transition-shadow">
                <div className="relative aspect-3/4 bg-surface-container overflow-hidden">
                  {p.image?.url && <img src={p.image.url} alt={p.image.alt || p.name} width="400" height="533" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                  {p.isNewArrival && <span className="absolute top-3 left-3 bg-accent text-primary text-[10px] font-bold px-2.5 py-1 rounded-full">New</span>}
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-on-surface truncate group-hover:text-primary transition-colors">{p.name}</h3>
                  {priceRange(p, currency).min != null && <span className="text-sm font-bold text-primary">{formatMoney(priceRange(p, currency).min, currency)}</span>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WholesaleSection() {
  const { data: packs } = useWholesalePacksQuery();
  const { data: promos } = useBannersQuery('wholesale_promo', 1);
  const promo = promos?.[0];
  const list = (packs?.items || []).slice(0, 3);
  return (
    <section aria-labelledby="ws-h" className="w-full bg-surface-container py-16 border-y border-border-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col gap-10">
        <div className="max-w-2xl">
          <span className="text-xs uppercase tracking-widest font-bold text-primary">B2B Wholesale</span>
          <h2 id="ws-h" className="font-headline font-extrabold text-3xl lg:text-4xl text-primary mt-2">{promo?.title || 'Built For Your Business.'}</h2>
          <p className="text-sm text-muted mt-3">{promo?.subtitle || 'Ready-made packs for quick restocking, or build a custom bulk order and request a quote.'}</p>
          <Link to="/wholesale" className={`${btnPrimary} mt-5 w-fit`}>Explore Wholesale</Link>
        </div>
        {list.length > 0 && (
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {list.map((pk) => (
              <li key={pk.id || pk._id || pk.slug} className="bg-white rounded-2xl border border-border-subtle overflow-hidden flex flex-col">
                {pk.image?.url && <img src={pk.image.url} alt={pk.image.alt || pk.name} width="480" height="320" loading="lazy" referrerPolicy="no-referrer" className="w-full h-48 object-cover" />}
                <div className="p-6 flex flex-col gap-2 flex-1">
                  <h3 className="font-headline font-bold text-lg text-primary">{pk.name}</h3>
                  {pk.description && <p className="text-xs text-muted line-clamp-3">{pk.description}</p>}
                  <Link to="/wholesale" className="mt-auto pt-3 text-xs font-bold uppercase tracking-wider text-primary underline">View pack</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const PROCESS = ['Tech Pack Review', 'Fabric & Dyeing', 'Prototype Sampling', 'Batch Production', 'Quality Check & Pack'];

function ManufacturingSection() {
  const { data: promos } = useBannersQuery('manufacturing_promo', 1);
  const promo = promos?.[0];
  return (
    <section aria-labelledby="mf-h" className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-16">
      <div className="max-w-2xl mb-10">
        <span className="text-xs uppercase tracking-widest font-bold text-primary">Custom Atelier</span>
        <h2 id="mf-h" className="font-headline font-extrabold text-3xl lg:text-4xl text-on-surface mt-2">{promo?.title || 'From Your Idea To Production.'}</h2>
        <p className="text-sm text-muted mt-3">{promo?.subtitle || 'Private-label garment manufacturing, from tech pack to finished, packed goods.'}</p>
      </div>
      <ol className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {PROCESS.map((s, i) => (
          <li key={s} className="bg-white border border-border-subtle rounded-xl p-4">
            <span className="font-headline text-xs font-bold text-accent">0{i + 1}</span>
            <h3 className="font-headline text-sm font-bold text-primary mt-1">{s}</h3>
          </li>
        ))}
      </ol>
      <div className="flex gap-4 mt-8">
        <Link to="/custom-manufacturing" className={btnPrimary}>Start Manufacturing</Link>
        <Link to="/printing-branding" className="h-12 px-8 border-2 border-primary text-primary text-xs font-semibold uppercase tracking-widest flex items-center rounded-lg hover:bg-surface-container transition-colors">Printing &amp; Branding</Link>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="w-full flex flex-col">
      <Seo
        title="PEHAN LY - Premium Pakistani Apparel: Retail, Wholesale & Custom Manufacturing"
        titleIsFull
        description="Shop premium everyday essentials, or source wholesale and custom-manufactured apparel from PEHAN LY, Pakistan."
        path="/"
        jsonLd={[organizationSchema(), websiteSchema()]}
      />
      <h1 className="sr-only">PEHAN LY - premium apparel for retail, wholesale and custom manufacturing</h1>
      <Hero />
      <TrustStrip />
      <Journey />
      <RetailEntry />
      <Categories />
      <NewArrivals />
      <WholesaleSection />
      <ManufacturingSection />
    </div>
  );
}
