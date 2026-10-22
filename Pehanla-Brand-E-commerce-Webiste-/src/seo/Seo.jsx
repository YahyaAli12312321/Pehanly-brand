import { useEffect } from 'react';
import { SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION } from '../config/env';

const MARK = 'data-seo';

const upsertMeta = (attr, key, content) => {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector);
  if (!content) {
    if (el && el.hasAttribute(MARK)) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    el.setAttribute(MARK, '1');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
};

const upsertCanonical = (href) => {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!href) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
};

export const absoluteUrl = (path = '/') => {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

const truncate = (text, max = 160) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

/**
 * Per-page head management for a client-rendered SPA.
 *  - title / description / canonical (query strings are never canonical)
 *  - Open Graph + Twitter
 *  - robots (noindex for private, transactional and 404 pages)
 *  - JSON-LD (only data the caller derived from real API responses)
 */
export default function Seo({
  title,
  description,
  path,
  image,
  type = 'website',
  noindex = false,
  jsonLd,
  titleIsFull = false,
}) {
  const fullTitle = !title ? `${SITE_NAME} - Wear Your Identity` : titleIsFull ? title : `${title} | ${SITE_NAME}`;
  const desc = truncate(description || DEFAULT_DESCRIPTION);
  const canonical = noindex ? null : absoluteUrl(path ?? window.location.pathname);
  const img = image ? absoluteUrl(image) : '';
  const ldKey = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    document.title = fullTitle;
    upsertMeta('name', 'description', desc);
    upsertCanonical(canonical);
    upsertMeta('name', 'robots', noindex ? 'noindex,nofollow' : null);
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', desc);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:url', canonical);
    upsertMeta('property', 'og:image', img);
    upsertMeta('name', 'twitter:card', img ? 'summary_large_image' : 'summary');
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', desc);
    upsertMeta('name', 'twitter:image', img);
  }, [fullTitle, desc, canonical, noindex, type, img]);

  useEffect(() => {
    document.head.querySelectorAll('script[data-seo-jsonld]').forEach((n) => n.remove());
    if (!ldKey) return undefined;
    const blocks = Array.isArray(JSON.parse(ldKey)) ? JSON.parse(ldKey) : [JSON.parse(ldKey)];
    blocks.forEach((block) => {
      const el = document.createElement('script');
      el.type = 'application/ld+json';
      el.setAttribute('data-seo-jsonld', '1');
      el.textContent = JSON.stringify(block).replace(/</g, '\\u003c');
      document.head.appendChild(el);
    });
    return () => document.head.querySelectorAll('script[data-seo-jsonld]').forEach((n) => n.remove());
  }, [ldKey]);

  return null;
}
