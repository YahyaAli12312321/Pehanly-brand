'use strict';

/**
 * Response helpers. Always called as (res, { data, message, meta, statusCode, ...extra }).
 *
 * - Extra top-level keys (for example `stats`) are forwarded in the response body.
 * - Pagination meta always carries BOTH `pages` and `totalPages`.
 * - Positional calls such as success(res, data, 'message', meta) throw a TypeError, so a
 *   wrong call fails loudly instead of silently returning `data: null`.
 */

function assertOptions(options, extraArgs) {
  const isOptionsObject =
    options !== null &&
    typeof options === 'object' &&
    !Array.isArray(options) &&
    typeof options.toObject !== 'function';

  if (extraArgs.length > 0 || !isOptionsObject) {
    throw new TypeError(
      'apiResponse expects (res, { data, message, meta }); positional arguments are not supported',
    );
  }
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return meta;

  const out = { ...meta };

  if (out.totalPages === undefined && out.pages !== undefined) out.totalPages = out.pages;
  if (out.pages === undefined && out.totalPages !== undefined) out.pages = out.totalPages;

  return out;
}

function success(res, options = {}, ...extraArgs) {
  assertOptions(options, extraArgs);

  const { data = null, message = 'OK', statusCode = 200, meta, ...extra } = options;

  const body = { success: true, message, data };

  if (meta !== undefined) body.meta = normalizeMeta(meta);

  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && key !== 'success') body[key] = value;
  }

  return res.status(statusCode).json(body);
}

function created(res, options = {}, ...extraArgs) {
  assertOptions(options, extraArgs);

  return success(res, {
    ...options,
    message: options.message === undefined ? 'Created' : options.message,
    statusCode: 201,
  });
}

module.exports = { success, created };
