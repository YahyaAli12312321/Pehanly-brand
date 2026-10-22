# AUTH-DEBUG-REPORT.md

> Note: the later role-registration update (see `AUTH-IMPLEMENTATION.md`) replaced the "public registration creates customers only" behaviour described below: `role` is now accepted (`customer` or `admin`, one admin maximum). The origin/CORS findings are unchanged.
 - registration 403 / "Origin not allowed", proxy ECONNREFUSED, MongoDB DNS

Investigated in the delivered code (all three projects were available). Evidence below is from running the real backend app, the real Vite dev proxy and a real Chromium; only database persistence was faked (no MongoDB is reachable from the build environment).

## Root cause report

### Issue 3 / 4 - `POST /auth/register` 403 and login "Origin not allowed"
**Found, by code trace and by reproducing it.** A 403 on `/auth/register` can only come from the browser-origin check. The register route has no auth guard and no role check (its only middleware is a rate limiter, which answers 429, and the body validator, which answers 422). The origin check exists in two places, which use the same rule: `src/middleware/cors.js` and `src/middleware/csrfOrigin.js`. Both answer `403 {"message":"Origin not allowed","code":"CORS_ORIGIN_NOT_ALLOWED"}` when the request's `Origin` header is not an **exact** match (scheme + host + port) of an entry in `CORS_ORIGINS`.

Reproduced against the real app with `CORS_ORIGINS=http://localhost:3000`:

| Request Origin | Result |
|---|---|
| `http://localhost:3000` | reaches the route (422/201) |
| `http://127.0.0.1:3000` | **403** |
| `http://localhost:3001` | **403** |
| `http://LOCALHOST:3000`, trailing `/`, other scheme | **403** |
| no Origin header (curl) | reaches the route |

The Vite proxy is NOT the cause: it forwards `Origin` unchanged (verified: `Origin: http://localhost:3000` through the proxy reaches the route; `http://127.0.0.1:3000` through the proxy gets the same 403). `changeOrigin` only rewrites `Host`. CORS and CSRF are therefore the correct place, and the check itself works as designed; with `http://localhost:3000` in `CORS_ORIGINS` a browser on `http://localhost:3000` is accepted.

**What I could not determine:** which origin your browser actually sent, because the 403 response body and the `Origin` header were not captured. The configuration you quote is correct for a browser on `http://localhost:3000`, so one of these must have been true when it failed (check them in this order):
1. **The browser was not on exactly `http://localhost:3000`.** The Admin Dashboard and the Customer Website both defaulted to port 3000 and Vite silently moves to 3001 when 3000 is busy, so the second app ran on `http://localhost:3001` (not in `CORS_ORIGINS`). Opening `http://127.0.0.1:3000`/`http://[::1]:3000` has the same effect.
2. **The API was running with an older `CORS_ORIGINS`** (it only reads `.env` at startup), or a `CORS_ORIGINS` exported in the shell/OS environment overrode `.env` (dotenv never overrides existing variables). The delivered `.env.example` also said `http://localhost:5173`, which does not match a frontend on 3000.

### Fixes (so this can no longer be a mystery)
- **Diagnosable rejection.** Every rejected origin is now logged with the received origin, method, path and the allowed list. Outside production the 403 message names the rejected origin and the configured ones; production keeps the bare `Origin not allowed`.
- **Effective origins are printed at startup** (`corsOrigins`), which exposes a stale or overridden `CORS_ORIGINS` immediately.
- **Dev loopback aliases:** in development/test only, `http://127.0.0.1:PORT` and `http://[::1]:PORT` are accepted when `http://localhost:PORT` is configured (same machine, same port). Never in production, never for non-loopback hosts. No wildcard, no weaker check in production.
- **One shared policy** (`originPolicy.js` / `originGuard.js`) so CORS and the CSRF check cannot disagree.
- **Vite `strictPort: true`** in both frontends and distinct dev ports (Admin 3000, Website 3001) so the origin cannot drift silently; the website's `.env.example`/README updated.
- **Frontend message:** a 403 `CORS_ORIGIN_NOT_ALLOWED` now says which address was refused (admin) / a clear customer message (website) instead of a bare "Origin not allowed".
- **Latent bug found and fixed in the previously delivered code:** the JazzCash gateway return POST is exempted from the CSRF origin check, but the CORS middleware ran first and answered it `403 CORS_ORIGIN_NOT_ALLOWED` (reproduced). The exemption now applies to CORS too (the request is still authenticated by its HMAC hash).

CSRF, CORS and authentication were not disabled or weakened.

### Issue 1 - Vite `ECONNREFUSED` on `/api/v1/auth/me`
Not an IPv6 problem on the frontend side. `ECONNREFUSED` from the proxy means nothing was listening at the proxy target at that moment: the backend had exited at startup (Issue 5), so every proxied call was refused. Vite listening on `[::1]:3000` only affects how you reach the frontend (`localhost` works, `127.0.0.1` does not); it does not affect the proxy to the backend. Hardening: the proxy default target is now `http://127.0.0.1:5000` (avoids `localhost` resolving to `::1` while the API listens on IPv4); override with `VITE_DEV_PROXY_TARGET` / `DEV_API_PROXY`.

### Issue 2 - `/auth/me` returns 401
Expected without a session. Verified the session works: register or login sets an HttpOnly `pl_session` cookie, and `/auth/me` then returns the user (see results).

### Issue 5 - MongoDB `querySrv ECONNREFUSED`
That error is a failed DNS SRV lookup of the Atlas hostname from your machine (network/VPN/DNS), not a bad password. The server used to exit on the first failure. `connectDBWithRetry` now retries transient failures (DNS/network/server selection) `MONGO_CONNECT_RETRIES` (4) times, `MONGO_CONNECT_RETRY_DELAY_MS` (3000) apart, then exits with a message explaining the SRV DNS cause and the non-SRV connection string alternative. Bad credentials and unsafe-target errors are not retried.

### Logout
`POST /auth/logout` clears the cookie. The stateless JWT itself is not revoked server-side (it expires on its own; password change/reset revokes via `tokenVersion`). Unchanged to preserve the architecture; "sign out everywhere" on logout would be a separate, deliberate change.

## Modified files
**Backend:** `src/utils/originPolicy.js` (new), `src/middleware/originGuard.js` (new), `src/middleware/cors.js`, `src/middleware/csrfOrigin.js`, `src/config/env.js`, `src/config/db.js`, `server.js`, `.env.example`, `test/origin-and-session.test.js` (new), `test/db-retry.test.js` (new).
**Admin:** `vite.config.ts`, `.env.example`, `README.md`, `src/lib/apiError.js`, `src/lib/apiError.test.js`.
**Website:** `vite.config.ts`, `.env.example`, `README.md`, `src/services/http.js`, `src/test/units.test.js`.

## Correct `.env.example` values
Backend:
```env
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
CLIENT_URL=http://localhost:3001
MONGO_CONNECT_RETRIES=4
MONGO_CONNECT_RETRY_DELAY_MS=3000
```
Admin (`:3000`): `VITE_API_BASE_URL=/api/v1`, `VITE_DEV_PROXY_TARGET=http://127.0.0.1:5000`.
Website (`:3001`): `VITE_API_BASE_URL=/api/v1`, `DEV_API_PROXY=http://127.0.0.1:5000`.
If your admin is the only frontend you run, `CORS_ORIGINS=http://localhost:3000` is enough. **Restart the API after editing**, and make sure no `CORS_ORIGINS` is set in your shell environment (PowerShell: `Get-ChildItem Env:CORS_ORIGINS`).

## Tests actually executed
- Backend: `npm test` 140/140 pass (18 new): exact origin policy, 403 on foreign origins with no session and nothing created, dev loopback aliases, preflight, JazzCash return not blocked by CORS, public registration cannot self-assign `role`/`permissions` (422), duplicate email/phone 409, register -> HttpOnly SameSite=Lax cookie -> `/auth/me` -> logout clears it -> `/auth/me` 401, login success / generic 401 / origin enforced on login, customer 403 vs anonymous 401 vs admin 200 on an admin route, forged cookie 401, Mongo retry classification and bounded retries.
- Real-stack browser test (real API code with faked persistence + real Vite proxy + Chromium): `GET /auth/me 401` -> `POST /auth/register 201` -> `GET /auth/me 200` -> logout; a customer is refused dashboard access; admin login 200 with an HttpOnly SameSite=Lax cookie not readable from JavaScript; the session survives a reload. Vite `strictPort` was also observed refusing to start on a busy port.
- Admin: 31 unit tests, type check, build. Website: 24 unit tests, ESLint 0 warnings, build.

## NOT executed
Nothing here was run against a real MongoDB Atlas cluster, your real `.env`, or your machine's Chrome/Windows networking. I cannot confirm which of the causes above matched your failing run; the new log line and message will show it on the next attempt.
