import { describe, it, expect, vi, beforeEach } from 'vitest';

const me = vi.fn(); const login = vi.fn();
vi.mock('../services/accountApi', () => ({ authApi: { me: (...a) => me(...a), login: (...a) => login(...a) }, accountApi: {}, ordersApi: {}, checkoutApi: {}, returnsApi: {} }));
vi.mock('../services/catalogApi', () => ({ catalogApi: {}, reviewsApi: {}, contentApi: {} }));
vi.mock('../services/b2bApi', () => ({ wholesaleApi: {}, manufacturingApi: {}, printingApi: {}, quotesApi: {}, mediaApi: {} }));

import { loginAndVerify, isTransientSessionError } from './useQueries';
import { ApiError } from '../services/http';

const u = { user: { id: 'u1', name: 'Ayesha' } };
beforeEach(() => { me.mockReset(); login.mockReset(); });

describe('loginAndVerify', () => {
  it('returns the user confirmed by /auth/me', async () => {
    login.mockResolvedValue(u); me.mockResolvedValue(u);
    expect(await loginAndVerify({})).toEqual(u);
  });
  it('explains a cookie that was not kept (login 200, /auth/me 401)', async () => {
    login.mockResolvedValue(u); me.mockRejectedValue(new ApiError({ message: 'Authentication required', status: 401 }));
    await expect(loginAndVerify({})).rejects.toMatchObject({ code: 'SESSION_NOT_PERSISTED', status: 401 });
  });
  it('trusts a successful login when /auth/me is merely unreachable', async () => {
    login.mockResolvedValue(u); me.mockRejectedValue(new ApiError({ message: 'down', status: 503 }));
    expect(await loginAndVerify({})).toEqual(u);
  });
  it('wrong credentials still surface as the login error', async () => {
    login.mockRejectedValue(new ApiError({ message: 'Invalid email/phone or password', status: 401, code: 'INVALID_CREDENTIALS' }));
    await expect(loginAndVerify({})).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(me).not.toHaveBeenCalled();
  });
});

describe('isTransientSessionError', () => {
  it('only 401/403 and other client errors mean "signed out"', () => {
    expect(isTransientSessionError({ status: 0 })).toBe(true);
    expect(isTransientSessionError({ status: 503 })).toBe(true);
    expect(isTransientSessionError({ status: 429 })).toBe(true);
    expect(isTransientSessionError({ status: 401 })).toBe(false);
    expect(isTransientSessionError({ status: 403 })).toBe(false);
  });
});
