'use strict';
const { policy, originRejected } = require('./originGuard');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/*
 * Server-to-browser callbacks that carry NO cookie authority. The JazzCash
 * return POST comes from the gateway's origin; it is authenticated by its
 * HMAC secure hash instead (verified in jazzcash.service), so the cookie-CSRF
 * origin check does not apply to it.
 */
const EXEMPT_PATHS = new Set(['/api/v1/payments/jazzcash/return']);

/** Defence in depth for cookie auth: browsers send Origin on cross-site writes; reject unknown origins. */
function csrfOrigin(req, _res, next) {
  const origin = req.headers.origin;
  const path = (req.originalUrl || req.url || '').split('?')[0];

  if (EXEMPT_PATHS.has(path)) return next();

  if (!SAFE.has(req.method) && origin && !policy.has(origin)) {
    return next(originRejected(origin, req));
  }
  return next();
}

module.exports = csrfOrigin;
module.exports.EXEMPT_PATHS = EXEMPT_PATHS;
