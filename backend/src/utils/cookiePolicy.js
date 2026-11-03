'use strict';

/*
 * Startup self-check for the session cookie (`pl_session`).
 *
 * A cookie set by the API is only sent back by the browser on fetch/XHR when the website and the API
 * are the same SITE, or when the cookie is SameSite=None; Secure. A website on Vercel talking to an API on
 * Render is cross-site, so with the default COOKIE_SAMESITE=lax the login succeeds but the browser drops the
 * cookie: /auth/me answers 401 straight afterwards and the customer lands back on Sign In.
 * This only produces warnings; it never changes the cookie.
 */

// Hosts where every customer gets a sub-domain: those sub-domains are different sites.
const SHARED_SUFFIXES = ['vercel.app', 'onrender.com', 'netlify.app', 'pages.dev', 'herokuapp.com', 'github.io', 'fly.dev', 'railway.app', 'web.app', 'firebaseapp.com'];
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostnameOf(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Approximate "site" (registrable domain). Good enough to tell Vercel/Render apart from a shared custom domain. */
function siteOf(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || LOOPBACK.has(host) || /^\d+(\.\d+){3}$/.test(host)) return host;
  const shared = SHARED_SUFFIXES.find((s) => host === s || host.endsWith(`.${s}`));
  const labels = host.split('.');
  if (shared) {
    const n = shared.split('.').length;
    return labels.slice(-(n + 1)).join('.');
  }
  return labels.slice(-2).join('.');
}

/**
 * @param {{ isProd: boolean, sameSite: string, corsOrigins: string[], apiUrl?: string }} input
 * @returns {string[]} human-readable warnings (empty when the configuration looks right)
 */
function cookieWarnings({ isProd, sameSite, corsOrigins = [], apiUrl }) {
  if (!isProd || sameSite === 'none') return [];
  const webOrigins = corsOrigins.filter((o) => !LOOPBACK.has(hostnameOf(o)));
  if (!webOrigins.length) return [];
  const apiSite = apiUrl ? siteOf(hostnameOf(apiUrl)) : '';
  const crossSite = apiSite ? webOrigins.filter((o) => siteOf(hostnameOf(o)) !== apiSite) : [];
  if (apiSite && !crossSite.length) return [];
  if (apiSite) {
    return [
      `COOKIE_SAMESITE=${sameSite} but the website origin(s) ${crossSite.join(', ')} are a different site from this API (${apiSite}). ` +
        'Browsers will not keep the pl_session cookie, so customers are sent back to Sign In after logging in. ' +
        'Set COOKIE_SAMESITE=none (Secure is then enforced), or serve the API from the same site as the website (custom domain or a reverse proxy on /api).',
    ];
  }
  return [
    `COOKIE_SAMESITE=${sameSite} in production. If the website is hosted on a different site than this API (for example Vercel + Render), ` +
      'the browser will drop the pl_session cookie and login will bounce back to Sign In. Set COOKIE_SAMESITE=none, ' +
      'or serve both under one site (custom domain / reverse proxy). Set API_PUBLIC_URL to make this check precise.',
  ];
}

/**
 * Chooses the pl_session SameSite value. An explicit COOKIE_SAMESITE always wins. When it is unset:
 *  - production + a known API URL + at least one website origin on a different site => 'none' (Secure is enforced), because
 *    SameSite=Lax cookies are dropped on cross-site fetch/XHR (Vercel -> Render): login 200, /auth/me 401;
 *  - everything else (localhost, same-site custom domain, unknown API URL) => 'lax'.
 * Security is unchanged: the cookie stays HttpOnly, the CORS allow-list stays exact, and csrfOrigin still rejects unknown origins.
 */
function resolveSameSite({ explicit, isProd, corsOrigins = [], apiUrl }) {
  if (explicit) return explicit;
  if (!isProd || !apiUrl) return 'lax';
  const apiSite = siteOf(hostnameOf(apiUrl));
  if (!apiSite) return 'lax';
  const cross = corsOrigins.filter((o) => !LOOPBACK.has(hostnameOf(o))).some((o) => siteOf(hostnameOf(o)) !== apiSite);
  return cross ? 'none' : 'lax';
}

module.exports = { cookieWarnings, resolveSameSite, siteOf, hostnameOf };
