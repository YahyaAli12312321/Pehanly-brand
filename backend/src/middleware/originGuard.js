'use strict';
const { config } = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { buildOriginPolicy } = require('../utils/originPolicy');

const policy = buildOriginPolicy({ origins: config.cors.origins, allowLoopbackAliases: !config.isProd });

/**
 * The 403 for a rejected browser origin. Every rejection is logged with the origin that was received, which
 * is the one fact needed to fix it. Outside production the response also names the rejected origin and the
 * configured ones; production answers with the bare, non-revealing message.
 */
function originRejected(origin, req) {
  logger.warn({ origin, method: req?.method, path: (req?.originalUrl || req?.url || '').split('?')[0], allowed: policy.list() }, 'Request origin rejected (not in CORS_ORIGINS)');
  const message = config.isProd
    ? 'Origin not allowed'
    : `Origin not allowed: "${origin}" is not in CORS_ORIGINS (allowed: ${config.cors.origins.join(', ')}). Open the app from an allowed origin or add this one to CORS_ORIGINS and restart the API.`;
  return new ApiError(403, message, 'CORS_ORIGIN_NOT_ALLOWED');
}

module.exports = { policy, originRejected };
