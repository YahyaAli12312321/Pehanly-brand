# VERIFICATION.md

Honest record of what was and was not verified. "Build passes" is not treated as "production ready".

## What was run (clean room: fresh copy without node_modules/dist/.env, then `npm ci`)
| Project | Checks | Result |
|---|---|---|
| Backend | `npm ci`, `npm test` (122 tests, models stubbed, dummy `MONGODB_TEST_URI`) | 122 pass / 0 fail |
| Admin Dashboard | `npm ci`, `tsc --noEmit`, `vitest` (25 tests), `vite build` | all pass |
| Customer Website | `npm ci`, `eslint` (0 warnings), `vitest` (23 tests), `vite build` + postbuild | all pass |
| Admin browser smoke (mocked API) | 42 checks: layout at desktop/tablet/mobile, no fake status, show/hide password, keyboard, validation, bad credentials, customer refused, login payload, no auth in storage, phone login, protected-route redirect, session expiry, forgot/reset flows | 42/42 pass |
| Website browser smoke (mocked API) | route health (one h1/main, no console errors), SEO, guest and registered purchase flow, coupon rules, currency: PKR default, USD switch, persistence, no `?currency=` URL, USD prices, disabled sizes, USD checkout blocked, switch back, clean canonical, JSON-LD, international and bot detection, mobile drawer selector | all checks pass |
| Security scans | no tokens/Bearer in browser storage or bundle; no backend secrets in the website bundle; no FX conversion in source | pass |

## Update: Register in the admin auth card
Admin: `tsc` clean, vitest 30/30 (adds registration rules), `vite build` ok. Browser smoke (mocked API) 64/64: login/register toggles in place without navigation, fields match the backend contract and no role field, client validation, password mismatch, show/hide, duplicate email and phone mapped to their inputs, 422 field error, loading state, double-click sends one request, success returns to Sign In with the customer-account notice, customer session cleared, dashboard still protected, nothing auth-related in storage, login still works, mobile and tablet have no overflow. NOT verified against a running backend.

## Update: auth/origin debugging round
Backend 140/140 (adds `origin-and-session.test.js`, `db-retry.test.js`); admin 31 tests; website 24 tests, ESLint 0 warnings. A real-stack browser run (real API code, faked persistence, real Vite proxy, Chromium) verified register 201, session cookie (HttpOnly, SameSite=Lax), `/auth/me`, logout, customer refused for the dashboard, admin login and reload persistence. See `AUTH-DEBUG-REPORT.md`. Not run against MongoDB Atlas or the user's own environment.

## Update: role registration and one-admin limit
Backend 151/151 (new `admin-registration.test.js`: customer and multiple customers, first admin 201, second admin 409 with the specified message, 6 concurrent admin registrations -> exactly one 201 and five 409 and no 500, invalid roles 422, admin/customer/legacy login, admin permissions 200, customer 403 and anonymous 401 on an admin endpoint, duplicate email/phone, duplicate-key races, legacy user identity and password hash unchanged, schema declares `unique_single_admin`). Admin browser smoke (mocked API) 66/66; website 25 tests; real-stack browser run (real API code with faked persistence + real Vite proxy): first admin registers through the UI and lands in the dashboard with an HttpOnly cookie, second admin is refused with the 409 message, 4 concurrent customer registrations all 201.
**NOT verified:** the unique index in a real MongoDB (none reachable; run `npm run ensure-admin-index`), and no live security guarantee: see the SECURITY LIMITATIONS in `AUTH-IMPLEMENTATION.md`. Documented plainly: the design does not prevent first-admin takeover or forged registration requests.

## Classification
**VERIFIED (automated, against stubs/mocks)**
- Backend currency maths, SKU/coupon/shipping/order validation and error codes
- Remember Me cookie/JWT lifetime logic; admin reset URL selection; one-admin rule and role validation (against an in-memory fake that enforces the same unique index)
- Admin auth UI behaviour and layout; admin USD form fields (type-check + build)
- Website currency detection, selector, persistence, price display, cart and checkout gating, JSON-LD, clean URLs

**IMPLEMENTED BUT NOT LIVE-VERIFIED**
- Everything above against a **real running backend and MongoDB** (none was available)
- Real password-reset emails and cookie behaviour across the real production domains (`COOKIE_SAMESITE`, HTTPS)
- Admin screens against real data; website against the real catalog

**PARTIAL**
- Admin dashboard analytics add PKR amounts only (safe only while USD orders cannot exist)
- Wholesale, manufacturing and printing flows are PKR only
- Currency detection is a heuristic (time zone and language), not geolocation

**BLOCKED - BACKEND CONTRACT MISSING**
- USD payment/checkout (no USD-capable provider; JazzCash is PKR-only; international COD not assumed)
- International address / country form
- Staff invite and activation
- Live JazzCash verification: **not performed**

## Not done / not claimed
No live payment verification was performed. No provider was added. Nothing is claimed production-ready; the above list is what must be closed first.

## How to re-run
Backend: `MONGODB_TEST_URI=<a database whose name contains "test"> npm test`. Admin/Website: `npm ci && npm run lint && npx vitest run && npm run build`. Website smoke: `npm run build && npx vite preview --port 3998`, then `node e2e/smoke.mocked-api.cjs` (needs Playwright).

## Product variants / SKUs fix - verification
Executed: `tsc --noEmit` OK; vitest 35/35; `vite build` OK; browser smoke 66/66; product browser test 21/21 against a STATEFUL FAKE of the catalog API
(2 colours x M/L = 4 SKUs saved with the single Save Product button; ledger rows, table values 2 colors / 4 SKUs / 28 pcs / PKR 4,500-4,800, refresh, edit with read-only existing stock and a new initial-stock SKU, partial failure with no auto-delete).
NOT executed: anything against a real MongoDB, real backend restart persistence. See docs/PRODUCT-VARIANTS-FIX.md section 4 for the checks to run.
