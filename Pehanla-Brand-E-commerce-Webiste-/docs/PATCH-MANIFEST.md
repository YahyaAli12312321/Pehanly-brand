# PATCH-MANIFEST.md

Each PATCH zip contains only files that changed or were added relative to the previous delivered version, plus `docs/`. Each full `-Updated.zip` is the complete project (no `node_modules`, `dist` or `.env`). Backend files are never mixed into frontend zips.

**Order:** backend patch -> admin patch -> website patch.

## Backend - `PEHANLY-Backend-MultiCurrency-PATCH.zip`

Copy over the backend root. No new dependencies. No new routes. No data migration (legacy documents without a currency are PKR). New optional env: `REMEMBER_ME_DAYS` (default 30), `ADMIN_PASSWORD_RESET_URL`. Run `MONGODB_TEST_URI=<test db> npm test`.

| Action | File |
|---|---|
| UPDATE | `.env.example` |
| UPDATE | `docs/API.md` |
| UPDATE | `docs/API_REQUESTS.md` |
| UPDATE | `postman/PEHANLY.postman_collection.json` |
| UPDATE | `src/config/env.js` |
| ADD | `src/constants/Currency.js` |
| UPDATE | `src/controllers/auth.controller.js` |
| UPDATE | `src/controllers/coupon.controller.js` |
| UPDATE | `src/models/Coupon.js` |
| UPDATE | `src/models/ShippingRule.js` |
| UPDATE | `src/models/Sku.js` |
| UPDATE | `src/models/order.model.js` |
| UPDATE | `src/services/auth.service.js` |
| UPDATE | `src/services/catalog.service.js` |
| UPDATE | `src/services/coupon.service.js` |
| UPDATE | `src/services/customer.service.js` |
| UPDATE | `src/services/email.service.js` |
| UPDATE | `src/services/order.service.js` |
| UPDATE | `src/services/payment.service.js` |
| UPDATE | `src/services/settings.service.js` |
| UPDATE | `src/services/shippingRule.service.js` |
| UPDATE | `src/services/variant.service.js` |
| UPDATE | `src/utils/presenter.js` |
| UPDATE | `src/validators/auth.validators.js` |
| UPDATE | `src/validators/catalog.validators.js` |
| UPDATE | `src/validators/coupon.validators.js` |
| UPDATE | `src/validators/order.validators.js` |
| UPDATE | `src/validators/product.validators.js` |
| UPDATE | `src/validators/shippingRule.validators.js` |
| ADD | `test/currency.test.js` |
| UPDATE | `test/free-shipping.test.js` |
| ADD | `docs/*.md` (documentation) |

## Admin Dashboard - `PEHANLY-Admin-Dashboard-PATCH.zip`

Copy over the admin root. No new dependencies. Deploy the backend patch first (the new fields and `rememberMe` are sent to it). Then `npm ci && npm run lint && npx vitest run && npm run build`.

| Action | File |
|---|---|
| ADD | `e2e/smoke.mocked-api.cjs` |
| UPDATE | `src/App.jsx` |
| ADD | `src/components/auth/AuthShell.jsx` |
| ADD | `src/components/auth/PasswordInput.jsx` |
| UPDATE | `src/components/products/ProductEditor.jsx` |
| UPDATE | `src/components/products/VariantCard.jsx` |
| UPDATE | `src/components/products/variantDraft.js` |
| UPDATE | `src/hooks/useAuth.js` |
| ADD | `src/lib/authNotice.js` |
| ADD | `src/lib/passwordRules.js` |
| ADD | `src/lib/passwordRules.test.js` |
| UPDATE | `src/pages/CouponsPage.jsx` |
| ADD | `src/pages/ForgotPasswordPage.jsx` |
| UPDATE | `src/pages/LoginPage.jsx` |
| UPDATE | `src/pages/OrdersPage.jsx` |
| ADD | `src/pages/ResetPasswordPage.jsx` |
| UPDATE | `src/pages/SettingsPage.jsx` |
| UPDATE | `src/services/authApi.js` |
| UPDATE | `src/services/productsApi.js` |
| ADD | `docs/*.md` (documentation) |

## Customer Website - `PEHANLY-Customer-Website-PATCH.zip`

Copy over the website root. No new dependencies. Deploy the backend patch first. Then `npm ci && npm run lint && npx vitest run && npm run build`.

| Action | File |
|---|---|
| ADD | `e2e/smoke.mocked-api.cjs` |
| ADD | `src/components/CurrencySelector.jsx` |
| UPDATE | `src/components/Header.jsx` |
| UPDATE | `src/components/SearchModal.jsx` |
| UPDATE | `src/hooks/useCartPricing.js` |
| ADD | `src/hooks/usePaymentAvailability.js` |
| UPDATE | `src/hooks/useQueries.js` |
| UPDATE | `src/main.jsx` |
| UPDATE | `src/pages/AccountPage.jsx` |
| UPDATE | `src/pages/CartPage.jsx` |
| UPDATE | `src/pages/CheckoutPage.jsx` |
| UPDATE | `src/pages/HomePage.jsx` |
| UPDATE | `src/pages/ProductDetailPage.jsx` |
| UPDATE | `src/pages/ShopPage.jsx` |
| UPDATE | `src/pages/TrackOrderPage.jsx` |
| UPDATE | `src/pages/WishlistPage.jsx` |
| UPDATE | `src/seo/schema.js` |
| UPDATE | `src/services/accountApi.js` |
| ADD | `src/store/useCurrencyStore.js` |
| UPDATE | `src/test/store.test.js` |
| UPDATE | `src/test/units.test.js` |
| ADD | `src/utils/currency.js` |
| UPDATE | `src/utils/product.js` |
| ADD | `docs/*.md` (documentation) |

## Register update (frontend only) - `PEHANLY-Admin-Dashboard-Register-PATCH.zip`

Only the files changed since the previous Admin delivery. No backend change. Copy over the admin root, then `npm ci && npm run lint && npx vitest run && npm run build`.

| Action | File |
|---|---|
| ADD | `src/components/auth/RegisterForm.jsx` |
| UPDATE | `src/pages/LoginPage.jsx` (Login/Register card states, double-submit guard) |
| UPDATE | `src/hooks/useAuth.js` (`register`: register -> me -> clear customer cookie) |
| UPDATE | `src/services/authApi.js` (`register`) |
| UPDATE | `src/lib/passwordRules.js`, `src/lib/passwordRules.test.js` |
| UPDATE | `src/index.css` (reduced-motion-safe card transition) |
| UPDATE | `e2e/smoke.mocked-api.cjs` (register scenarios) |
| UPDATE | `docs/AUTH-IMPLEMENTATION.md`, `docs/VERIFICATION.md`, `docs/PATCH-MANIFEST.md` |

## Auth/origin debugging round (all three projects, full ZIPs)

| Project | Files |
|---|---|
| Backend | ADD `src/utils/originPolicy.js`, `src/middleware/originGuard.js`, `test/origin-and-session.test.js`, `test/db-retry.test.js`; UPDATE `src/middleware/cors.js`, `src/middleware/csrfOrigin.js`, `src/config/env.js`, `src/config/db.js`, `server.js`, `.env.example` |
| Admin | UPDATE `vite.config.ts`, `.env.example`, `README.md`, `src/lib/apiError.js`, `src/lib/apiError.test.js` (plus the earlier Register files) |
| Website | UPDATE `vite.config.ts`, `.env.example`, `README.md`, `src/services/http.js`, `src/test/units.test.js` |

## Role registration + one-admin limit (all three projects, full ZIPs)

| Project | Files |
|---|---|
| Backend | ADD `scripts/ensure-admin-index.js`, `test/admin-registration.test.js`; UPDATE `src/models/User.js`, `src/validators/auth.validators.js`, `src/services/auth.service.js`, `scripts/create-admin.js`, `package.json` (script), `docs/API.md`, `test/origin-and-session.test.js`, `test/currency.test.js` |
| Admin | UPDATE `src/services/authApi.js`, `src/components/auth/RegisterForm.jsx`, `src/hooks/useAuth.js`, `src/pages/LoginPage.jsx`, `e2e/smoke.mocked-api.cjs` |
| Website | UPDATE `src/services/accountApi.js`, `src/pages/AccountPage.jsx`, `src/test/units.test.js` |

After deploying: `npm run ensure-admin-index` (backend).
