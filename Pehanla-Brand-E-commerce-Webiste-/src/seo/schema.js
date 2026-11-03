import { SITE_NAME, SITE_URL } from '../config/env';
import { absoluteUrl } from './Seo';

/**
 * JSON-LD builders. Every value must come from a real API response or from
 * what is visibly rendered. Never pass invented ratings, prices or stock.
 */

export const organizationSchema = (settings) => {
  const contact = settings?.contact || {};
  const sameAs = Object.values(settings?.social || {}).filter((v) => typeof v === 'string' && /^https?:\/\//.test(v));
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: settings?.storeName || SITE_NAME,
    url: SITE_URL,
  };
  if (contact.email || contact.phone) {
    org.contactPoint = {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      ...(contact.email ? { email: contact.email } : {}),
      ...(contact.phone ? { telephone: contact.phone } : {}),
    };
  }
  if (sameAs.length) org.sameAs = sameAs;
  return org;
};

export const websiteSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE_URL}/shop?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
});

export const breadcrumbSchema = (crumbs) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.name,
    item: absoluteUrl(c.path),
  })),
});

/**
 * @param product  catalog product detail (backend catalog.service)
 * @param summary  review summary { averageRating, reviewCount } or undefined
 */
export const productSchema = (product, summary) => {
  if (!product) return null;
  const images = [
    ...(product.images || []).map((i) => i.url),
    ...(product.variants || []).flatMap((v) => (v.images || []).map((i) => i.url)),
  ].filter(Boolean);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription || product.description || undefined,
    image: images.length ? [...new Set(images)].slice(0, 6) : undefined,
    category: product.category?.name,
    url: absoluteUrl(`/product/${product.slug}`),
    brand: { '@type': 'Brand', name: SITE_NAME },
  };
  const skuCodes = (product.variants || []).flatMap((v) => (v.sizes || []).map((s) => s.sku)).filter(Boolean);
  if (skuCodes.length === 1) data.sku = skuCodes[0];
  // Offers never depend on the visitor's selected currency (structured data is
  // indexed once). PKR is always emitted; USD only when a real USD price exists.
  const availability = product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
  const offerFor = (cur, low, high) => ({
    '@type': 'AggregateOffer',
    priceCurrency: cur,
    lowPrice: low,
    highPrice: high ?? low,
    offerCount: skuCodes.length || undefined,
    availability,
    url: absoluteUrl(`/product/${product.slug}`),
  });
  const offers = [];
  if (product.priceMin != null) offers.push(offerFor('PKR', product.priceMin, product.priceMax));
  if (product.priceMinUSD != null) offers.push(offerFor('USD', product.priceMinUSD, product.priceMaxUSD));
  if (offers.length === 1) data.offers = offers[0];
  else if (offers.length > 1) data.offers = offers;
  if (summary && summary.reviewCount > 0 && summary.averageRating > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: summary.averageRating,
      reviewCount: summary.reviewCount,
    };
  }
  return data;
};

export const itemListSchema = (products, listPath) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  url: absoluteUrl(listPath),
  itemListElement: products.map((p, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: absoluteUrl(`/product/${p.slug}`),
    name: p.name,
  })),
});
