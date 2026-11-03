# Final report - PEHANLY backend consolidation (1.0.0-rc.2)

Starting point: the 228 files you uploaded. None of the earlier phase work was
assumed to exist locally; everything was applied into this single project.

## Phases implemented (consolidated)
* **0-2 Foundation/security**: env + DB config with test-DB guard, boot/security/contract tests, counters and number services, validators, auth middleware, rate limiter, cancellation model/controller, import/export fixes.
* **3 Commerce integrity**: one stock lifecycle (reserve -> release | commit at SHIPPED), `orderLifecycle.service`, COD payment created inside checkout, coupon release on cancel, quote conversion and rejection fixes, return/refund fixes, post-commit best-effort notifications, sorted SKU locking order.
* **RBAC/staff**, **Cloudinary media**, **store settings**, **dashboard**, **public catalog**, **JazzCash sandbox code**, **cache/worker**, **scripts**, **docs**.

## Modules (21)
Implemented in code: all 21. "Implemented" means written and loaded/syntax-checked, with offline tests for guards, validators and pure logic. DB-backed behaviour is **not verified** (see below).

## Files
* Added: RBAC (`Permissions`, staff service/controller/routes/validators), Cloudinary + media (config, `Media` model, services, upload middleware, routes), settings, dashboard, catalog, JazzCash service, cache/redis/jobs, `orderLifecycle.service`, scripts (`create-admin`, `sync-indexes`, `reconcile-stock`, `worker`, `list-routes`), tests, docs.
* Updated: order, payment, coupon, cancellation, return/refund, wholesale, quote, manufacturing, analytics services; Order/Payment/Notification/User models; routes index/admin/auth/payment; auth/csrf middleware; validators (media URLs, exports, strictness); `package.json`; `.env.example`.
* Removed (dead duplicates): `services/adminOrder.service.js`, `controllers/adminOrder.controller.js`, `validators/adminOrder.validators.js`.

## Bugs fixed (main ones)
Broken imports (`../models/Order`, `./presenter`, `rateLimit`, `counter.service`); missing validator exports; COD payment missing from checkout; cancellation not releasing coupon/payments/stock; stock never committed; `payment.method` vs `gateway`; missing notification import; quote conversion losing price snapshots and bypassing reservations; rejected quotes leaving requests stuck at `quoted`; wholesale colour-name lookup; analytics UTC vs business timezone; notification collection growing forever (90-day TTL); admin routes lacking per-module permission checks; media URLs accepting any host.

## Test results (actually run)
* `npm test`: **83 passed, 0 failed** (offline: boot, security, env, db-config, contracts, RBAC HTTP guards, units, JazzCash hash/tamper/timestamp).
* `npm audit --omit=dev`: 0 vulnerabilities (at time of run).
* `test/env.test.js` fixtures were updated because Cloudinary is now required in production; new tests were added, none weakened.

## Added after first delivery
* Placeholder Mongo URIs (`USER:PASSWORD@CLUSTER.mongodb.net`) now fail immediately with a clear error (`MONGODB_URI_PLACEHOLDER` / `MONGODB_TEST_URI_PLACEHOLDER`); integration-test cleanup no longer hangs when the connection failed.
* Postman collection, environment and `docs/API_REQUESTS.md`, generated from the live router and validators (187 routes, every example body validated). Test count: 85.
* Postman scripts are syntax-checked only; they have not been run inside Postman against a live server.

## Release candidate 2 - what was added
* **Customer account module** (`/account/*`): profile, change password (revokes other sessions), sign out other devices, address book (max 10, exactly one default), avatar from the user's own `avatar` upload.
* **E-mail service** (nodemailer 10.1.7, SMTP optional): password-reset link and password-changed notice. Replaces the old TODO that only logged the link.
* **Audit trail**: request-level audit of every back-office write and refused attempt (field names only), staff/admin sign-ins, and an owner-only read API `GET /admin/audit-logs`.
* **Atomic inventory adjust** (stock + status + ledger in one transaction) and **atomic variant create/update**.
* **Printing schema bug fixed**: `garmentSource`, `garmentDetails`, `colors` were accepted by the validator and service but missing from the model, so they were silently dropped and the admin garment filter did nothing. A new test now fails whenever a service writes a field its schema lacks.
* **Shared rate limiting** through the cache KeyDB/Redis (falls back to per-instance memory), `GET /health/ready`, `Dockerfile`, `.dockerignore`, GitHub Actions CI.
* Postman docs corrected: validation failures are **422**, not 400.
* Offline tests: 97 passing. A second integration file (`test/integration/phase4.int.test.js`) is written and **not executed**.

## NOT verified
* **MongoDB**: no database was reachable here (binary download blocked, no Docker). Transactions, checkout, payments, catalog queries, settings, dashboard, media registry never ran. `test/integration/stock-and-counters.int.test.js` is written but **never executed**.
* **Cloudinary**: never called with a real account.
* **JazzCash**: sandbox-ready code only; hash follows the documented HMAC-SHA256 scheme but is not checked against the real gateway. Live mode is not verified.
* KeyDB/BullMQ worker, FCM: untested.

## Missing / unavailable files
Your real `User.js`, `Printing.js`, `test/helpers.js`, `scripts/create-admin.js` and your own existing tests were not in the upload set. `User.js` was rebuilt/extended (role `staff`, `permissions`, `customerNumber`, `accountTier`) and `create-admin.js` was written fresh - compare with your originals before replacing. Printing model alignment was not fully reviewed.

## Open decisions
Return window default 7 days; no auto-cancel of unpaid orders; staff role templates; email provider for password reset; shared (Redis) rate limiting; transactional inventory adjust/variant writes; customer profile/avatar endpoint.

## Before first deploy
Run integration tests on a replica-set test DB, `sync-indexes`, `reconcile-stock` (dry run first, backup before `--apply`), then work through `docs/PRODUCTION_CHECKLIST.md`.
