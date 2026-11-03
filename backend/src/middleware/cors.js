'use strict';
const cors = require('cors');
const { policy, originRejected } = require('./originGuard');

const corsHandler = cors({
  origin(origin, cb) {
    // No Origin header = not a browser CORS request (curl, health checks, provider callbacks).
    if (!origin || policy.has(origin)) return cb(null, true);
    return cb(originRejected(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600,
});

// The JazzCash gateway return is a server-to-browser POST from the gateway's origin with no cookie authority;
// it is authenticated by its HMAC hash (see csrfOrigin.js). CORS must not reject it before that check.
const { EXEMPT_PATHS } = require('./csrfOrigin');

module.exports = function corsMiddleware(req, res, next) {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  if (EXEMPT_PATHS.has(path)) return next();
  return corsHandler(req, res, next);
};
