import axios from 'axios';
import { API_BASE_URL } from '../config/env';

/**
 * Normalised API error. Always has `message`, `status`, `code` and a
 * `fieldErrors` map ({ 'customer.email': 'Invalid email' }) for 422 responses.
 */
export class ApiError extends Error {
  constructor({ message, status = 0, code = 'UNKNOWN', errors = [] }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.fieldErrors = ApiError.toFieldMap(errors);
  }

  static toFieldMap(errors) {
    const map = {};
    (Array.isArray(errors) ? errors : []).forEach((e) => {
      const key = Array.isArray(e?.path) ? e.path.join('.') : e?.field || e?.path;
      if (key && !map[key]) map[key] = e.message || 'Invalid value';
    });
    return map;
  }

  get isNetwork() {
    return this.status === 0;
  }
}

export const toApiError = (error) => {
  if (error instanceof ApiError) return error;
  const res = error?.response;
  if (!res) {
    return new ApiError({
      message: 'Cannot reach the server. Please check your connection and try again.',
      code: 'NETWORK_ERROR',
    });
  }
  const body = res.data || {};
  const fallback =
    res.status === 429
      ? 'Too many requests. Please wait a moment and try again.'
      : res.status >= 500
        ? 'Something went wrong on our side. Please try again.'
        : 'Request failed.';
  const originRefused = res.status === 403 && body.code === 'CORS_ORIGIN_NOT_ALLOWED';
  return new ApiError({
    message: originRefused ? "This site's address is not allowed to reach the server. Please contact support." : body.message || fallback,
    status: res.status,
    code: body.code || `HTTP_${res.status}`,
    errors: body.errors,
  });
};

/** Listeners are told when the server says the session is gone (401). */
const unauthorizedListeners = new Set();
export const onUnauthorized = (fn) => {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
};

export const http = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // HttpOnly `pl_session` cookie - no tokens in JS
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error);
    if (apiError.status === 401 && apiError.code !== 'INVALID_CREDENTIALS') {
      unauthorizedListeners.forEach((fn) => fn(apiError));
    }
    return Promise.reject(apiError);
  },
);

/** Returns the `data` field of the success envelope. */
export const getData = async (promise) => (await promise).data?.data;

/** Returns `{ items, meta }` for paginated list endpoints. */
export const getList = async (promise) => {
  const body = (await promise).data || {};
  return { items: Array.isArray(body.data) ? body.data : [], meta: body.meta || null };
};
