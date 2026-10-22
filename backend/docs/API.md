# API reference (conventions and flows)

Base path: `/api/v1`. The complete route list is `docs/API_ROUTES.md`
(regenerate with `node scripts/list-routes.js`).

## Conventions

* JSON in/out. Success: `{ success: true, message?, data, meta? }`.
  Error: `{ success: false, message, code, errors? }` with a proper HTTP status.
* Validation: Zod strict schemas; unknown fields are rejected (422 `VALIDATION_ERROR`).
* Auth: HttpOnly cookie `pl_session` (HS256 JWT, claims `sub`, `tv`).
  Changing password or logging out everywhere bumps `tokenVersion` and revokes sessions.
* CSRF: state-changing requests must come from an allowed origin (`CORS_ORIGINS`).
  The only exemption is the gateway callback `POST /payments/jazzcash/return`.
* Rate limits: global limiter plus stricter limiters on auth/payment routes
  (in-process; not shared across instances).

## Roles and permissions

Roles: `customer`, `staff`, `admin` (owner). Admin has every permission.
Staff receive explicit permissions `<module>.read` / `<module>.manage`
(`manage` implies `read`). Admin routes are gated per module and method:
GET needs `read`, writes need `manage`.

Owner-only (never delegable): `/admin/staff`, `/admin/notifications`, `/admin/devices`, `/admin/audit-logs`.

## Audit trail

Every successful back-office write and every refused attempt (403) is recorded automatically
(`http.post|patch|put|delete` / `http.denied`) with the route pattern and the **field names** of the body
(never the values). Domain services add detailed entries (`inventory.adjust`, `product.status`, `staff.*`,
`media.deleted`, `auth.login` for staff/admin, ...). The owner reads them with
`GET /admin/audit-logs?action=&entityType=&entityId=&admin=&from=&to=&page=&limit=`.

## Public / customer endpoints (summary)

| Area | Paths |
| --- | --- |
| Auth | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/forgot-password`, `/auth/reset-password` |
| Account (signed-in, own data) | `GET/PATCH /account`, `POST /account/change-password`, `POST /account/logout-other-sessions`, `GET/POST /account/addresses`, `PATCH/DELETE /account/addresses/:addressId`, `PUT/DELETE /account/avatar` (avatar = a `purpose: avatar` upload of the same user) |
| Catalog (public, read-only) | `GET /catalog/categories`, `/catalog/products`, `/catalog/products/:slug` |
| Store settings (public subset) | `GET /settings/public` |
| Orders / checkout | `POST /orders`, `GET /orders/my[/:id]`, `POST /orders/guest/track`, `POST /orders/my/:id/cancellation`, `POST /shipping/calculate` |
| Payments | `POST /payments/orders/:orderId/cod`, `POST /payments/orders/:orderId/jazzcash`, `POST /payments/jazzcash/return` |
| Media (signed-in) | `POST /media` (multipart `file`, `purpose`), `GET /media/mine`, `DELETE /media/:id` |
| Returns | `POST /returns/orders/:id`, `GET /returns/my[/:id]` |
| Wholesale / manufacturing / printing / quotes | `/wholesale/*`, `/manufacturing/*`, `/printing/*`, `/quotes/*` |
| Reviews, coupons, banners | `/reviews/products/:productId[...]`, `/reviews/my`, `POST /coupons/validate`, `GET /banners`, banner click/impression |
| Health | `GET /health` |

The catalog never returns stock counts or wholesale pricing: only `inStock`
and a `maxQuantity` capped at 20.

## Admin endpoints (summary)

`/admin/{analytics,banners,cancellations,categories,coupons,customers,dashboard,inventory,manufacturing,media,orders,payments,printing,products,quotes,returns,reviews,settings,shipping-rules,wholesale}`
and owner-only `/admin/{staff,notifications,devices,audit-logs}`. Exact methods: `docs/API_ROUTES.md`.

## Payment flows

**COD** - the COD payment row is created inside the checkout transaction.
Admin confirms collection with `confirmCodPayment`.

**JazzCash (hosted page redirection)** - `POST /payments/orders/:orderId/jazzcash`
creates a pending Payment and returns the form fields (including the
HMAC-SHA256 `pp_SecureHash`) and checkout URL; the browser posts them to JazzCash.
JazzCash then posts to `/payments/jazzcash/return`; the server verifies the hash
(constant-time), checks merchant/amount/reference, settles the payment once
(idempotent), and redirects the browser to `${CLIENT_URL}/payment/result`.
This has **not** been exercised against the real sandbox or live gateway.
Guest initiation relies on the unguessable order id.

## Media

Folders: `pehanly/<env>/<purpose-folder>`. Purposes and limits live in
`src/constants/Media.js`. Staff may upload catalog/banner assets (with the
module permission); customers may upload only their own artwork/reference files.
`mediaUrl` fields in validators accept only `https://res.cloudinary.com/<cloud>/...`
when Cloudinary is configured.

## Multi-currency (PKR + USD)

Additive and backward compatible: every existing request/response keeps working as PKR.

- **Currencies**: `PKR` (base, all legacy data) and `USD`. `GET /settings/public` exposes `currencies: { base, supported, paymentMethods }`.
- **USD prices are merchant-entered, never converted.** SKUs carry optional `priceUSD` / `compareAtPriceUSD`; coupons carry optional `discountValueUSD` / `minimumOrderAmountUSD` / `maximumDiscountAmountUSD`; shipping rules carry `currency` (default `PKR`).
- **Catalog**: product cards add `priceMinUSD`, `priceMaxUSD` and `currencies` (`['PKR','USD']` only when a sellable SKU has a USD price). `GET /catalog/products?currency=USD` sorts by the USD price.
- **Coupons** (`POST /coupons/validate`, order creation): optional `currency`. A USD order can use a coupon only if it defines the USD terms it needs (`COUPON_CURRENCY_UNSUPPORTED` otherwise). Registered customers only, as before.
- **Shipping** (`/shipping/quote`, `/shipping/free-shipping?currency=`): rules only match their own currency and country; there is no PKR fallback (`SHIPPING_NOT_AVAILABLE`).
- **Orders**: `POST /orders` accepts optional `currency` (default `PKR`). Items still send only `sku` + `quantity`; the backend prices them in that currency and snapshots `currency` on the order. A SKU without a USD price fails with `SKU_NOT_AVAILABLE_IN_CURRENCY`.
- **Payments**: `PAYMENT_METHODS_BY_CURRENCY = { PKR: ['cod'], USD: [] }`. **USD checkout is BLOCKED**: `POST /orders` with `currency: 'USD'` returns `409 USD_PAYMENT_UNAVAILABLE` before any database work. JazzCash stays PKR-only and the payment ledger refuses non-PKR orders (`PAYMENT_CURRENCY_UNSUPPORTED`).
- **Out of scope (PKR only)**: wholesale, custom manufacturing and printing quote flows.

## Authentication additions

- `POST /auth/login` accepts optional `rememberMe` (boolean). Omitted = unchanged 7-day cookie; `true` = `REMEMBER_ME_DAYS` (30); `false` = browser-session cookie with a 1-day JWT.
- Password reset emails for non-customer accounts link to `ADMIN_PASSWORD_RESET_URL` when configured (server config only, never from the request).
- `POST /auth/register` accepts `{ name, email, phone, password, role? }` with `role` = `customer` (default) or `admin`; `staff`, `owner` and any other value are `422`. **Only one admin may exist**: a second admin registration is `409 ADMIN_ALREADY_EXISTS` ("An admin account already exists. Additional admin registration is not allowed."), enforced by the unique partial index `unique_single_admin` (build/verify with `npm run ensure-admin-index`). Duplicate email/phone is `409 ACCOUNT_EXISTS`.
- **Security limitation:** a role supplied by a client does not authenticate it, so this does not prevent first-admin takeover or forged requests. See `docs/AUTH-IMPLEMENTATION.md`. Staff accounts are still created by an authenticated admin.
