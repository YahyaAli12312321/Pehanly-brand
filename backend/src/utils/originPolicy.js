'use strict';

/*
 * One origin policy shared by the CORS middleware and the cookie-CSRF origin check, so the two can never
 * disagree about which browser origins are trusted.
 *
 *  - Exact match against the configured CORS_ORIGINS (scheme + host + port). Nothing is wildcarded.
 *  - Development/test only: loopback aliases (localhost, 127.0.0.1, [::1]) of a configured loopback origin
 *    on the SAME scheme and port are also trusted. They are the same machine, and browsers/Vite resolve
 *    "localhost" to IPv6 or IPv4 depending on the OS. Never enabled in production.
 */

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

function parseOrigin(value) {
  try {
    const u = new URL(value);
    return { origin: u.origin, protocol: u.protocol, hostname: u.hostname, port: u.port };
  } catch {
    return null;
  }
}

/** @param {{ origins: readonly string[], allowLoopbackAliases?: boolean }} opts */
function buildOriginPolicy({ origins, allowLoopbackAliases = false }) {
  const allowed = new Set(origins);

  if (allowLoopbackAliases) {
    for (const o of origins) {
      const p = parseOrigin(o);
      if (!p || !LOOPBACK_HOSTS.includes(p.hostname)) continue;
      for (const host of LOOPBACK_HOSTS) allowed.add(`${p.protocol}//${host}${p.port ? `:${p.port}` : ''}`);
    }
  }

  return {
    /** True when the Origin header value is trusted. Missing Origin is decided by the caller. */
    has: (origin) => allowed.has(origin),
    list: () => [...allowed],
  };
}

module.exports = { buildOriginPolicy, LOOPBACK_HOSTS };
