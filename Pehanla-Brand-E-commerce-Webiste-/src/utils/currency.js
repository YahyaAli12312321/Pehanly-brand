/**
 * Storefront currency model (PKR + USD only).
 *
 * - PKR is the base currency of every existing price. USD is a SEPARATE price the merchant enters per SKU
 *   (`priceUSD`); nothing in the browser converts one into the other.
 * - A transaction has exactly one currency. A size with no USD price simply isn't sold in USD.
 * - Detection only picks the INITIAL preference. A manual choice always wins (see store/useCurrencyStore).
 */
export const CURRENCIES = ['PKR', 'USD'];
export const DEFAULT_CURRENCY = 'PKR';

export const CURRENCY_LABELS = {
  PKR: 'PKR — Pakistani Rupee',
  USD: 'USD — US Dollar',
};

export const isCurrency = (value) => CURRENCIES.includes(value);

/** Formats an amount in a currency. PKR: "Rs. 4,500". USD: "$19.99". Non-numbers -> ''. */
export const formatMoney = (amount, currency = DEFAULT_CURRENCY) => {
  const n = Number(amount);
  if (amount === null || amount === undefined || amount === '' || !Number.isFinite(n)) return '';
  if (currency === 'USD') {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return `Rs. ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
};

/** Selling price of one SKU in a currency, or null when it is not sold in that currency. */
export const skuPrice = (sku, currency = DEFAULT_CURRENCY) => {
  if (!sku) return null;
  const v = currency === 'USD' ? sku.priceUSD : sku.price;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
};

/** Compare-at ("was") price in a currency; only meaningful when it is above the selling price. */
export const skuCompareAt = (sku, currency = DEFAULT_CURRENCY) => {
  const price = skuPrice(sku, currency);
  if (price === null) return null;
  const v = currency === 'USD' ? sku.compareAtPriceUSD : sku.compareAtPrice;
  return typeof v === 'number' && Number.isFinite(v) && v > price ? v : null;
};

/** { min, max } of a product card / detail in a currency; nulls when it has no price in that currency. */
export const priceRange = (product, currency = DEFAULT_CURRENCY) => {
  if (!product) return { min: null, max: null };
  const min = currency === 'USD' ? product.priceMinUSD : product.priceMin;
  const max = currency === 'USD' ? product.priceMaxUSD : product.priceMax;
  const ok = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { min: ok(min), max: ok(max) };
};

/** Whether a product (card or detail) can be bought in a currency. Old payloads without `currencies` are PKR-only. */
export const soldIn = (product, currency = DEFAULT_CURRENCY) => {
  const list = Array.isArray(product?.currencies) ? product.currencies : ['PKR'];
  return list.includes(currency);
};

/** Order/snapshot currency (orders created before multi-currency have none: they are PKR). */
export const orderCurrency = (order) => (isCurrency(order?.currency) ? order.currency : DEFAULT_CURRENCY);

/**
 * Initial market guess. Only used when the visitor has never chosen a currency.
 * Signals: IANA time zone and browser language region. Crawlers/headless/automation always get PKR so
 * the indexed storefront stays the Pakistani one. Unknown = PKR (the home market).
 */
const BOT_RE = /bot|crawl|spider|slurp|lighthouse|headless|prerender|pagespeed|facebookexternalhit/i;
const PK_ZONES = new Set(['Asia/Karachi']);

export function detectCurrency(env = {}) {
  const nav = env.navigator ?? (typeof navigator !== 'undefined' ? navigator : undefined);
  const tz =
    env.timeZone ??
    (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return undefined;
      }
    })();

  if (!nav) return DEFAULT_CURRENCY;
  if (nav.webdriver || BOT_RE.test(nav.userAgent || '')) return DEFAULT_CURRENCY;

  const langs = [...(nav.languages || []), nav.language].filter(Boolean);
  const regions = langs.map((l) => (String(l).split('-')[1] || '').toUpperCase()).filter(Boolean);
  const primary = langs.map((l) => String(l).split('-')[0].toLowerCase());

  if (tz && PK_ZONES.has(tz)) return 'PKR';
  if (regions.includes('PK') || primary.includes('ur')) return 'PKR';
  // A known, non-Pakistani time zone is the strong international signal.
  if (tz && tz !== 'UTC' && !PK_ZONES.has(tz)) return 'USD';
  return DEFAULT_CURRENCY;
}

/** Exact money addition in integer minor units (no 0.1 + 0.2 drift). */
export const sumMoney = (values) => values.reduce((sum, v) => sum + Math.round(Number(v) * 100), 0) / 100;

/** Price of a cart line in a currency (cart lines carry both prices; null = not sold in that currency). */
export const linePrice = (line, currency = DEFAULT_CURRENCY) => skuPrice(currency === 'USD' ? { priceUSD: line?.priceUSD } : { price: line?.price }, currency);

/** Original ("was") price of a cart line in a currency, only when above the selling price. */
export const lineOriginal = (line, currency = DEFAULT_CURRENCY) => {
  const price = linePrice(line, currency);
  if (price === null) return null;
  const v = currency === 'USD' ? line?.originalPriceUSD : line?.originalPrice;
  return typeof v === 'number' && Number.isFinite(v) && v > price ? v : null;
};
