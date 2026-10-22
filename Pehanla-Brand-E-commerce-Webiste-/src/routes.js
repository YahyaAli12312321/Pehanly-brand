/**
 * Single source of truth for URLs.
 *
 * Pages keep calling `navigate('product-detail', { slug })` (the original
 * route-key API); this table turns that into a real, crawlable URL and
 * back again. Keep paths lowercase and stable - they are the SEO surface.
 */
const enc = encodeURIComponent;

const qs = (params) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
};

export const ROUTE_DEFS = {
  home: { path: '/', build: () => '/' },
  shop: {
    path: '/shop',
    build: ({ category, ...rest } = {}) => `${category ? `/shop/${enc(category)}` : '/shop'}${qs(rest)}`,
  },
  'product-detail': {
    path: '/product/:slug',
    build: ({ slug } = {}) => (slug ? `/product/${enc(slug)}` : '/shop'),
  },
  cart: { path: '/cart', build: () => '/cart' },
  checkout: { path: '/checkout', build: () => '/checkout' },
  'order-success': { path: '/order-confirmation', build: () => '/order-confirmation' },
  'track-order': { path: '/track-order', build: () => '/track-order' },
  account: { path: '/account', build: ({ tab, token } = {}) => `/account${qs({ tab, token })}` },
  wishlist: { path: '/wishlist', build: () => '/wishlist' },
  about: { path: '/about', build: () => '/about' },
  wholesale: { path: '/wholesale', build: () => '/wholesale' },
  'custom-manufacturing': { path: '/custom-manufacturing', build: () => '/custom-manufacturing' },
  'manufacturing-detail': {
    path: '/custom-manufacturing/:categorySlug',
    build: ({ categorySlug } = {}) => (categorySlug ? `/custom-manufacturing/${enc(categorySlug)}` : '/custom-manufacturing'),
  },
  'printing-branding': { path: '/printing-branding', build: () => '/printing-branding' },
};

/** Build the URL for a route key. Unknown keys fall back to home. */
export const buildPath = (route, params = {}) => (ROUTE_DEFS[route] || ROUTE_DEFS.home).build(params || {});

/** Resolve a pathname to `{ route, params }` (used to derive the legacy `currentRoute`). */
export const matchRoute = (pathname) => {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const segs = clean.split('/').filter(Boolean);
  const dec = (s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  };
  if (!segs.length) return { route: 'home', params: {} };
  const [first, second] = segs;
  if (first === 'shop') return { route: 'shop', params: second ? { category: dec(second) } : {} };
  if (first === 'product' && second) return { route: 'product-detail', params: { slug: dec(second) } };
  if (first === 'custom-manufacturing') {
    return second ? { route: 'manufacturing-detail', params: { categorySlug: dec(second) } } : { route: 'custom-manufacturing', params: {} };
  }
  const direct = Object.entries(ROUTE_DEFS).find(([, def]) => def.path === `/${first}` && segs.length === 1);
  return direct ? { route: direct[0], params: {} } : { route: 'not-found', params: {} };
};
