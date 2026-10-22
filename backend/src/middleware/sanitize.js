'use strict';

/**
 * NoSQL-injection hardening: removes keys beginning with "$" or containing "."
 * from body/query/params in place (works with Express 4 and 5).
 * This is a safety net; strict per-route validation (later phases) remains the primary defense.
 */
const isDangerousKey = (k) => k.startsWith('$') || k.includes('.');

function clean(value) {
  if (Array.isArray(value)) {
    value.forEach(clean);
    return value;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (isDangerousKey(key)) delete value[key];
      else clean(value[key]);
    }
  }
  return value;
}

function sanitizeInput(req, _res, next) {
  clean(req.body);
  clean(req.query);
  clean(req.params);
  next();
}

module.exports = { sanitizeInput, clean };
