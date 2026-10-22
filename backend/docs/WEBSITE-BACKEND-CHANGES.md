# WEBSITE-BACKEND-CHANGES.md

Backend changes made while integrating the PEHAN LY public website.
Principle followed: the website adapts to the existing backend. Only **one** small, additive, read-only endpoint was added, because no existing endpoint exposes the free-shipping threshold to guests.

## Summary
| # | Change | Type | Admin Dashboard affected? |
|---|---|---|---|
| 1 | `GET /api/v1/shipping/free-shipping` (public) | Additive endpoint | **No** |

No existing endpoint, model, validator, business rule or response shape was modified or removed.

## Change 1 - Public free-shipping information

**Why it was necessary.** The approved UX requires guests to see "Free Shipping Available" / "Add Rs. X more to unlock free shipping" using the *real* `ShippingRule` data. The only existing shipping endpoint (`/shipping/quote`) returns the price for one concrete cart + city, so it cannot tell the website what the free-shipping threshold is without guessing, and a hardcoded threshold would be a fake promise. The admin shipping-rule endpoints require staff authentication. I verified no existing public endpoint exposes this.

| Field | Value |
|---|---|
| Endpoint | `/api/v1/shipping/free-shipping` |
| Method | `GET` |
| Query | `country` (optional, defaults to `Pakistan`; strict validation, unknown params rejected) |
| Authentication | None (public, read-only, same exposure level as `/shipping/quote`) |
| Response | `{ available: boolean, country, minimumOrderAmount: number \| null, ruleName: string \| null }` |
| Logic | Lowest `minimumOrderAmount` among **active** `free_shipping` rules for the country. `available:false` when none. |
| Affected module | Shipping rules |
| Frontend feature | Announcement bar, PDP delivery strip, cart free-shipping progress bar, checkout "add Rs. X" hint, home benefits strip |
| Admin Dashboard affected | No. Admin routes/contracts untouched; the rule data it manages is only read. |
| Backward compatible | Yes (new route only) |
| Architecture | route -> validate middleware -> controller -> service -> `ShippingRule` model (existing model reused, no duplicated logic) |

### Files
| File | Action | Notes |
|---|---|---|
| `src/services/shippingRule.service.js` | UPDATE | adds exported `getFreeShippingInfo({ country })` |
| `src/controllers/shippingRule.controller.js` | UPDATE | adds `freeShippingInfo` handler |
| `src/validators/shippingRule.validators.js` | UPDATE | adds strict `freeShippingQuery` |
| `src/routes/shippingRule.routes.js` | UPDATE | adds public `GET /free-shipping` (mounted under `/shipping`) |
| `test/free-shipping.test.js` | CREATE | 4 tests: lowest-threshold selection + country filter, no-rule case, validator defaults/strictness, route wiring |
| `docs/API_ROUTES.md`, `docs/API_REQUESTS.md`, `postman/*.json` | UPDATE (regenerated) | by `scripts/list-routes.js` / `scripts/generate-postman.js`; 0 validation problems |

### Tests
- New: `test/free-shipping.test.js` (4 tests).
- Full backend suite after the change: **101 tests, 101 passing** (`npm test`).
- Not run: integration tests that need a live MongoDB (none available in the build environment).

## Behaviour NOT changed (explicitly)
- Coupons: `POST /coupons/validate` and order creation already reject guests (`COUPON_AUTH_REQUIRED`); the website only mirrors this for UX. No change.
- Orders: COD only; the website does not offer other payment methods. No change.
- Pricing: the website never sends prices/totals; the backend recomputes from SKUs. No change.

## Needs a backend decision (not implemented - no change made)
These are website needs the current contract cannot serve. They were **not** added because they are product decisions, not obvious additions:
1. **Coupon discovery for registered customers.** The `Coupon` model has no "publicly listable" flag; a "list active coupons" endpoint would expose every code (including private/targeted ones) to all logged-in users. Recommended: add `isPublic`/`audience` to `Coupon` and a `GET /coupons/available` for authenticated customers. Until then the website supports code entry only.
2. **Wholesale MOQ / tier pricing.** The `Wholesale` model has no tiers or MOQ; the website therefore runs wholesale as request-for-quote.
3. **Wishlist API** (wishlist is device-local), **catalog filters** for colour/price/size/GSM, **online payment (JazzCash/Raast)**, **tax line (GST)** - see the feature map in `IMPLEMENTATION-REPORT.md`.

---

# Update: multi-currency and authentication (PKR + USD)

These changes are **additive and backward compatible**: every existing request and response still works unchanged as PKR. The Admin Dashboard consumes the same contract. Full detail: `MULTI-CURRENCY-IMPLEMENTATION.md` and `AUTH-IMPLEMENTATION.md`. No new routes were added, so `API_ROUTES.md` is unchanged.

| # | Change | Type | Admin affected? |
|---|---|---|---|
| 2 | Optional `priceUSD` / `compareAtPriceUSD` on SKUs; USD fields on public product views (`priceMinUSD`, `priceMaxUSD`, `currencies`) | Additive fields | Yes (new inputs in the product editor) |
| 3 | `GET /catalog/products?currency=USD` sorts by USD price | Additive optional query | No |
| 4 | Coupon USD terms (`discountValueUSD`, `minimumOrderAmountUSD`, `maximumDiscountAmountUSD`); `currency` on validate | Additive fields | Yes (coupon form) |
| 5 | Shipping rules carry `currency` (default PKR); `/shipping/quote` and `/shipping/free-shipping?currency=` are currency-scoped, no cross-currency fallback | Additive field/query | Yes (rule form) |
| 6 | `POST /orders` accepts optional `currency`; orders snapshot `currency`; priced from the matching SKU price | Additive | Yes (order display) |
| 7 | USD checkout refused with `409 USD_PAYMENT_UNAVAILABLE`; payment ledger refuses non-PKR | Guard | No |
| 8 | `GET /settings/public` adds `currencies: {base, supported, paymentMethods}` | Additive field | No |
| 9 | `POST /auth/login` accepts optional `rememberMe`; `ADMIN_PASSWORD_RESET_URL` / `REMEMBER_ME_DAYS` env | Additive | Yes (login page) |

Architecture followed: route -> validator -> controller -> service -> model, reusing existing services. Legacy documents with no currency are treated as PKR; no data migration is required.

**Open contract gaps (marked BLOCKED - BACKEND CONTRACT MISSING):** USD payment provider, international address/country contract, staff invite/activation, per-currency admin analytics.

| 10 | Shared origin policy (`originPolicy.js`, `originGuard.js`); rejected origins are logged and, outside production, named in the 403 message; dev-only loopback aliases; JazzCash return exempt from CORS as it already was from CSRF origin; startup prints effective `corsOrigins` | Behaviour fix, no contract change | No |
| 11 | MongoDB startup retries for transient DNS/network failures (`MONGO_CONNECT_RETRIES`, `MONGO_CONNECT_RETRY_DELAY_MS`) with an SRV-DNS hint | Additive env | No |

See `AUTH-DEBUG-REPORT.md`.
| 12 | `POST /auth/register` accepts optional `role` (`customer` \| `admin`); max one admin via unique partial index `unique_single_admin` + pre-check; 409 `ADMIN_ALREADY_EXISTS`; E11000 mapped to 409; `npm run ensure-admin-index` | Additive field + index | Yes (Register sends `admin`) |

Security note: a client-supplied role does not authenticate it; first-admin takeover and forged requests are not prevented (see `AUTH-IMPLEMENTATION.md`).
