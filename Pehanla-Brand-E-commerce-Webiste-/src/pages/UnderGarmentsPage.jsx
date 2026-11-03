import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFacetsQuery, useProductsQuery, useSectionQuery } from '../hooks/useQueries';
import ProductCard from '../components/ProductCard';
import Seo from '../seo/Seo';
import { breadcrumbSchema, itemListSchema } from '../seo/schema';
import { ErrorBlock, EmptyBlock } from '../components/StateViews';
import { useCurrency } from '../store/useCurrencyStore';
import { formatMoney } from '../utils/currency';
import { UNDER_GARMENTS_SLUG } from '../config/sections';

const PAGE_SIZE = 24;
const SORTS = [
  { value: 'newest', label: 'Newest Arrivals' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name', label: 'Name: A to Z' },
];
const summaryClass = 'flex items-center justify-between p-4 cursor-pointer list-none select-none hover:bg-surface transition-colors font-bold text-primary uppercase text-[11px] tracking-wider';

/**
 * Dedicated Under Garments page. Everything dynamic comes from the backend: the section and its active sub-categories,
 * the products, and which filters have data. Products are requested with `section=true`, the only way to read them
 * (the general Shop catalog never returns them).
 */
export default function UnderGarmentsPage() {
  const [params, setParams] = useSearchParams();
  const { currency } = useCurrency();
  const money = (n) => formatMoney(n, currency);
  const usd = currency === 'USD' ? 'USD' : undefined;

  const subSlug = params.get('sub') || '';
  const size = params.get('size') || '';
  const color = params.get('color') || '';
  const minPrice = params.get('min') || '';
  const maxPrice = params.get('max') || '';
  const inStock = params.get('stock') === '1';
  const q = (params.get('q') || '').trim();
  const sort = SORTS.some((o) => o.value === params.get('sort')) ? params.get('sort') : 'newest';
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);

  const section = useSectionQuery(UNDER_GARMENTS_SLUG);
  const root = section.data?.find((c) => c.slug === UNDER_GARMENTS_SLUG);
  const subs = useMemo(() => (section.data || []).filter((c) => root && c.parentId === root.id), [section.data, root]);
  const activeSub = subs.find((c) => c.slug === subSlug);
  const scopeSlug = activeSub ? activeSub.slug : UNDER_GARMENTS_SLUG;

  const rootFacets = useFacetsQuery({ category: UNDER_GARMENTS_SLUG, section: true, currency: usd }, { enabled: Boolean(root) });
  const facets = useFacetsQuery({ category: scopeSlug, section: true, currency: usd }, { enabled: Boolean(root) });
  const f = facets.data;

  const products = useProductsQuery(
    { category: scopeSlug, section: true, search: q || undefined, size: size || undefined, color: color || undefined, minPrice: minPrice || undefined, maxPrice: maxPrice || undefined, inStock: inStock ? true : undefined, sort, page, limit: PAGE_SIZE, currency: usd },
    { enabled: Boolean(root) },
  );
  const items = products.data?.items || [];
  const meta = products.data?.meta;

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };
  const refinements = [size, color, minPrice || maxPrice, inStock].filter(Boolean).length;
  const clearRefinements = () => { const next = new URLSearchParams(params); ['size', 'color', 'min', 'max', 'stock', 'page'].forEach((k) => next.delete(k)); setParams(next); };

  // Price inputs apply on "Apply"/Enter so the list does not refetch on every keystroke.
  const [lo, setLo] = useState(minPrice);
  const [hi, setHi] = useState(maxPrice);
  useEffect(() => { setLo(minPrice); setHi(maxPrice); }, [minPrice, maxPrice]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const missing = !section.isLoading && !section.isError && !root;
  const title = activeSub ? `${activeSub.name} · Under Garments` : 'Under Garments';
  const crumbs = [{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }, { name: 'Under Garments', path: '/under-garments' }, ...(activeSub ? [{ name: activeSub.name, path: `/under-garments?sub=${activeSub.slug}` }] : [])];
  const hasPriceRange = f?.priceMin != null && f?.priceMax != null && f.priceMax > f.priceMin;
  const showAvailability = f && f.total > 0 && f.inStockCount < f.total;
  const hasFilters = f && f.total > 0 && ((f.sizes?.length || 0) > 0 || (f.colors?.length || 0) > 0 || hasPriceRange || showAvailability);

  return (
    <div className="w-full flex flex-col bg-surface" data-testid="under-garments-page">
      <Seo
        title={missing ? 'Under Garments' : title}
        description={root?.description || 'Underwear and socks for men, women and kids from PEHAN LY.'}
        path="/under-garments"
        image={root?.image?.url}
        noindex={missing || Boolean(q || size || color || minPrice || maxPrice || inStock || sort !== 'newest' || activeSub)}
        jsonLd={items.length ? [breadcrumbSchema(crumbs), itemListSchema(items, '/under-garments')] : breadcrumbSchema(crumbs)}
      />

      <section className="w-full bg-surface-container py-2.5 border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-wrap items-center justify-between gap-2 text-xs">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-muted">
            <Link to="/" className="hover:text-primary">Home</Link>
            <span className="material-symbols-outlined text-[12px]" aria-hidden="true">chevron_right</span>
            <Link to="/shop" className="hover:text-primary">Shop</Link>
            <span className="material-symbols-outlined text-[12px]" aria-hidden="true">chevron_right</span>
            {activeSub ? <Link to="/under-garments" className="hover:text-primary">Under Garments</Link> : <span className="text-primary font-bold" aria-current="page">Under Garments</span>}
            {activeSub && (<><span className="material-symbols-outlined text-[12px]" aria-hidden="true">chevron_right</span><span className="text-primary font-bold" aria-current="page">{activeSub.name}</span></>)}
          </nav>
          {meta && <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent text-primary text-[10px] font-bold">{meta.total} {meta.total === 1 ? 'Product' : 'Products'}</span>}
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-8 pb-10 w-full">
        {section.isError ? (
          <ErrorBlock error={section.error} onRetry={section.refetch} title="We couldn't load Under Garments" />
        ) : section.isLoading ? (
          <div className="py-24 animate-pulse space-y-4" aria-busy="true" aria-label="Loading Under Garments"><div className="h-8 w-56 bg-surface-container rounded" /><div className="h-4 w-96 max-w-full bg-surface-container rounded" /></div>
        ) : missing ? (
          <EmptyBlock icon="inventory_2" title="Under Garments isn't available right now" text="This section is not published at the moment. Browse the rest of the shop in the meantime." action={<Link to="/shop" className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">Browse the shop</Link>} />
        ) : (
          <>
            <header className="mb-6">
              <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-primary uppercase tracking-tight">{activeSub ? activeSub.name : root.name}</h1>
              {activeSub && <p className="text-xs uppercase tracking-widest text-muted font-bold mt-0.5">Under Garments</p>}
              {(activeSub?.description || root.description) && <p className="text-sm text-muted mt-2 max-w-2xl">{activeSub?.description || root.description}</p>}
            </header>

            {/* Sub-category navigation: admin-managed, only ACTIVE ones arrive from the backend */}
            {subs.length > 0 && (
              <nav aria-label="Under Garments categories" data-testid="sub-nav" className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-6">
                {[{ id: 'all', slug: '', name: 'All Under Garments', count: rootFacets.data?.total }, ...subs.map((s) => ({ ...s, count: rootFacets.data?.subcategories?.find((x) => x.slug === s.slug)?.count }))].map((s) => {
                  const on = (s.slug || '') === (activeSub?.slug || '');
                  return (
                    <button key={s.id} type="button" aria-pressed={on} data-testid={`sub-${s.slug || 'all'}`} onClick={() => update({ sub: s.slug })}
                      className={`shrink-0 px-4 h-10 rounded-full text-xs font-bold uppercase tracking-wider border transition-colors cursor-pointer ${on ? 'bg-primary text-white border-primary' : 'bg-surface-card text-primary border-border-subtle hover:border-primary'}`}>
                      {s.name}{s.count != null && <span className={`ml-1.5 ${on ? 'text-accent' : 'text-muted'}`}>({s.count})</span>}
                    </button>
                  );
                })}
              </nav>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <aside aria-label="Filters" className="lg:col-span-3 flex flex-col gap-3">
                <button type="button" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} aria-controls="ug-filters" className="lg:hidden flex items-center justify-between h-11 px-4 rounded-xl bg-surface-card border border-border-subtle text-xs font-bold uppercase tracking-wider text-primary cursor-pointer">
                  <span className="inline-flex items-center gap-2"><span className="material-symbols-outlined text-lg" aria-hidden="true">tune</span>Filters{refinements > 0 ? ` (${refinements})` : ''}</span>
                  <span className="material-symbols-outlined" aria-hidden="true">{filtersOpen ? 'expand_less' : 'expand_more'}</span>
                </button>
                <div id="ug-filters" className={`${filtersOpen ? 'flex' : 'hidden'} lg:flex flex-col gap-3 text-xs`}>
                  <form role="search" onSubmit={(e) => { e.preventDefault(); update({ q: new FormData(e.currentTarget).get('q')?.toString().trim() || '' }); }} className="relative">
                    <label htmlFor="ug-search" className="sr-only">Search Under Garments</label>
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted text-lg pointer-events-none" aria-hidden="true">search</span>
                    <input id="ug-search" name="q" key={q} type="search" defaultValue={q} maxLength={120} placeholder="Search under garments…" className="w-full h-11 pl-10 pr-3 rounded-xl bg-surface-card border border-border-subtle text-sm focus:outline-none focus:border-primary" />
                  </form>

                  {hasFilters && (
                    <div className="bg-surface-card p-3 rounded-xl border border-border-subtle flex items-center justify-between">
                      <span className="font-headline text-xs font-bold uppercase text-primary">Refine</span>
                      <button type="button" onClick={clearRefinements} disabled={!refinements} className="text-[10px] uppercase font-bold tracking-wider text-muted hover:text-primary cursor-pointer disabled:opacity-40 disabled:cursor-default">Reset ({refinements})</button>
                    </div>
                  )}

                  {f?.sizes?.length > 0 && (
                    <details className="group bg-surface-card rounded-xl border border-border-subtle overflow-hidden" open data-testid="filter-size">
                      <summary className={summaryClass}><span>Size</span><span className="material-symbols-outlined text-muted group-open:rotate-180 transition-transform" aria-hidden="true">expand_more</span></summary>
                      <div className="px-4 pb-4 flex flex-wrap gap-2">
                        {f.sizes.map((z) => (
                          <button key={z} type="button" aria-pressed={size === z} onClick={() => update({ size: size === z ? '' : z })} className={`min-w-10 h-9 px-3 rounded-lg border text-xs font-bold cursor-pointer ${size === z ? 'bg-primary text-white border-primary' : 'bg-surface text-primary border-border-subtle hover:border-primary'}`}>{z}</button>
                        ))}
                      </div>
                    </details>
                  )}

                  {f?.colors?.length > 0 && (
                    <details className="group bg-surface-card rounded-xl border border-border-subtle overflow-hidden" open data-testid="filter-color">
                      <summary className={summaryClass}><span>Color</span><span className="material-symbols-outlined text-muted group-open:rotate-180 transition-transform" aria-hidden="true">expand_more</span></summary>
                      <div className="px-4 pb-4">
                        <div className="flex flex-wrap gap-2">
                          {f.colors.map((c) => (
                            <button key={c.name} type="button" aria-pressed={color === c.name} aria-label={c.name} title={c.name} onClick={() => update({ color: color === c.name ? '' : c.name })}
                              className={`w-8 h-8 rounded-full border border-border-subtle cursor-pointer hover:scale-110 transition-transform ${color === c.name ? 'ring-2 ring-primary ring-offset-2' : ''}`} style={{ backgroundColor: c.hexCode || '#ccc' }} />
                          ))}
                        </div>
                        <p className="mt-2 text-center text-[11px] text-primary font-bold" aria-live="polite">{color || 'All colors'}</p>
                      </div>
                    </details>
                  )}

                  {hasPriceRange && (
                    <details className="group bg-surface-card rounded-xl border border-border-subtle overflow-hidden" open data-testid="filter-price">
                      <summary className={summaryClass}><span>Price ({currency})</span><span className="material-symbols-outlined text-muted group-open:rotate-180 transition-transform" aria-hidden="true">expand_more</span></summary>
                      <form className="px-4 pb-4 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); update({ min: lo, max: hi }); }}>
                        <div className="flex items-end gap-2">
                          <div className="w-full"><label htmlFor="ug-min" className="block text-[9px] uppercase text-muted font-bold mb-1">Min</label><input id="ug-min" inputMode="numeric" value={lo} onChange={(e) => setLo(e.target.value.replace(/\D/g, ''))} placeholder={String(Math.floor(f.priceMin))} className="w-full bg-surface px-2 py-1.5 rounded border border-border-subtle text-primary font-bold focus:outline-none focus:border-primary" /></div>
                          <span className="text-muted pb-2" aria-hidden="true">-</span>
                          <div className="w-full"><label htmlFor="ug-max" className="block text-[9px] uppercase text-muted font-bold mb-1">Max</label><input id="ug-max" inputMode="numeric" value={hi} onChange={(e) => setHi(e.target.value.replace(/\D/g, ''))} placeholder={String(Math.ceil(f.priceMax))} className="w-full bg-surface px-2 py-1.5 rounded border border-border-subtle text-primary font-bold focus:outline-none focus:border-primary" /></div>
                        </div>
                        <button type="submit" className="h-9 rounded-lg bg-primary text-white text-[11px] font-bold uppercase tracking-wider cursor-pointer">Apply</button>
                        <p className="text-[11px] text-muted">{money(f.priceMin)} – {money(f.priceMax)}</p>
                      </form>
                    </details>
                  )}

                  {showAvailability && (
                    <details className="group bg-surface-card rounded-xl border border-border-subtle overflow-hidden" open data-testid="filter-stock">
                      <summary className={summaryClass}><span>Availability</span><span className="material-symbols-outlined text-muted group-open:rotate-180 transition-transform" aria-hidden="true">expand_more</span></summary>
                      <div className="px-4 pb-4"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={inStock} onChange={(e) => update({ stock: e.target.checked ? '1' : '' })} className="w-4 h-4 accent-primary" /><span className="font-semibold text-primary">Ready in stock</span></label></div>
                    </details>
                  )}
                </div>
              </aside>

              <div className="lg:col-span-9 flex flex-col gap-5">
                <div className="bg-surface-card p-4 rounded-xl border border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    {meta && <span className="text-xs text-muted font-semibold" aria-live="polite">{meta.total === 0 ? '0 products' : `Showing ${(meta.page - 1) * meta.limit + 1}–${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total}`}</span>}
                    {q && <span className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-primary text-white text-[11px]">“{q}”<button type="button" aria-label="Clear search" onClick={() => update({ q: '' })} className="cursor-pointer"><span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">close</span></button></span>}
                    {size && <span className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-primary text-white text-[11px]">Size {size}<button type="button" aria-label="Remove size filter" onClick={() => update({ size: '' })} className="cursor-pointer"><span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">close</span></button></span>}
                    {color && <span className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full bg-primary text-white text-[11px]">{color}<button type="button" aria-label="Remove color filter" onClick={() => update({ color: '' })} className="cursor-pointer"><span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">close</span></button></span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="ug-sort" className="text-xs uppercase tracking-wider text-muted font-bold hidden md:inline">Sort by</label>
                    <select id="ug-sort" value={sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value })} className="bg-surface text-primary text-xs py-2 pl-3 pr-8 rounded border border-border-subtle focus:outline-none font-semibold cursor-pointer">
                      {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                {products.isError ? (
                  <ErrorBlock error={products.error} onRetry={products.refetch} title="We couldn't load products" />
                ) : products.isLoading ? (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" aria-busy="true" aria-label="Loading products">
                    {Array.from({ length: 6 }).map((_, i) => (<div key={i} className="bg-surface-card rounded-xl border border-border-subtle overflow-hidden animate-pulse"><div className="aspect-3/4 bg-surface-container" /><div className="p-4 space-y-2"><div className="h-3 bg-surface-container rounded w-1/3" /><div className="h-4 bg-surface-container rounded w-3/4" /></div></div>))}
                  </div>
                ) : items.length === 0 ? (
                  <EmptyBlock icon="search_off"
                    title={refinements || q ? 'No products match these filters' : activeSub ? `No ${activeSub.name} products yet` : 'No under garments yet'}
                    text={refinements || q ? 'Try removing a filter or searching for something else.' : 'New styles are added regularly. Please check back soon.'}
                    action={(refinements > 0 || q) ? <button type="button" onClick={() => { const next = new URLSearchParams(); if (activeSub) next.set('sub', activeSub.slug); setParams(next); }} className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold cursor-pointer">Reset filters</button> : undefined} />
                ) : (
                  <ul className={`grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 ${products.isPlaceholderData ? 'opacity-60' : ''}`} data-testid="ug-grid">
                    {items.map((item, idx) => (<li key={item.id}><ProductCard item={item} idx={idx} showSizes /></li>))}
                  </ul>
                )}

                {meta && meta.totalPages > 1 && (
                  <nav aria-label="Pagination" className="bg-surface-card p-5 rounded-xl border border-border-subtle flex flex-col items-center gap-3">
                    <span className="text-xs uppercase tracking-wider text-muted font-semibold">Page {meta.page} of {meta.totalPages}</span>
                    <div className="flex items-center gap-1.5 text-xs flex-wrap justify-center">
                      <button type="button" disabled={meta.page <= 1} onClick={() => update({ page: String(meta.page - 1) })} className="px-3 h-9 rounded font-bold bg-surface text-primary border border-border-subtle cursor-pointer disabled:opacity-40 disabled:cursor-default">Previous</button>
                      <button type="button" disabled={meta.page >= meta.totalPages} onClick={() => update({ page: String(meta.page + 1) })} className="px-3 h-9 rounded font-bold bg-surface text-primary border border-border-subtle cursor-pointer disabled:opacity-40 disabled:cursor-default">Next</button>
                    </div>
                  </nav>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
