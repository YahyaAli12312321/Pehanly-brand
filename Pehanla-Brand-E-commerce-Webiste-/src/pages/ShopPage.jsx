import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useCategoriesQuery, useProductsQuery, usePublicSettingsQuery } from '../hooks/useQueries';
import { buildPath } from '../routes';
import Seo from '../seo/Seo';
import { breadcrumbSchema, itemListSchema } from '../seo/schema';
import { ErrorBlock, EmptyBlock } from '../components/StateViews';
import { useCurrency } from '../store/useCurrencyStore';
import { formatMoney, priceRange, soldIn } from '../utils/currency';

const PAGE_SIZE = 24;
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest Arrivals' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'name', label: 'Name: A to Z' },
];

const summaryClass =
  'flex items-center justify-between p-4 cursor-pointer list-none select-none hover:bg-surface transition-colors font-bold text-primary uppercase text-[11px] tracking-wider';

function Check({ on }) {
  return (
    <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${on ? 'bg-primary text-white' : 'border border-border-subtle group-hover:border-primary'}`}>
      {on && <span className="material-symbols-outlined text-xs leading-none" aria-hidden="true">check</span>}
    </div>
  );
}

export default function ShopPage() {
  const { toggleWishlist, isItemInWishlist } = useApp();
  const { category: categorySlug } = useParams();
  const [params, setParams] = useSearchParams();

  const q = (params.get('q') || '').trim();
  const sort = SORT_OPTIONS.some((o) => o.value === params.get('sort')) ? params.get('sort') : 'newest';
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);

  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => setSearchInput(q), [q]);

  // Client-side refinements (the catalog API filters by category / search / sort only).
  const [color, setColor] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [gridColumns, setGridColumns] = useState(3);

  const { currency } = useCurrency();
  const money = (amount) => formatMoney(amount, currency);
  const { data: categories } = useCategoriesQuery();
  const { data: settings } = usePublicSettingsQuery();
  const activeCategory = categories?.find((c) => c.slug === categorySlug);

  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useProductsQuery({
    category: categorySlug,
    search: q || undefined,
    sort,
    page,
    limit: PAGE_SIZE,
    // Only sent for USD so the backend sorts by the USD selling price; PKR requests are unchanged.
    currency: currency === 'USD' ? 'USD' : undefined,
  });
  const products = useMemo(() => data?.items || [], [data]);
  const meta = data?.meta;

  const colorOptions = useMemo(() => {
    const seen = new Map();
    products.forEach((p) => (p.colors || []).forEach((c) => c?.name && !seen.has(c.name) && seen.set(c.name, c.hexCode)));
    return [...seen.entries()].map(([name, hex]) => ({ name, hex }));
  }, [products]);

  const visible = useMemo(
    () =>
      products.filter((p) => {
        if (color && !(p.colors || []).some((c) => c.name === color)) return false;
        if (inStockOnly && !p.inStock) return false;
        const min = minPrice === '' ? null : Number(minPrice);
        const max = maxPrice === '' ? null : Number(maxPrice);
        const range = priceRange(p, currency);
        if (min != null && (range.max ?? range.min ?? 0) < min) return false;
        if (max != null && (range.min ?? Infinity) > max) return false;
        return true;
      }),
    [products, color, inStockOnly, minPrice, maxPrice, currency],
  );

  const refinementCount = [color, minPrice, maxPrice, inStockOnly].filter(Boolean).length;
  const clearRefinements = () => {
    setColor('');
    setMinPrice('');
    setMaxPrice('');
    setInStockOnly(false);
  };

  const updateParams = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: false });
  };

  // ----- SEO: filters/sort/search must not create indexable duplicates -----
  const basePath = categorySlug ? `/shop/${categorySlug}` : '/shop';
  const isFilteredView = Boolean(q) || sort !== 'newest';
  const canonicalPath = page > 1 && !isFilteredView ? `${basePath}?page=${page}` : basePath;
  const heading = q ? `Results for “${q}”` : activeCategory?.name || (categorySlug ? 'Collection' : 'Shop All');
  const metaTitle = q ? `Search: ${q}` : activeCategory?.name ? `${activeCategory.name}${page > 1 ? ` - Page ${page}` : ''}` : `Shop Clothing${page > 1 ? ` - Page ${page}` : ''}`;
  const metaDescription =
    activeCategory?.description ||
    (activeCategory ? `Shop ${activeCategory.name} from PEHAN LY. Contemporary Pakistani clothing with cash on delivery.` : 'Shop contemporary Pakistani clothing from PEHAN LY: hoodies, t-shirts, trousers and more.');
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Shop', path: '/shop' },
    ...(activeCategory ? [{ name: activeCategory.name, path: `/shop/${activeCategory.slug}` }] : []),
  ];
  const unknownCategory = categorySlug && categories && !activeCategory;

  const whatsapp = String(settings?.contact?.whatsapp || '').replace(/\D/g, '');

  return (
    <div className="w-full flex flex-col bg-surface">
      <Seo
        title={unknownCategory ? 'Category not found' : metaTitle}
        description={metaDescription}
        path={canonicalPath}
        image={activeCategory?.image?.url || products[0]?.image?.url}
        noindex={isFilteredView || unknownCategory || (!isLoading && !isError && products.length === 0 && Boolean(q))}
        jsonLd={products.length ? [breadcrumbSchema(crumbs), itemListSchema(products, basePath)] : breadcrumbSchema(crumbs)}
      />

      {/* BREADCRUMB STRIP */}
      <section className="w-full bg-surface-container py-2.5 border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-muted">
              <Link to="/" className="hover:text-primary">Home</Link>
              <span className="material-symbols-outlined text-[12px]" aria-hidden="true">chevron_right</span>
              {categorySlug || q ? <Link to="/shop" className="hover:text-primary">Shop</Link> : <span className="text-primary font-bold" aria-current="page">Shop</span>}
              {(activeCategory || q) && (
                <>
                  <span className="material-symbols-outlined text-[12px]" aria-hidden="true">chevron_right</span>
                  <span className="text-primary font-bold" aria-current="page">{q ? `Results for "${q}"` : activeCategory.name}</span>
                </>
              )}
            </nav>
            {meta && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent text-primary text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden="true" /> {meta.total} {meta.total === 1 ? 'Match' : 'Matches'} Found
              </span>
            )}
          </div>
        </div>
      </section>

      {/* SEARCH CONTROLS */}
      <section className="w-full bg-surface-card border-b border-border-subtle shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              updateParams({ q: searchInput.trim() });
            }}
            className="relative flex items-center bg-surface rounded-lg border border-border-subtle focus-within:border-primary focus-within:shadow-md transition-all"
          >
            <span className="material-symbols-outlined text-2xl text-primary pl-4 pointer-events-none" aria-hidden="true">search</span>
            <label htmlFor="shop-search" className="sr-only">Search products</label>
            <input
              id="shop-search"
              type="search"
              value={searchInput}
              maxLength={120}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search oversized hoodies, tees, trousers…"
              className="w-full bg-transparent px-4 py-3 text-on-surface text-sm placeholder:text-muted focus:outline-none"
            />
            {searchInput && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setSearchInput('');
                  if (q) updateParams({ q: '' });
                }}
                className="p-1.5 text-muted hover:text-primary mr-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
              </button>
            )}
            <button type="submit" className="bg-primary hover:bg-primary-light text-white px-6 py-3 rounded-r-lg font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer">
              <span>Search</span>
              <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span>
            </button>
          </form>

          {(refinementCount > 0 || q || categorySlug) && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted mr-1">Active Filters:</span>
              {activeCategory && (
                <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-primary text-white text-[11px]">
                  Category: <strong>{activeCategory.name}</strong>
                  <Link to={q ? `/shop?q=${encodeURIComponent(q)}` : '/shop'} aria-label="Remove category filter" className="hover:text-accent">
                    <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">close</span>
                  </Link>
                </span>
              )}
              {q && (
                <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-primary text-white text-[11px]">
                  Search: <strong>{q}</strong>
                  <button type="button" aria-label="Remove search filter" onClick={() => updateParams({ q: '' })} className="hover:text-accent cursor-pointer">
                    <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">close</span>
                  </button>
                </span>
              )}
              {color && (
                <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-primary text-white text-[11px]">
                  Color: <strong>{color}</strong>
                  <button type="button" aria-label="Remove color filter" onClick={() => setColor('')} className="hover:text-accent cursor-pointer">
                    <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">close</span>
                  </button>
                </span>
              )}
              {(minPrice !== '' || maxPrice !== '') && (
                <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-primary text-white text-[11px]">
                  Price: <strong>{minPrice !== '' ? money(minPrice) : 'Any'} – {maxPrice !== '' ? money(maxPrice) : 'Any'}</strong>
                  <button type="button" aria-label="Remove price filter" onClick={() => { setMinPrice(''); setMaxPrice(''); }} className="hover:text-accent cursor-pointer">
                    <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">close</span>
                  </button>
                </span>
              )}
              {inStockOnly && (
                <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-primary text-white text-[11px]">
                  In stock only
                  <button type="button" aria-label="Remove in-stock filter" onClick={() => setInStockOnly(false)} className="hover:text-accent cursor-pointer">
                    <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">close</span>
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* MAIN TWO-COLUMN ARCHITECTURE */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* FILTERS SIDEBAR */}
          <aside aria-label="Filters" className="lg:col-span-3 flex flex-col gap-5">
            <div className="bg-surface-card p-4 rounded-xl border border-border-subtle shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl" aria-hidden="true">tune</span>
                <span className="font-headline text-sm font-bold uppercase text-primary">Refine Catalog</span>
              </div>
              <button type="button" onClick={clearRefinements} disabled={!refinementCount} className="text-[10px] uppercase font-bold tracking-wider text-muted hover:text-primary cursor-pointer disabled:opacity-40 disabled:cursor-default">
                Reset ({refinementCount})
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <details className="group bg-surface-card rounded-xl border border-border-subtle shadow-xs overflow-hidden" open>
                <summary className={summaryClass}>
                  <span>Categories</span>
                  <span className="material-symbols-outlined text-muted group-open:rotate-180 transition-transform" aria-hidden="true">expand_more</span>
                </summary>
                <ul className="px-4 pb-4 flex flex-col gap-2.5">
                  <li>
                    <Link to={q ? `/shop?q=${encodeURIComponent(q)}` : '/shop'} className="flex items-center gap-2 group">
                      <Check on={!categorySlug} />
                      <span className={!categorySlug ? 'font-bold text-primary' : 'text-on-surface'}>All Products</span>
                    </Link>
                  </li>
                  {(categories || []).map((cat) => (
                    <li key={cat.id}>
                      <Link to={buildPath('shop', { category: cat.slug, ...(q ? { q } : {}) })} className="flex items-center gap-2 group">
                        <Check on={categorySlug === cat.slug} />
                        <span className={categorySlug === cat.slug ? 'font-bold text-primary' : 'text-on-surface'}>{cat.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>

              {colorOptions.length > 0 && (
                <details className="group bg-surface-card rounded-xl border border-border-subtle shadow-xs overflow-hidden" open>
                  <summary className={summaryClass}>
                    <span>Color Palette</span>
                    <span className="material-symbols-outlined text-muted group-open:rotate-180 transition-transform" aria-hidden="true">expand_more</span>
                  </summary>
                  <div className="px-4 pb-4">
                    <div className="grid grid-cols-6 gap-2 place-items-center">
                      {colorOptions.map((col) => (
                        <button
                          key={col.name}
                          type="button"
                          aria-pressed={color === col.name}
                          aria-label={col.name}
                          title={col.name}
                          onClick={() => setColor(color === col.name ? '' : col.name)}
                          className={`relative w-8 h-8 rounded-full shadow-xs transition-transform hover:scale-110 cursor-pointer flex items-center justify-center border border-border-subtle ${color === col.name ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                          style={{ backgroundColor: col.hex || '#ccc' }}
                        >
                          {color === col.name && <span className="material-symbols-outlined text-white text-xs font-bold mix-blend-difference" aria-hidden="true">check</span>}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-center text-[11px] text-primary font-bold" aria-live="polite">{color || 'All Colors'}</div>
                  </div>
                </details>
              )}

              <details className="group bg-surface-card rounded-xl border border-border-subtle shadow-xs overflow-hidden" open>
                <summary className={summaryClass}>
                  <span>Price Range ({currency})</span>
                  <span className="material-symbols-outlined text-muted group-open:rotate-180 transition-transform" aria-hidden="true">expand_more</span>
                </summary>
                <div className="px-4 pb-4 flex items-center gap-2 text-[11px]">
                  <div className="w-full">
                    <label htmlFor="price-min" className="block text-[9px] uppercase text-muted font-bold mb-1">Min</label>
                    <input id="price-min" inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ''))} placeholder="0" className="w-full bg-surface px-2 py-1.5 rounded border border-border-subtle text-primary font-bold focus:outline-none focus:border-primary" />
                  </div>
                  <span className="text-muted pt-4" aria-hidden="true">-</span>
                  <div className="w-full">
                    <label htmlFor="price-max" className="block text-[9px] uppercase text-muted font-bold mb-1">Max</label>
                    <input id="price-max" inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ''))} placeholder="Any" className="w-full bg-surface px-2 py-1.5 rounded border border-border-subtle text-primary font-bold focus:outline-none focus:border-primary" />
                  </div>
                </div>
              </details>

              <details className="group bg-surface-card rounded-xl border border-border-subtle shadow-xs overflow-hidden" open>
                <summary className={summaryClass}>
                  <span>Availability</span>
                  <span className="material-symbols-outlined text-muted group-open:rotate-180 transition-transform" aria-hidden="true">expand_more</span>
                </summary>
                <div className="px-4 pb-4">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} className="w-4 h-4 accent-primary" />
                    <span className="font-semibold text-primary">Ready in Stock</span>
                  </label>
                </div>
              </details>
            </div>

            {whatsapp && (
              <div className="bg-primary text-white p-5 rounded-xl shadow-md border border-primary-dark">
                <span className="text-[10px] font-bold text-accent uppercase tracking-widest block mb-1">Need help?</span>
                <h2 className="font-headline text-sm font-bold uppercase leading-tight mb-2">Can't find what you need?</h2>
                <p className="text-xs text-[#B8C4BE] mb-4 leading-relaxed">Message our team and we will help you find the right piece.</p>
                <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3.5 py-2 rounded bg-accent text-primary text-xs font-bold uppercase tracking-wider hover:bg-accent-light transition-colors">
                  <span className="material-symbols-outlined text-base" aria-hidden="true">chat</span>
                  <span>WhatsApp Us</span>
                </a>
              </div>
            )}
          </aside>

          {/* RESULTS */}
          <div className="lg:col-span-9 flex flex-col gap-6">
            <div className="bg-surface-card p-4 rounded-xl border border-border-subtle shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <h1 className="font-headline text-lg font-bold text-primary uppercase tracking-tight">{heading}</h1>
                {meta && (
                  <span className="text-xs text-muted bg-surface-container px-2.5 py-0.5 rounded-full font-semibold">
                    {meta.total === 0 ? '0 products' : `Showing ${(meta.page - 1) * meta.limit + 1}–${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total}`}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <label htmlFor="sort-select" className="text-xs uppercase tracking-wider text-muted font-bold hidden md:inline">Sort By:</label>
                  <div className="relative">
                    <select
                      id="sort-select"
                      value={sort}
                      onChange={(e) => updateParams({ sort: e.target.value === 'newest' ? '' : e.target.value })}
                      className="bg-surface text-primary text-xs py-1.5 pl-3 pr-8 rounded border border-border-subtle focus:outline-none appearance-none cursor-pointer font-semibold"
                    >
                      {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none text-base" aria-hidden="true">unfold_more</span>
                  </div>
                </div>
                <div className="flex items-center bg-surface p-1 rounded border border-border-subtle" role="group" aria-label="Grid density">
                  <button type="button" aria-pressed={gridColumns === 3} aria-label="3 columns" onClick={() => setGridColumns(3)} className={`p-1 rounded cursor-pointer ${gridColumns === 3 ? 'bg-primary text-white shadow-xs' : 'text-muted hover:text-primary'}`}>
                    <span className="material-symbols-outlined text-base" aria-hidden="true">grid_view</span>
                  </button>
                  <button type="button" aria-pressed={gridColumns === 4} aria-label="4 columns" onClick={() => setGridColumns(4)} className={`p-1 rounded cursor-pointer ${gridColumns === 4 ? 'bg-primary text-white shadow-xs' : 'text-muted hover:text-primary'}`}>
                    <span className="material-symbols-outlined text-base" aria-hidden="true">view_compact</span>
                  </button>
                </div>
              </div>
            </div>

            {refinementCount > 0 && meta && meta.totalPages > 1 && (
              <p className="text-[11px] text-muted -mt-2">Color, price and stock refinements apply to the products on this page.</p>
            )}

            {isError ? (
              <ErrorBlock error={error} onRetry={refetch} title="We couldn't load products" />
            ) : isLoading ? (
              <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridColumns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-6`} aria-busy="true" aria-label="Loading products">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-surface-card rounded-xl border border-border-subtle overflow-hidden animate-pulse">
                    <div className="aspect-3/4 bg-surface-container" />
                    <div className="p-4 space-y-2"><div className="h-3 bg-surface-container rounded w-1/3" /><div className="h-4 bg-surface-container rounded w-3/4" /></div>
                  </div>
                ))}
              </div>
            ) : visible.length === 0 ? (
              <EmptyBlock
                icon="search_off"
                title={products.length ? 'No products match these refinements' : q ? `No products match “${q}”` : 'No products here yet'}
                text={products.length ? 'Try removing a filter.' : 'Try a different search or browse another category.'}
                action={
                  products.length ? (
                    <button type="button" onClick={clearRefinements} className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold cursor-pointer">Reset refinements</button>
                  ) : (
                    <Link to="/shop" className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">Browse all products</Link>
                  )
                }
              />
            ) : (
              <ul className={`grid grid-cols-1 sm:grid-cols-2 ${gridColumns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-6 ${isPlaceholderData ? 'opacity-60' : ''}`}>
                {visible.map((item, idx) => {
                  const saved = isItemInWishlist(item.id);
                  const badge = item.isBestSeller ? 'Best Seller' : item.isNewArrival ? 'New Arrival' : item.isFeatured ? 'Featured' : null;
                  return (
                    <li key={item.id}>
                      <article className="group h-full bg-surface-card rounded-xl border border-border-subtle shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden relative">
                        <div className="relative w-full aspect-3/4 bg-surface-container overflow-hidden">
                          <Link to={`/product/${item.slug}`} aria-label={`View ${item.name}`} tabIndex={-1}>
                            {item.image?.url ? (
                              <img
                                src={item.image.url}
                                alt={item.image.alt || item.name}
                                width="600"
                                height="800"
                                loading={idx < 3 ? 'eager' : 'lazy'}
                                fetchPriority={idx === 0 ? 'high' : undefined}
                                decoding="async"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted"><span className="material-symbols-outlined text-4xl" aria-hidden="true">checkroom</span></div>
                            )}
                          </Link>
                          {badge && (
                            <div className="absolute top-3 left-3 z-10">
                              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider shadow-xs bg-accent text-primary">{badge}</span>
                            </div>
                          )}
                          {!item.inStock && (
                            <div className="absolute bottom-3 left-3 z-10">
                              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-primary text-white">Sold out</span>
                            </div>
                          )}
                          <button
                            type="button"
                            aria-pressed={saved}
                            aria-label={saved ? `Remove ${item.name} from wishlist` : `Save ${item.name} to wishlist`}
                            onClick={() => toggleWishlist(item)}
                            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur text-primary hover:text-red-600 shadow-sm flex items-center justify-center transition-transform hover:scale-110 z-10 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-base" aria-hidden="true" style={saved ? { fontVariationSettings: "'FILL' 1", color: '#dc2626' } : {}}>favorite</span>
                          </button>
                          <div className="absolute inset-x-3 bottom-3 translate-y-12 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 transition-all duration-300 z-10">
                            <Link to={`/product/${item.slug}`} className="w-full bg-primary hover:bg-primary-light text-white py-2 rounded text-[11px] uppercase tracking-wider font-bold shadow-md transition-colors flex items-center justify-center gap-1.5">
                              <span className="material-symbols-outlined text-sm" aria-hidden="true">add_shopping_cart</span>
                              <span>Select Size</span>
                            </Link>
                          </div>
                        </div>

                        <div className="p-4 flex flex-col flex-1 justify-between gap-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] uppercase tracking-widest text-muted font-bold">{item.category?.name}</span>
                              {item.colors?.length > 0 && (
                                <div className="flex items-center gap-1" aria-label={`${item.colors.length} colors`}>
                                  {item.colors.slice(0, 5).map((c, i) => (
                                    <span key={i} title={c.name} className="w-2.5 h-2.5 rounded-full border border-border-subtle inline-block" style={{ backgroundColor: c.hexCode || '#ccc' }} />
                                  ))}
                                </div>
                              )}
                            </div>
                            <h2 className="font-headline text-sm font-bold text-primary group-hover:text-accent transition-colors line-clamp-1">
                              <Link to={`/product/${item.slug}`}>{item.name}</Link>
                            </h2>
                            {item.shortDescription && <p className="text-xs text-muted mt-0.5 line-clamp-1">{item.shortDescription}</p>}
                          </div>
                          <div className="flex items-baseline justify-between pt-1 border-t border-border-subtle">
                            <span className="font-headline text-base font-bold text-primary">
                              {(() => {
                                const r = priceRange(item, currency);
                                if (r.min == null || !soldIn(item, currency)) return currency === 'PKR' ? 'Unavailable' : `Not sold in ${currency}`;
                                return r.max > r.min ? `From ${money(r.min)}` : money(r.min);
                              })()}
                            </span>
                            <span className="text-[10px] text-muted font-semibold">{item.inStock ? 'In Stock' : 'Out of stock'}</span>
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}

            {meta && meta.totalPages > 1 && (
              <nav aria-label="Pagination" className="bg-surface-card p-6 rounded-xl border border-border-subtle shadow-xs flex flex-col items-center gap-3 mt-2">
                <span className="text-xs uppercase tracking-wider text-muted font-semibold">Page {meta.page} of {meta.totalPages}</span>
                <div className="flex items-center gap-1.5 text-xs flex-wrap justify-center">
                  {meta.page > 1 && (
                    <button type="button" onClick={() => updateParams({ page: String(meta.page - 1) })} className="px-3 h-8 rounded flex items-center gap-1 font-bold bg-surface hover:bg-surface-container text-primary border border-border-subtle cursor-pointer">
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">arrow_back</span><span>Previous</span>
                    </button>
                  )}
                  {Array.from({ length: meta.totalPages }, (_, i) => i + 1)
                    .filter((n) => n === 1 || n === meta.totalPages || Math.abs(n - meta.page) <= 1)
                    .map((n, i, arr) => (
                      <React.Fragment key={n}>
                        {i > 0 && n - arr[i - 1] > 1 && <span className="px-1 text-muted" aria-hidden="true">…</span>}
                        <button
                          type="button"
                          aria-current={n === meta.page ? 'page' : undefined}
                          aria-label={`Page ${n}`}
                          onClick={() => updateParams({ page: n === 1 ? '' : String(n) })}
                          className={`w-8 h-8 rounded flex items-center justify-center font-bold cursor-pointer ${n === meta.page ? 'bg-primary text-white shadow-xs' : 'bg-surface hover:bg-surface-container text-primary border border-border-subtle'}`}
                        >
                          {n}
                        </button>
                      </React.Fragment>
                    ))}
                  {meta.page < meta.totalPages && (
                    <button type="button" onClick={() => updateParams({ page: String(meta.page + 1) })} className="px-3 h-8 rounded flex items-center gap-1 font-bold bg-surface hover:bg-surface-container text-primary border border-border-subtle cursor-pointer">
                      <span>Next</span><span className="material-symbols-outlined text-sm" aria-hidden="true">arrow_forward</span>
                    </button>
                  )}
                </div>
              </nav>
            )}
          </div>
        </div>
      </div>

      {/* Related categories (crawlable internal links, real data) */}
      {categories?.length > 0 && (
        <section aria-label="Explore categories" className="w-full bg-surface-container py-10 border-t border-border-subtle">
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="bg-surface-card p-6 rounded-xl border border-border-subtle shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-accent text-3xl" aria-hidden="true">manage_search</span>
                <h2 className="font-headline text-base uppercase text-primary tracking-tight font-bold">Explore Categories</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {categories.map((c) => (
                  <Link key={c.id} to={buildPath('shop', { category: c.slug })} className="px-3.5 py-1.5 rounded-full bg-surface hover:bg-primary hover:text-white text-primary text-xs font-semibold uppercase tracking-wider transition-colors shadow-xs border border-border-subtle">
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
