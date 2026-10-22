'use strict';
const { config } = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/** Maps known library errors to safe ApiErrors. Unknown errors return null (generic 500). */
function normalize(err) {
  if (err instanceof ApiError) return err;
  if (err?.type === 'entity.parse.failed') return new ApiError(400, 'Malformed JSON body', 'INVALID_JSON');
  if (err?.type === 'entity.too.large') return new ApiError(413, 'Request body too large', 'PAYLOAD_TOO_LARGE');
  if (err?.name === 'ZodError') {
    return ApiError.validation(err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  if (err?.name === 'ValidationError' && err.errors) {
    return ApiError.validation(Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })));
  }
  if (err?.name === 'CastError') return new ApiError(400, `Invalid value for ${err.path}`, 'INVALID_ID');
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0];
    return new ApiError(409, field ? `${field} already exists` : 'Duplicate value', 'DUPLICATE_KEY');
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, _next) {
  const known = normalize(err);
  if (known) {
    if (known.statusCode >= 500) logger.error({ err, reqId: req.id }, 'Handled server error');
    const body = { success: false, message: known.message, code: known.code };
    if (known.errors?.length) body.errors = known.errors;
    return res.status(known.statusCode).json(body);
  }
  logger.error({ err, reqId: req.id, method: req.method, url: req.originalUrl.split('?')[0] }, 'Unhandled error');
  const body = { success: false, message: 'Internal server error', code: 'INTERNAL_ERROR' };
  if (!config.isProd) body.debug = { name: err?.name, message: err?.message, stack: err?.stack };
  return res.status(500).json(body);
};
