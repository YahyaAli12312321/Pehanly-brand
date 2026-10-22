import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { buildPath } from '../routes';
import { useCategoriesQuery, useProductsQuery } from '../hooks/useQueries';
import { useCurrency } from '../store/useCurrencyStore';
import { formatMoney, priceRange } from '../utils/currency';

const useDebounced = (value, ms = 250) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
};

export default function SearchModal() {
  const { currency } = useCurrency();
  const { isSearchOpen, setIsSearchOpen, navigate } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const opener = useRef(null);

  const term = useDebounced(searchTerm.trim());
  const { data: categories } = useCategoriesQuery();
  const { data: results, isFetching } = useProductsQuery(
    { search: term, limit: 6 },
    { enabled: isSearchOpen && term.length >= 2 },
  );

  const close = () => setIsSearchOpen(false);

  useEffect(() => {
    if (!isSearchOpen) return undefined;
    opener.current = document.activeElement;
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll('a[href],button:not([disabled]),input');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      opener.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearchOpen]);

  if (!isSearchOpen) return null;

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    close();
    navigate('shop', { q: searchTerm.trim() });
  };

  const items = results?.items || [];

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Search the catalog"
      className="fixed inset-0 z-50 bg-surface/95 backdrop-blur-xl p-6 flex flex-col justify-start overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <img
              alt=""
              width="32"
              height="32"
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-full border border-primary/20 object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuA4UWfPEYGXJDhgsadQ3NEo4JAo-k_Q3QaUvPl_Mrx4CqooZZM7fUqif-HosA0XbWNcBRb6CZgbLdKQpy7Lt3CIFwqcPUzbn8coMDoH9A0AJRE96kT_FeRg2gfZn1ZVdHs14QV9j8zGl5Kes5gnuU37oPJRy0cbaKKsiZAYqKfVb1mAF8mj_ncgpFe0WFjqzsu6oeRkFdMHBjomQDP6t9DUn-jPF7nfCINwU6KrMzQ6PqTedn8Q8WzmoorHe16RydnulA"
            />
            <h2 className="text-xs uppercase tracking-widest font-bold text-primary">Search PEHANLY Catalog</h2>
          </div>
          <button
            type="button"
            aria-label="Close search"
            onClick={close}
            className="w-10 h-10 flex items-center justify-center text-on-surface hover:text-primary cursor-pointer rounded-full hover:bg-surface-container"
            id="search-close-btn"
          >
            <span className="material-symbols-outlined text-[24px]" aria-hidden="true">close</span>
          </button>
        </div>

        <form onSubmit={handleSearchSubmit} role="search" className="relative w-full my-6">
          <label htmlFor="site-search" className="sr-only">Search garments</label>
          <input
            id="site-search"
            ref={inputRef}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-14 bg-white border border-border-subtle rounded-xl pl-5 pr-14 text-base text-on-surface placeholder:text-muted focus:outline-none focus:border-primary shadow-sm"
            placeholder="Search garments, hoodies, trousers…"
            type="search"
            autoComplete="off"
            maxLength={120}
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-3 top-3 w-8 h-8 flex items-center justify-center text-muted hover:text-primary cursor-pointer"
          >
            <span className="material-symbols-outlined text-[24px]" aria-hidden="true">search</span>
          </button>
        </form>

        {term.length >= 2 && (
          <section aria-live="polite" aria-label="Search results" className="mb-8">
            {isFetching && !items.length ? (
              <p className="text-sm text-muted">Searching…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted">No products match “{term}”. Try a different word.</p>
            ) : (
              <>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`/product/${p.slug}`}
                        onClick={close}
                        className="flex items-center gap-3 p-2 bg-white border border-border-subtle rounded-xl hover:border-primary transition-colors"
                      >
                        {p.image?.url ? (
                          <img src={p.image.url} alt="" width="56" height="70" loading="lazy" referrerPolicy="no-referrer" className="w-14 h-[70px] object-cover rounded-lg bg-surface-container" />
                        ) : (
                          <span className="w-14 h-[70px] rounded-lg bg-surface-container" aria-hidden="true" />
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-on-surface truncate">{p.name}</span>
                          {priceRange(p, currency).min != null && <span className="block text-xs text-muted">From {formatMoney(priceRange(p, currency).min, currency)}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={handleSearchSubmit}
                  className="mt-4 text-xs font-bold uppercase tracking-wider text-primary hover:underline cursor-pointer"
                >
                  View all results for “{term}”
                </button>
              </>
            )}
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted uppercase font-bold tracking-wider block w-full mb-1">Browse:</span>
          {(categories || []).slice(0, 8).map((c) => (
            <Link
              key={c.id}
              to={buildPath('shop', { category: c.slug })}
              onClick={close}
              className="px-3.5 py-1.5 bg-white border border-border-subtle rounded-full text-xs text-on-surface hover:border-primary font-medium hover:bg-surface-container-low transition-colors"
            >
              {c.name}
            </Link>
          ))}
          <Link to={buildPath('wholesale')} onClick={close} className="px-3.5 py-1.5 bg-white border border-border-subtle rounded-full text-xs text-on-surface hover:border-primary font-medium">
            Wholesale
          </Link>
          <Link to={buildPath('custom-manufacturing')} onClick={close} className="px-3.5 py-1.5 bg-white border border-border-subtle rounded-full text-xs text-on-surface hover:border-primary font-medium">
            Custom Manufacturing
          </Link>
          <Link to={buildPath('printing-branding')} onClick={close} className="px-3.5 py-1.5 bg-white border border-border-subtle rounded-full text-xs text-on-surface hover:border-primary font-medium">
            Printing &amp; Branding
          </Link>
        </div>
      </div>
    </div>
  );
}
