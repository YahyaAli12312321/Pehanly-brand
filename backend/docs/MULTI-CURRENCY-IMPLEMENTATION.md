# MULTI-CURRENCY-IMPLEMENTATION.md

PKR and USD only. One backend contract is shared by the backend, the Admin Dashboard and the Customer Website. The backend is authoritative: the browser never computes prices, coupons, shipping or totals.

## Status at a glance
| Area | Status |
|---|---|
| Backend currency model, pricing, coupons, shipping, order snapshot | IMPLEMENTED, unit-tested (stubbed models), NOT LIVE-VERIFIED against MongoDB |
| Admin: USD price / coupon / shipping-rule fields | IMPLEMENTED, type-checked and built, NOT LIVE-VERIFIED against a real backend |
| Website: detection, header selector, USD display, cart, PDP, shop, search, wishlist, account, tracking | IMPLEMENTED, mocked-API browser smoke test passes, NOT LIVE-VERIFIED |
| USD payment / USD checkout | **BLOCKED** (see below) |
| International address / country form | **BLOCKED** (not built; USD checkout is blocked anyway) |
| Wholesale, custom manufacturing, printing quotes in USD | Not supported: PKR only |

## Rules that were followed
- USD selling prices are **merchant-entered**. There is no FX rate, no conversion and no `PKR / rate` anywhere (a test scans the source for this).
- A transaction has **one** currency. Orders snapshot `currency` and all money at creation. Legacy documents without a currency are PKR.
- Coupons and free shipping are currency-aware in backend logic. A USD order can use a coupon only if the coupon defines the USD terms it needs, and only a USD shipping rule can apply to a USD order. There is no silent fallback to a PKR rule or a PKR coupon value.
- Coupons remain registered-customers-only. Free shipping remains backend-driven and is not guest-exclusive. Ladies' Shoes remain retail-only.
- Nothing is silently converted to PKR at payment time.

## Backend
| Change | Where |
|---|---|
| Currency constants and exact money helpers | `src/constants/Currency.js` |
| `priceUSD`, `compareAtPriceUSD` (optional) | `Sku` model, product validators, `variant.service.js` (USD price changes audited) |
| Public catalog: `priceUSD`, `priceMinUSD/MaxUSD`, `currencies`, `?currency=USD` sort | `catalog.service.js`, `catalog.validators.js` |
| Coupon USD terms | `Coupon` model, validators, `coupon.service.js` (`termsForCurrency`) |
| Shipping rules carry `currency`; quote and free-shipping are currency-scoped | `ShippingRule`, `shippingRule.service.js` |
| Order `currency` + priced from the matching SKU price | `order.model.js`, `order.service.js` |
| Public settings expose `currencies` | `settings.service.js` |
| Payment guard | `payment.service.js`, `PAYMENT_METHODS_BY_CURRENCY` |

Error codes: `USD_PAYMENT_UNAVAILABLE` (409), `SKU_NOT_AVAILABLE_IN_CURRENCY`, `COUPON_CURRENCY_UNSUPPORTED`, `SHIPPING_NOT_AVAILABLE`, `PAYMENT_CURRENCY_UNSUPPORTED`.

Tests: `test/currency.test.js` (21 tests). Full suite 122/122 passing with stubbed models.

## Admin Dashboard
- Product editor: "Retail (USD)" and "Compare-at (USD)" per size, with validation and a note that there is no automatic conversion. Empty USD fields send `null` on update.
- Coupons: USD discount, minimum and maximum (percentage coupons take no USD discount value).
- Shipping rules (Settings): a Currency select; amount labels follow the currency.
- Orders list/detail: money is formatted in each order's own currency.
- **Known limitation**: dashboard analytics add up PKR amounts. This is only safe because USD orders cannot be created yet. Before USD payment is enabled, analytics must be split per currency.

## Customer Website
- **Default currency** is detected once for the *initial* preference only: Pakistan time zone or `PK`/`ur` language gives PKR; a known non-Pakistan time zone gives USD; crawlers, headless and automation always get PKR, so the indexed storefront stays the Pakistani one. Detection is a heuristic, not geolocation.
- **Manual selector** in the header ("PKR - Pakistani Rupee" / "USD - US Dollar"), also in the mobile drawer. A manual choice always overrides detection and is the **only** thing persisted (`pehanly-currency-v1` holds `{currency, source:'manual'}`; no auth data, no PII).
- The currency is **never in the URL**: no `?currency=` pages, canonicals are unchanged.
- Prices shown come straight from backend fields (`price` / `priceUSD`). A size with no USD price is disabled in USD; a product with no USD price shows "Not sold in USD".
- Free-shipping messages use the backend rule for the selected currency (`/shipping/free-shipping?currency=USD`). The PKR threshold is never converted in the browser.
- Cart/checkout/account/tracking all use the order's or selected currency; an order is always displayed in its own snapshot currency.
- **SEO**: product JSON-LD does not depend on the selected currency. It always emits the real PKR offer and adds a USD offer only when a real USD price exists; `aggregateRating` only with real reviews.

## BLOCKED - BACKEND CONTRACT MISSING: USD payment
- JazzCash is PKR-only (`pp_TxnCurrency: 'PKR'`) and the payment ledger is PKR-only.
- COD for international orders is **not assumed** to exist.
- No international provider (Stripe, PayPal, etc.) has been added; none was approved.
- Result: a USD cart can be viewed, but checkout is disabled in the UI ("Payment not available in USD", with a "Switch to PKR" action) and the backend refuses `currency: 'USD'` orders with `409 USD_PAYMENT_UNAVAILABLE`.
- To unlock: approve a USD-capable provider or an international COD policy, add it to `PAYMENT_METHODS_BY_CURRENCY.USD`, add a country/address contract, and split admin analytics per currency.
