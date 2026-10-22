/**
 * Public, non-secret runtime configuration.
 * Only VITE_* values are exposed to the browser - never put secrets here.
 */
const trimSlash = (value) => String(value || '').replace(/\/+$/, '');

export const API_BASE_URL = trimSlash(import.meta.env.VITE_API_BASE_URL) || '/api/v1';
export const SITE_URL = trimSlash(import.meta.env.VITE_SITE_URL) || (typeof window !== 'undefined' ? window.location.origin : '');
export const SITE_NAME = 'PEHAN LY';
export const DEFAULT_DESCRIPTION =
  'PEHAN LY - contemporary Pakistani clothing: retail, wholesale, custom manufacturing and printing & branding.';
export const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || '';
