import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../context/AppContext';
import {
  useFreeShippingInfoQuery,
  useProductQuery,
  useProductsQuery,
  usePublicSettingsQuery,
  useReviewSummaryQuery,
  useReviewsQuery,
  useShippingQuoteQuery,
  QUERY_KEYS,
} from '../hooks/useQueries';
import { reviewsApi } from '../services/catalogApi';
import Seo from '../seo/Seo';
import { breadcrumbSchema, productSchema } from '../seo/schema';
import { ErrorBlock, FieldError, LoadingBlock } from '../components/StateViews';
import NotFoundPage from './NotFoundPage';
import { discountPercent, formatDate } from '../utils/format';
import { formatMoney, priceRange, skuCompareAt, skuPrice, soldIn } from '../utils/currency';
import { useCurrency } from '../store/useCurrencyStore';
import { toCartLine } from '../utils/product';

function Stars({ value, size = 18 }) {
  return (
    <span className="flex items-center text-[#E5A800]" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="material-symbols-outlined"
          style={{ fontSize: size, fontVariationSettings: `'FILL' ${value >= n - 0.25 ? 1 : 0}` }}
        >
          {value >= n - 0.25 ? 'star' : value >= n - 0.75 ? 'star_half' : 'star'}
        </span>
      ))}
    </span>
  );
}

function ReviewForm({ productId, onDone }) {
  const { isAuthenticated, showToast, navigate } = useApp();
  const queryClient = useQueryClient();
  const [eligibility, setEligibility] = useState(null);
  const [form, setForm] = useState({ rating: 5, title: '', comment: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    reviewsApi.eligibility(productId).then(setEligibility).catch(() => setEligibility({ eligible: false, reason: 'Could not check eligibility.' }));
  }, [isAuthenticated, productId]);

  if (!isAuthenticated) {
    return (
      <div className="bg-surface-container-low p-5 rounded-xl text-sm text-muted">
        Only verified buyers can review.{' '}
        <button type="button" onClick={() => navigate('account')} className="text-primary font-bold underline cursor-pointer">Sign in</button>{' '}
        to continue.
      </div>
    );
  }
  if (!eligibility) return <p className="text-sm text-muted">Checking eligibility…</p>;
  if (!eligibility.eligible) {
    return <div className="bg-surface-container-low p-5 rounded-xl text-sm text-muted">{eligibility.reason || 'You can review this product after your order is delivered.'}</div>;
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await reviewsApi.create(productId, form);
      showToast('Thank you! Your review is awaiting approval.');
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-surface-container-low p-5 rounded-xl flex flex-col gap-3 text-sm" noValidate>
      <fieldset>
        <legend className="text-xs font-bold text-on-surface mb-1">Your rating</legend>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={form.rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setForm({ ...form, rating: n })} className="cursor-pointer">
              <span className="material-symbols-outlined text-[26px] text-[#E5A800]" style={{ fontVariationSettings: `'FILL' ${form.rating >= n ? 1 : 0}` }} aria-hidden="true">star</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="rv-title" className="block text-xs font-bold text-on-surface mb-1">Title</label>
        <input id="rv-title" value={form.title} maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-describedby="rv-title-err" className="w-full px-3 py-2 rounded-lg bg-white border border-border-subtle focus:outline-none focus:border-primary" />
        <FieldError id="rv-title-err" message={error?.fieldErrors?.title} />
      </div>
      <div>
        <label htmlFor="rv-comment" className="block text-xs font-bold text-on-surface mb-1">Review</label>
        <textarea id="rv-comment" rows={4} value={form.comment} maxLength={3000} onChange={(e) => setForm({ ...form, comment: e.target.value })} aria-describedby="rv-comment-err" className="w-full px-3 py-2 rounded-lg bg-white border border-border-subtle focus:outline-none focus:border-primary" />
        <FieldError id="rv-comment-err" message={error?.fieldErrors?.comment} />
      </div>
      {error && !Object.keys(error.fieldErrors || {}).length && <FieldError message={error.message} />}
      <button type="submit" disabled={busy} className="self-start px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60">
        {busy ? 'Submitting…' : 'Submit review'}
      </button>
    </form>
  );
}

export default function ProductDetailPage() {
  const { slug } = useParams();
  const { navigate, addToCart, toggleWishlist, isItemInWishlist } = useApp();
  const { data: product, isLoading, isError, error, refetch } = useProductQuery(slug);
  const { data: settings } = usePublicSettingsQuery();
  const { currency, setCurrency } = useCurrency();
  const money = (n) => formatMoney(n, currency);
  const { data: freeShipping } = useFreeShippingInfoQuery(currency);
  const { data: summary } = useReviewSummaryQuery(product?.id);
  const [reviewPage, setReviewPage] = useState(1);
  const { data: reviewData } = useReviewsQuery(product?.id, { page: reviewPage, limit: 6, sort: 'newest' });

  const [activeThumb, setActiveThumb] = useState(0);
  const [variantId, setVariantId] = useState(null);
  const [size, setSize] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [sizeError, setSizeError] = useState(false);
  const [expanded, setExpanded] = useState([0]);
  const [city, setCity] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [showReviewForm, setShowReviewForm] = useState(false);

  // Reset selection when switching product.
  useEffect(() => {
    setActiveThumb(0);
    setSize(null);
    setQuantity(1);
    setSizeError(false);
    setVariantId(null);
  }, [slug]);

  const variants = product?.variants || [];
  const variant = variants.find((v) => v.id === variantId) || variants.find((v) => v.sizes.some((s) => s.inStock)) || variants[0];
  const sku = variant?.sizes.find((s) => s.size === size) || null;

  // Gallery: selected variant's images first, then general product images.
  const gallery = useMemo(() => {
    const list = [...(variant?.images || []), ...(product?.images || [])];
    const seen = new Set();
    return list.filter((i) => i?.url && !seen.has(i.url) && seen.add(i.url));
  }, [variant, product]);
  useEffect(() => setActiveThumb(0), [variant?.id]);

  // Prices come from the merchant's per-currency selling prices. A size with no price in the
  // selected currency is not sold in it (never converted from the other currency).
  const range = priceRange(product, currency);
  const displayPrice = sku ? skuPrice(sku, currency) : range.min;
  const comparePrice = sku ? skuCompareAt(sku, currency) : null;
  const off = discountPercent(displayPrice, comparePrice);
  const availableHere = product ? soldIn(product, currency) : true;
  const shippingQuote = useShippingQuoteQuery({ subtotal: Math.round((displayPrice || 0) * quantity * 100) / 100, city, currency }, { enabled: Boolean(city) && Boolean(displayPrice) });

  if (isLoading) return <LoadingBlock label="Loading product…" className="py-40" />;
  if (isError && error?.status === 404) return <NotFoundPage title="Product not found" text="This product is no longer available." />;
  if (isError) return <ErrorBlock error={error} onRetry={refetch} className="py-40" />;
  if (!product) return null;

  const saved = isItemInWishlist(product.id);
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Shop', path: '/shop' },
    ...(product.category ? [{ name: product.category.name, path: `/shop/${product.category.slug}` }] : []),
    { name: product.name, path: `/product/${product.slug}` },
  ];

  const requireSku = () => {
    if (!sku) {
      setSizeError(true);
      return null;
    }
    if (!sku.inStock) return null;
    if (skuPrice(sku, currency) === null) return null; // not sold in the selected currency
    return sku;
  };

  const handleAddToCart = () => {
    const chosen = requireSku();
    if (!chosen) return false;
    return addToCart(toCartLine(product, { ...chosen, color: variant.color, images: variant.images }), quantity);
  };

  const handleBuyNow = () => {
    if (handleAddToCart()) navigate('checkout');
  };

  const stockNote = !sku
    ? null
    : !sku.inStock
      ? 'Sold out in this size'
      : sku.maxQuantity <= 5
        ? `Only ${sku.maxQuantity} left in size ${sku.size}`
        : null;

  const toggleAccordion = (i) => setExpanded((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  const accordions = [
    product.description ? { title: 'Product Description', content: product.description } : null,
    {
      title: 'Shipping, Delivery & Payment',
      content: [
        freeShipping?.available ? `Free shipping on orders of ${money(freeShipping.minimumOrderAmount)} or more.` : null,
        'Shipping cost is calculated from your delivery city at checkout.',
        settings?.checkout?.codEnabled && (settings?.currencies?.paymentMethods?.[currency] ?? (currency === 'PKR' ? ['cod'] : [])).includes('cod') ? 'Cash on Delivery is available.' : null,
        currency === 'USD' ? 'USD checkout is not available yet; orders are currently placed in PKR.' : null,
      ].filter(Boolean).join(' '),
    },
    settings?.returns?.enabled
      ? { title: 'Returns & Exchange', content: `You can request a return or exchange within ${settings.returns.windowDays} days of delivery from your account.` }
      : null,
  ].filter(Boolean);

  const reviews = reviewData?.items || [];
  const reviewMeta = reviewData?.meta;

  return (
    <div className="w-full flex flex-col bg-surface">
      <Seo
        title={product.seo?.title || product.name}
        description={product.seo?.description || product.shortDescription || product.description}
        path={`/product/${product.slug}`}
        image={gallery[0]?.url || product.image?.url}
        type="product"
        noindex={product.seo?.index === false}
        jsonLd={[breadcrumbSchema(crumbs), productSchema(product, summary)].filter(Boolean)}
      />

      {/* 1. Breadcrumb Bar */}
      <nav aria-label="Breadcrumb" className="w-full bg-surface-container-low px-6 md:px-12 py-3.5 border-b border-border-subtle">
        <ol className="max-w-7xl mx-auto flex items-center gap-2 text-xs text-muted font-medium flex-wrap">
          <li><Link to="/" className="hover:text-primary transition-colors">Home</Link></li>
          <li aria-hidden="true"><span className="material-symbols-outlined text-[14px] align-middle">chevron_right</span></li>
          {product.category && (
            <>
              <li><Link to={`/shop/${product.category.slug}`} className="hover:text-primary transition-colors">{product.category.name}</Link></li>
              <li aria-hidden="true"><span className="material-symbols-outlined text-[14px] align-middle">chevron_right</span></li>
            </>
          )}
          <li className="text-on-surface font-semibold truncate" aria-current="page">{product.name}</li>
        </ol>
      </nav>

      {/* 2. Main Product Showcase */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          {/* Gallery */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="flex flex-col-reverse md:flex-row gap-4">
              {gallery.length > 1 && (
                <div className="flex md:flex-col gap-3 overflow-x-auto md:overflow-visible shrink-0 pb-2 md:pb-0" role="tablist" aria-label="Product images">
                  {gallery.map((img, idx) => (
                    <button
                      key={img.url}
                      type="button"
                      role="tab"
                      aria-selected={activeThumb === idx}
                      aria-label={`Image ${idx + 1} of ${gallery.length}`}
                      onClick={() => setActiveThumb(idx)}
                      className={`w-16 h-20 md:w-20 md:h-24 rounded-lg overflow-hidden bg-surface-container relative transition-all cursor-pointer ${activeThumb === idx ? 'ring-2 ring-primary opacity-100 shadow-sm' : 'opacity-70 hover:opacity-100'}`}
                    >
                      <img className="w-full h-full object-cover" src={img.url} alt="" width="80" height="96" loading="lazy" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              )}
              <div className="relative w-full aspect-[4/5] bg-surface-container-low rounded-xl overflow-hidden shadow-sm group border border-border-subtle">
                {gallery[activeThumb] ? (
                  <img
                    className="w-full h-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105"
                    src={gallery[activeThumb].url}
                    alt={gallery[activeThumb].alt || `${product.name}${variant?.color?.name ? ` in ${variant.color.name}` : ''}`}
                    width="800"
                    height="1000"
                    fetchPriority="high"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted"><span className="material-symbols-outlined text-6xl" aria-hidden="true">checkroom</span></div>
                )}
                <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 pointer-events-none">
                  {product.isBestSeller && <span className="bg-primary text-white text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full shadow-sm">Bestseller</span>}
                  {product.isNewArrival && <span className="bg-accent text-primary text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full shadow-sm">New Arrival</span>}
                  {off > 0 && <span className="bg-accent text-primary text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full shadow-sm">{off}% OFF</span>}
                </div>
              </div>
            </div>

            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-white p-5 rounded-xl border border-border-subtle text-center">
              {settings?.checkout?.codEnabled && (
                <li className="flex flex-col items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[24px]" aria-hidden="true">payments</span>
                  <span className="text-xs uppercase font-bold tracking-wider text-on-surface">Cash on Delivery</span>
                  <span className="text-[11px] text-muted">Pay on arrival</span>
                </li>
              )}
              {settings?.returns?.enabled && (
                <li className="flex flex-col items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[24px]" aria-hidden="true">published_with_changes</span>
                  <span className="text-xs uppercase font-bold tracking-wider text-on-surface">{settings.returns.windowDays}-Day Returns</span>
                  <span className="text-[11px] text-muted">From delivery</span>
                </li>
              )}
              {freeShipping?.available && (
                <li className="flex flex-col items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[24px]" aria-hidden="true">local_shipping</span>
                  <span className="text-xs uppercase font-bold tracking-wider text-on-surface">Free Shipping</span>
                  <span className="text-[11px] text-muted">Over {money(freeShipping.minimumOrderAmount)}</span>
                </li>
              )}
            </ul>
          </div>

          {/* Info panel */}
          <div className="lg:col-span-5 flex flex-col gap-6 lg:sticky lg:top-36">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                {product.category && <span className="text-xs uppercase tracking-widest text-muted font-bold">{product.category.name}</span>}
                {sku?.sku && <span className="bg-surface-container text-primary text-[11px] px-2.5 py-0.5 rounded uppercase font-semibold">SKU: {sku.sku}</span>}
              </div>
              <h1 className="font-headline font-bold text-2xl sm:text-3xl text-on-surface leading-tight">{product.name}</h1>
              {summary?.reviewCount > 0 && (
                <div className="flex items-center gap-3 pt-1">
                  <Stars value={summary.averageRating} />
                  <span className="text-xs text-primary font-bold">{summary.averageRating} ({summary.reviewCount} {summary.reviewCount === 1 ? 'review' : 'reviews'})</span>
                </div>
              )}
            </div>

            {!availableHere && (
              <div role="status" className="bg-surface-container-low border border-border-subtle rounded-xl p-4 text-xs text-primary leading-relaxed">
                This product isn't sold in {currency} yet.{' '}
                <button type="button" onClick={() => setCurrency('PKR')} className="font-bold underline cursor-pointer">View it in PKR</button>
              </div>
            )}

            {/* Pricing */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-border-subtle flex flex-col gap-2">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-headline text-3xl font-extrabold text-primary">
                  {displayPrice == null ? (availableHere ? 'Unavailable' : `Not sold in ${currency}`) : `${!sku && range.max > range.min ? 'From ' : ''}${money(displayPrice)}`}
                </span>
                {comparePrice && comparePrice > displayPrice && (
                  <>
                    <span className="text-base text-muted line-through">{money(comparePrice)}</span>
                    <span className="bg-accent text-primary text-xs font-bold px-2.5 py-1 rounded-full">Save {money(comparePrice - displayPrice)} ({off}% OFF)</span>
                  </>
                )}
              </div>
              {freeShipping?.available && (
                <p className="text-xs text-muted">Free shipping on orders of {money(freeShipping.minimumOrderAmount)} or more.</p>
              )}
            </div>

            {/* Color */}
            {variants.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="text-xs text-on-surface font-semibold">
                  Color: <strong className="text-primary font-bold">{variant?.color?.name}</strong>
                </div>
                <div className="flex items-center gap-3 flex-wrap" role="radiogroup" aria-label="Color">
                  {variants.map((v) => {
                    const isSel = v.id === variant?.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        role="radio"
                        aria-checked={isSel}
                        aria-label={v.color?.name}
                        title={v.color?.name}
                        onClick={() => { setVariantId(v.id); setSize(null); setSizeError(false); }}
                        className={`w-9 h-9 rounded-full transition-transform cursor-pointer shadow-sm ${isSel ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'hover:scale-105 ring-1 ring-border-subtle'}`}
                        style={{ backgroundColor: v.color?.hexCode || '#ccc' }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Size */}
            {variant && (
              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-on-surface" id="size-label">
                  Select Size: <strong className="text-primary font-bold">{size || '—'}</strong>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2" role="radiogroup" aria-labelledby="size-label">
                  {variant.sizes.map((s) => {
                    const isSel = size === s.size;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={isSel}
                        aria-disabled={!s.inStock || skuPrice(s, currency) === null}
                        aria-label={`Size ${s.size}${s.inStock ? '' : ' (sold out)'}${skuPrice(s, currency) === null ? ` (not sold in ${currency})` : ''}`}
                        title={skuPrice(s, currency) === null ? `Not sold in ${currency}` : undefined}
                        onClick={() => { if (s.inStock && skuPrice(s, currency) !== null) { setSize(s.size); setSizeError(false); setQuantity(1); } }}
                        className={`py-3 rounded-lg text-xs font-bold transition-all ${
                          !s.inStock || skuPrice(s, currency) === null
                            ? 'bg-surface-container text-muted/50 line-through cursor-not-allowed'
                            : isSel
                              ? 'bg-primary text-white shadow-sm ring-2 ring-primary cursor-pointer'
                              : 'bg-white hover:bg-surface-container text-on-surface border border-border-subtle cursor-pointer'
                        }`}
                      >
                        {s.size}
                      </button>
                    );
                  })}
                </div>
                <FieldError message={sizeError ? 'Please select a size.' : ''} />
                {sku && (
                  <div className="flex items-center gap-2 pt-1 text-xs" aria-live="polite">
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${sku.inStock ? 'bg-primary' : 'bg-muted'}`} aria-hidden="true" />
                    <span className="text-on-surface font-semibold">{sku.inStock ? 'In Stock' : 'Sold out'}</span>
                    {stockNote && <span className="text-error font-semibold ml-auto">{stockNote}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Quantity & CTAs */}
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-white rounded-lg shadow-sm border border-border-subtle px-2 py-1 shrink-0">
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="w-9 h-9 flex items-center justify-center text-on-surface hover:text-primary cursor-pointer">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">remove</span>
                  </button>
                  <span className="w-10 text-center text-sm font-bold text-on-surface" aria-live="polite" aria-label={`Quantity ${quantity}`}>{quantity}</span>
                  <button type="button" onClick={() => setQuantity((q) => Math.min(sku?.maxQuantity || 10, q + 1))} aria-label="Increase quantity" className="w-9 h-9 flex items-center justify-center text-on-surface hover:text-primary cursor-pointer">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={product.inStock === false || !availableHere}
                  className="flex-1 py-3.5 px-6 rounded-lg bg-primary hover:bg-primary-dark active:scale-[0.99] text-white flex items-center justify-center gap-3 shadow-md transition-all cursor-pointer font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">shopping_bag</span>
                  <span>{product.inStock === false ? 'Sold Out' : 'Add To Cart'}</span>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={product.inStock === false || !availableHere}
                  className="flex-1 py-3 px-6 rounded-lg bg-white hover:bg-surface-container text-primary text-xs uppercase tracking-wider font-bold shadow-sm border border-border-subtle transition-all cursor-pointer disabled:opacity-50"
                >
                  Buy Now — Instant Checkout
                </button>
                <button
                  type="button"
                  aria-pressed={saved}
                  aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
                  onClick={() => toggleWishlist(product)}
                  className="w-12 h-12 rounded-lg bg-white hover:bg-surface-container flex items-center justify-center text-muted hover:text-error shadow-sm border border-border-subtle transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[22px]" aria-hidden="true" style={saved ? { fontVariationSettings: "'FILL' 1", color: '#173B32' } : {}}>favorite</span>
                </button>
              </div>
            </div>

            {/* Delivery estimate (real shipping rules) */}
            <form
              onSubmit={(e) => { e.preventDefault(); setCity(cityInput.trim()); }}
              className="bg-white p-4 rounded-xl shadow-sm border border-border-subtle flex flex-col gap-3 text-xs"
            >
              <div className="flex items-center gap-2 text-on-surface font-semibold">
                <span className="material-symbols-outlined text-primary text-[20px]" aria-hidden="true">location_on</span>
                <label htmlFor="ship-city">Check delivery cost to your city</label>
              </div>
              <div className="flex gap-2">
                <input id="ship-city" value={cityInput} onChange={(e) => setCityInput(e.target.value)} placeholder="e.g. Lahore" maxLength={100} className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border-subtle focus:outline-none focus:border-primary" />
                <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-white font-bold cursor-pointer">Check</button>
              </div>
              {city && (
                <p aria-live="polite" className="text-muted">
                  {shippingQuote.isFetching
                    ? 'Checking…'
                    : shippingQuote.isError
                      ? shippingQuote.error?.message
                      : shippingQuote.data
                        ? `Shipping to ${city}: ${shippingQuote.data.amount === 0 ? 'Free' : money(shippingQuote.data.amount)}`
                        : ''}
                </p>
              )}
              {settings?.checkout?.codEnabled && (
                <p className="flex items-center gap-2 text-muted"><span className="material-symbols-outlined text-[16px] text-accent" aria-hidden="true">local_atm</span>Cash on Delivery is available</p>
              )}
            </form>
          </div>
        </div>
      </section>

      {/* 3. Details accordions */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-12 w-full border-t border-border-subtle">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4 flex flex-col gap-4">
            <span className="text-xs uppercase tracking-widest text-primary font-bold">Garment Details</span>
            <h2 className="font-headline font-bold text-2xl text-on-surface">{product.name}</h2>
            {product.shortDescription && <p className="text-sm text-muted leading-relaxed">{product.shortDescription}</p>}
          </div>
          <div className="lg:col-span-8 flex flex-col gap-3">
            {accordions.map((acc, idx) => {
              const isExpanded = expanded.includes(idx);
              return (
                <div key={acc.title} className="bg-white rounded-xl shadow-sm border border-border-subtle overflow-hidden">
                  <h3>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={`acc-${idx}`}
                      onClick={() => toggleAccordion(idx)}
                      className="w-full px-6 py-5 flex items-center justify-between text-left font-headline text-base text-on-surface font-semibold hover:bg-surface-container-low transition-colors cursor-pointer"
                    >
                      <span>{acc.title}</span>
                      <span className={`material-symbols-outlined text-primary transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true">keyboard_arrow_down</span>
                    </button>
                  </h3>
                  {isExpanded && (
                    <div id={`acc-${idx}`} className="px-6 pb-6 pt-1 text-sm text-muted leading-relaxed whitespace-pre-line">{acc.content}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Ratings & Reviews (real data only) */}
      <section aria-labelledby="reviews-heading" className="max-w-7xl mx-auto px-6 md:px-12 py-12 w-full border-t border-border-subtle">
        <div className="bg-white rounded-xl shadow-sm border border-border-subtle p-8 md:p-12 flex flex-col gap-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-border-subtle">
            <div>
              <span className="text-xs uppercase tracking-widest text-primary font-bold">Client Feedback</span>
              <h2 id="reviews-heading" className="font-headline font-bold text-2xl text-on-surface mt-1">Ratings &amp; Reviews</h2>
            </div>
            <button
              type="button"
              aria-expanded={showReviewForm}
              onClick={() => setShowReviewForm((v) => !v)}
              className="px-5 py-2.5 rounded-lg bg-surface-container text-primary text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">rate_review</span>
              <span>Write a Review</span>
            </button>
          </div>

          {showReviewForm && <ReviewForm productId={product.id} onDone={() => setShowReviewForm(false)} />}

          {summary?.reviewCount > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-4 flex flex-col items-center md:items-start gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-headline font-extrabold text-5xl text-primary">{summary.averageRating}</span>
                  <span className="text-muted text-lg">/ 5.0</span>
                </div>
                <Stars value={summary.averageRating} size={22} />
                <p className="text-xs text-muted">Based on {summary.reviewCount} {summary.reviewCount === 1 ? 'review' : 'reviews'}</p>
              </div>
              <div className="md:col-span-8 flex flex-col gap-2.5 text-xs">
                {[5, 4, 3, 2, 1].map((n) => {
                  const count = summary.distribution?.[n] || 0;
                  const pct = summary.reviewCount ? Math.round((count / summary.reviewCount) * 100) : 0;
                  return (
                    <div key={n} className="flex items-center gap-3">
                      <span className="w-12 text-muted">{n} {n === 1 ? 'Star' : 'Stars'}</span>
                      <div className="flex-1 h-2.5 bg-surface-container rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} /></div>
                      <span className="w-12 text-right font-bold text-on-surface">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No reviews yet. Be the first to review this product after your order is delivered.</p>
          )}

          {reviews.length > 0 && (
            <>
              <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                {reviews.map((r) => (
                  <li key={r._id} className="bg-surface-container-low p-6 rounded-xl flex flex-col justify-between gap-4">
                    <div className="flex flex-col gap-2">
                      <Stars value={r.rating} size={16} />
                      <span className="sr-only">{r.rating} out of 5</span>
                      <h3 className="font-headline font-bold text-sm text-on-surface">{r.title}</h3>
                      <p className="text-xs text-muted leading-relaxed">{r.comment}</p>
                      {r.brandReply?.message && (
                        <p className="text-xs text-primary bg-white p-3 rounded-lg border border-border-subtle"><strong>PEHANLY replied:</strong> {r.brandReply.message}</p>
                      )}
                    </div>
                    <div className="pt-2 border-t border-border-subtle text-xs">
                      <span className="font-bold text-primary">{r.customer?.name}</span>
                      {r.verifiedPurchase && <span className="text-muted"> • Verified Buyer</span>}
                      {r.createdAt && <span className="text-muted"> • {formatDate(r.createdAt)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
              {reviewMeta?.totalPages > 1 && (
                <div className="flex justify-center gap-2">
                  <button type="button" disabled={reviewPage <= 1} onClick={() => setReviewPage((p) => p - 1)} className="px-4 py-2 text-xs font-bold rounded border border-border-subtle disabled:opacity-40 cursor-pointer">Previous</button>
                  <button type="button" disabled={reviewPage >= reviewMeta.totalPages} onClick={() => setReviewPage((p) => p + 1)} className="px-4 py-2 text-xs font-bold rounded border border-border-subtle disabled:opacity-40 cursor-pointer">Next</button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <RelatedProducts product={product} />
    </div>
  );
}

function RelatedProducts({ product }) {
  const { currency } = useCurrency();
  const money = (n) => formatMoney(n, currency);
  const { data } = useProductsQuery({ category: product.category?.slug, limit: 5, sort: 'newest' }, { enabled: Boolean(product.category?.slug) });
  const items = (data?.items || []).filter((p) => p.id !== product.id).slice(0, 4);
  if (!items.length) return null;
  return (
    <section aria-labelledby="related-heading" className="max-w-7xl mx-auto px-6 md:px-12 py-12 w-full border-t border-border-subtle">
      <h2 id="related-heading" className="font-headline font-bold text-2xl text-on-surface mb-6">More from {product.category.name}</h2>
      <ul className="grid grid-cols-2 md:grid-cols-4 gap-5">
        {items.map((p) => (
          <li key={p.id}>
            <Link to={`/product/${p.slug}`} className="group block bg-white rounded-xl border border-border-subtle overflow-hidden hover:shadow-lg transition-shadow">
              <div className="aspect-3/4 bg-surface-container overflow-hidden">
                {p.image?.url && <img src={p.image.url} alt={p.image.alt || p.name} width="400" height="533" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
              </div>
              <div className="p-3">
                <h3 className="font-headline text-sm font-bold text-primary line-clamp-1">{p.name}</h3>
                {priceRange(p, currency).min != null && <span className="text-xs text-muted">{money(priceRange(p, currency).min)}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
