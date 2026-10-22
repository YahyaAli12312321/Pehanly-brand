import { get, post } from '../lib/apiClient';

export const authApi = {
  /** GET /auth/me -> { user } */
  me: async () => (await get('/auth/me')).data.user,
  /**
   * POST /auth/login { identifier, password, rememberMe? } -> { user } (sets the HttpOnly cookie).
   * rememberMe true = long-lived session, false = browser-session cookie; the choice is made by the
   * server, the browser never stores a token.
   */
  login: async ({ identifier, password, rememberMe }) =>
    (await post('/auth/login', { identifier, password, ...(typeof rememberMe === 'boolean' ? { rememberMe } : {}) })).data.user,
  /**
   * POST /auth/register { name, email, phone, password, role } -> { user } (starts the session cookie).
   * The Admin Dashboard always registers role "admin" (no role input exists in the UI). The backend accepts
   * only "customer" | "admin", allows a single admin in the database (409 ADMIN_ALREADY_EXISTS afterwards),
   * and the role sent by a browser is NOT proof of authority: see docs/AUTH-IMPLEMENTATION.md.
   */
  register: async ({ name, email, phone, password, role = 'admin' }) => (await post('/auth/register', { name, email, phone, password, role })).data.user,
  /** POST /auth/logout (clears the cookie) */
  logout: () => post('/auth/logout'),
  /** POST /auth/forgot-password { identifier } */
  forgotPassword: ({ identifier }) => post('/auth/forgot-password', { identifier }),
  /** POST /auth/reset-password { token, password } */
  resetPassword: ({ token, password }) => post('/auth/reset-password', { token, password }),
};
