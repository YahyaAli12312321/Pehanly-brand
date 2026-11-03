import { describe, it, expect } from 'vitest';
import { toApiError, errorMessage, ApiError } from './apiError';
import { splitFormError } from './formErrors';

const axiosErr = (status, data = {}, headers = {}) => ({ response: { status, data, headers } });

describe('toApiError', () => {
  it('maps a missing response to a network error', () => {
    const e = toApiError({ message: 'Network Error' });
    expect(e.isNetwork).toBe(true);
    expect(e.code).toBe('NETWORK_ERROR');
  });
  it('maps timeouts', () => {
    expect(toApiError({ code: 'ECONNABORTED' }).code).toBe('TIMEOUT');
  });
  it('reads the backend envelope', () => {
    const e = toApiError(axiosErr(409, { message: 'Nope', code: 'INVALID_ORDER_STATUS_TRANSITION' }));
    expect(e.isConflict).toBe(true);
    expect(e.code).toBe('INVALID_ORDER_STATUS_TRANSITION');
    expect(e.message).toBe('Nope');
  });
  it('flags 401, 403 and 429 with retry-after', () => {
    expect(toApiError(axiosErr(401)).isUnauthorized).toBe(true);
    expect(toApiError(axiosErr(403)).isForbidden).toBe(true);
    const r = toApiError(axiosErr(429, {}, { 'retry-after': '12' }));
    expect(r.isRateLimited).toBe(true);
    expect(r.retryAfter).toBe(12);
    expect(r.message).toContain('12s');
  });
  it('returns an existing ApiError unchanged', () => {
    const e = new ApiError({ message: 'x', status: 500 });
    expect(toApiError(e)).toBe(e);
    expect(e.isServer).toBe(true);
  });
});

describe('validation errors', () => {
  const err = toApiError(axiosErr(422, { message: 'Validation failed', code: 'VALIDATION_ERROR', errors: [{ path: ['items', 0, 'quantity'], message: 'Too small' }, { path: 'name', message: 'Required' }, { path: 'name', message: 'second' }] }));
  it('builds a field map, first message wins', () => {
    expect(err.fieldErrors).toEqual({ 'items.0.quantity': 'Too small', name: 'Required' });
  });
  it('splitFormError separates fields from the general message', () => {
    const { fields, general } = splitFormError(err, 'fallback');
    expect(fields.name).toBe('Required');
    expect(general).toBe('Please fix the highlighted fields.');
  });
  it('errorMessage prefers the first validation message', () => {
    expect(errorMessage(err)).toBe('items.0.quantity: Too small');
  });
});

describe('origin rejection', () => {
  it('explains a CORS_ORIGIN_NOT_ALLOWED 403', () => {
    const e = toApiError({ response: { status: 403, data: { success: false, message: 'Origin not allowed', code: 'CORS_ORIGIN_NOT_ALLOWED' }, headers: {} } });
    expect(e.status).toBe(403);
    expect(e.code).toBe('CORS_ORIGIN_NOT_ALLOWED');
    expect(e.message).toMatch(/CORS_ORIGINS/);
  });
});
