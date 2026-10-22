/**
 * Normalised error thrown by every API call.
 *
 * Backend error envelope: { success:false, message, code, errors?: [{ path, message }] }
 * Validation failures are HTTP 422 / VALIDATION_ERROR.
 */
export class ApiError extends Error {
  constructor({ message, status = 0, code = 'UNKNOWN_ERROR', errors = [], retryAfter = null, requestId = null, cause } = {}) {
    super(message || 'Something went wrong');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = Array.isArray(errors) ? errors : [];
    this.retryAfter = retryAfter;
    this.requestId = requestId;
    if (cause) this.cause = cause;
  }

  get isNetwork() {
    return this.status === 0;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isConflict() {
    return this.status === 409;
  }
  get isValidation() {
    return this.status === 422;
  }
  get isRateLimited() {
    return this.status === 429;
  }
  get isServer() {
    return this.status >= 500;
  }

  /** { "items.0.quantity": "Must be at least 1", ... } (first message wins per path) */
  get fieldErrors() {
    const out = {};
    for (const e of this.errors) {
      const path = Array.isArray(e?.path) ? e.path.join('.') : e?.path || e?.field || '';
      if (path && !(path in out)) out[path] = e?.message || 'Invalid value';
    }
    return out;
  }
}

/** Build an ApiError from an Axios error (or anything thrown). */
export function toApiError(err) {
  if (err instanceof ApiError) return err;

  const res = err?.response;
  if (!res) {
    const timedOut = err?.code === 'ECONNABORTED';
    return new ApiError({
      status: 0,
      code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: timedOut
        ? 'The server took too long to respond. Please try again.'
        : 'Cannot reach the server. Check your connection and try again.',
      cause: err,
    });
  }

  const body = res.data && typeof res.data === 'object' ? res.data : {};
  const retryAfter = Number(res.headers?.['retry-after']) || null;
  let message = body.message;

  if (!message) {
    if (res.status === 429) message = 'Too many requests. Please wait a moment and try again.';
    else if (res.status >= 500) message = 'The server ran into a problem. Please try again shortly.';
    else message = `Request failed (${res.status})`;
  }
  // The API refused this browser origin (CORS / cookie-CSRF check). Say which address was refused.
  if (res.status === 403 && body.code === 'CORS_ORIGIN_NOT_ALLOWED') {
    const here = typeof window !== 'undefined' ? window.location.origin : 'this address';
    message = `The server does not allow requests from ${here}. Open the dashboard from an allowed address, or add ${here} to the API's CORS_ORIGINS and restart it.`;
  }
  if (res.status === 429 && retryAfter) message = `${message} (retry in ${retryAfter}s)`;

  return new ApiError({
    message,
    status: res.status,
    code: body.code || `HTTP_${res.status}`,
    errors: body.errors,
    retryAfter,
    requestId: res.headers?.['x-request-id'] || null,
    cause: err,
  });
}

/** Message safe to show in a toast. */
export function errorMessage(err, fallback = 'Something went wrong') {
  const e = toApiError(err);
  if (e.isValidation) {
    const first = e.errors[0];
    if (first?.message) {
      const path = Array.isArray(first.path) ? first.path.join('.') : first.path;
      return path ? `${path}: ${first.message}` : first.message;
    }
  }
  return e.message || fallback;
}
