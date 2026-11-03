# PEHANLY Backend

Node.js 20+ / Express 4 / Mongoose 8 (CommonJS). REST API under `/api/v1`.
Cookie-JWT sessions, Zod validation, MongoDB transactions, Cloudinary media,
COD + JazzCash (sandbox-ready) payments, role/permission based admin API.

> Status: release candidate `1.0.0-rc.1`. The offline test suite passes.
> Everything that needs a live MongoDB replica set, Cloudinary account,
> JazzCash gateway or KeyDB is **written but not yet verified** -
> see `docs/PRODUCTION_CHECKLIST.md` and `docs/REPORT.md`.

## Quick start

```bash
npm ci
cp .env.example .env        # fill in real values (never commit .env)
npm test                    # offline suite, no database connection needed*
npm run sync-indexes        # create indexes (autoIndex is off in production)
ADMIN_EMAIL=owner@example.com ADMIN_PHONE=03001234567 \
ADMIN_NAME="Owner" ADMIN_PASSWORD='a-long-secret-12+' npm run create-admin
npm run dev                 # or: npm start
npm run worker              # optional background worker (needs QUEUE_URL)
```

\* `npm test` still requires `MONGODB_TEST_URI` to be set (and its database
name must contain "test" and differ from `MONGODB_URI`). The offline suite does
not write to it.

## Environments

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | dev / production database (Atlas) |
| `MONGODB_TEST_URI` | **only** database tests may touch |
| `NODE_ENV` | `development`, `test`, `production` |

Tests refuse to run if the test URI is missing, equals the main URI, or its
database name does not contain "test". Use separate Atlas databases (ideally
separate clusters/users) for dev, test and production.

## Layout

```
server.js                 process entry (connect DB, listen, graceful shutdown)
src/app.js                Express pipeline
src/config/               env, db, mongoUri guard, cloudinary, redis
src/constants/            enums, transition table, permissions, media rules
src/models/               Mongoose models
src/services/             business logic (transactions live here)
src/controllers/          thin HTTP adapters
src/validators/           Zod schemas
src/routes/               route tables; admin routes gated per module
src/middleware/           auth, RBAC, rate limit, upload, csrf-origin, errors
src/jobs/                 maintenance jobs (expire quotes, cleanup media)
scripts/                  create-admin, sync-indexes, reconcile-stock, worker, list-routes
test/                     offline suite; test/integration needs a replica set
docs/                     API, deployment, checklist, report
```

## Key rules (enforced in code)

* Stock: checkout **reserves**, cancel **releases**, SHIPPED **commits** (once,
  guarded by `order.stockCommittedAt`). Retail and wholesale orders hold stock.
* Order status changes go through one transition table (`constants/Order.js`).
* Paid orders cannot be cancelled; they go through returns/refunds.
* Quotes: request -> approval -> quote -> acceptance -> order. Only ACCEPTED
  quotes convert. Rejecting a quote reopens its request.
* Coupons: registered customers only; released on cancellation.
* No notifications/FCM/email inside a Mongo transaction (post-commit, best effort).
* Notifications, devices and staff management are owner (admin) only.
* Uploads: server-generated public IDs, magic-byte sniffing (JPEG/PNG/WebP/PDF),
  no SVG, tracked in the `Media` registry; deletes refuse in-use assets.

## Docs

* `docs/API.md` - conventions, auth, permissions, key flows
* `docs/API_REQUESTS.md` - copy-paste method/URL/headers/JSON body for every route
* `postman/` - importable Postman collection + environment (`npm run postman` regenerates)
* `docs/API_ROUTES.md` - generated index of all routes (`node scripts/list-routes.js`)
* `docs/DEPLOYMENT.md` - Atlas, indexes, KeyDB, worker, Cloudinary, JazzCash go-live
* `docs/PRODUCTION_CHECKLIST.md` - what to verify before launch
* `docs/REPORT.md` - what was implemented, changed, removed, and what is unverified
