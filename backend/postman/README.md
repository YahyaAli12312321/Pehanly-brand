# Postman testing

Files (regenerate any time with `npm run postman`):

* `PEHANLY.postman_collection.json` - every route, grouped by module (+ `00 - Login`)
* `PEHANLY.local.postman_environment.json` - variables (`baseUrl=http://localhost:5000`)
* `../docs/API_REQUESTS.md` - the same requests as copy-paste text

Both JSON files are generated from the live router and the Zod validators, and each
example body is checked against its validator, so they cannot drift from the code.

## Import
Postman > Import > select both JSON files > choose the **PEHANLY Local** environment.
Then set `adminIdentifier` and `adminPassword` (your owner account; create it with
`npm run create-admin`). No credentials are stored in the files.
Use a **development** database; the flows create real records.

## Authentication
Session cookie `pl_session` (HttpOnly). Postman keeps it in the cookie jar; there is no bearer token.
Only one login is active at a time - run the matching request in `00 - Login` when you switch role.

## Suggested order (smoke test)
1. `GET /health`
2. Customer: `POST /auth/register` -> `Login as Customer` -> `GET /auth/me`
3. Owner: `Login as Owner` -> `POST /admin/categories` -> `POST /media` (purpose `product_image`, choose an image) -> `POST /admin/products` -> `POST /admin/products/:id/variants`
4. Public: `GET /catalog/categories`, `GET /catalog/products`
5. Staff: `POST /admin/staff` (as owner) -> `Login as Staff` -> try admin routes (403 `PERMISSION_DENIED` where not granted)
6. Customer: `POST /orders` (needs a real SKU id in `skuId`) -> `GET /orders/my` -> `POST /orders/my/:id/cancellation`
7. Owner: `PATCH /admin/orders/:id/status`, `/admin/payments/...`, `/admin/returns/...`

`skuId` / `variantId` are not auto-captured because the variant response shape is not
a single id; copy them from the `POST /admin/products/:id/variants` or `GET /admin/products/:id` response.

## Tests included
Each request asserts: no 5xx, JSON envelope (`success`, `message`), `success=true` on the
expected status, error shape (`success=false`, `code`) on 4xx, pagination `meta` on lists,
and saves created ids (`categoryId`, `productId`, `orderId`, ...) into the environment.
The JazzCash return request computes `pp_SecureHash` in a pre-request script
(needs `jazzcashIntegritySalt`); it simulates a gateway callback and does not prove the real gateway works.
