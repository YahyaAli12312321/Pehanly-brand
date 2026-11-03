import axios from 'axios';
import { toApiError } from './apiError';

/**
 * Single Axios instance for the whole app.
 *
 * Auth = the backend's HttpOnly `pl_session` cookie. There is no bearer token and
 * nothing auth-related is stored by the frontend; `withCredentials` makes the browser
 * send the cookie. Keep VITE_API_BASE_URL relative (default) so it stays same-origin.
 */
export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

let unauthorizedHandler = null;
/** The auth layer registers what should happen when a signed-in session is rejected. */
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

// Endpoints whose 401 is an expected answer, not an expired session.
const AUTH_PROBES = ['/auth/login', '/auth/me', '/auth/forgot-password', '/auth/reset-password', '/auth/logout'];

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel?.(error)) return Promise.reject(error);
    const apiError = toApiError(error);
    const url = error?.config?.url || '';
    if (apiError.status === 401 && !AUTH_PROBES.some((p) => url.startsWith(p))) {
      unauthorizedHandler?.(apiError);
    }
    return Promise.reject(apiError);
  },
);

/**
 * Typed-ish helpers. Every backend success body is { success, message, data, meta? }.
 * `request` resolves to that body so callers can read both `data` and `meta`.
 */
export async function request(config) {
  const res = await apiClient.request(config);
  return res.data;
}
export const get = (url, params, config) => request({ ...config, method: 'GET', url, params });
export const post = (url, data, config) => request({ ...config, method: 'POST', url, data });
export const patch = (url, data, config) => request({ ...config, method: 'PATCH', url, data });
export const put = (url, data, config) => request({ ...config, method: 'PUT', url, data });
export const del = (url, config) => request({ ...config, method: 'DELETE', url });

/** Drop undefined / null / '' / 'all' so filters never reach the backend as junk. */
export function cleanParams(params = {}) {
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === 'all') continue;
    out[k] = v;
  }
  return out;
}
