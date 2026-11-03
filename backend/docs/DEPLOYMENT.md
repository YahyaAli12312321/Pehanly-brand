# Deployment

## 1. MongoDB Atlas
* Use a **replica set** (any Atlas cluster, M0 included) - transactions require it.
* Three separate databases/users: development, `*_test`, production.
  The test user should have no access to production.
* Put the URI-encoded credentials only in environment variables / secret store.
* Allow-list the server IPs.

## 2. Indexes
`autoIndex` is off in production. After every deploy that changes schemas:
```bash
npm run sync-indexes            # creates missing indexes
node scripts/sync-indexes.js --prune   # also drops indexes not in the schema (review first)
```

## 3. Legacy stock drift
Older data may have inconsistent `reservedStock`/`available`.
```bash
npm run reconcile-stock         # dry run: prints differences, writes nothing
node scripts/reconcile-stock.js --apply
```
It recomputes `reservedStock`/`available` from open orders and never edits `stock`.
Take a backup first.

## 4. First owner account
```bash
ADMIN_EMAIL=... ADMIN_PHONE=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run create-admin
```

## 5. Cloudinary
Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
(required when `NODE_ENV=production`). Uploads are server-side only; no unsigned
presets are needed. Rotate the API secret if it was ever pasted anywhere.
Run `POST /admin/media/cleanup` (or the worker job) to remove orphaned assets.

## 6. KeyDB / Redis (optional)
`CACHE_URL` (cache; `maxmemory-policy allkeys-lru`) and `QUEUE_URL`
(BullMQ; `maxmemory-policy noeviction`) must be separate instances or databases
with those policies. Without them the API still works (cache is a no-op).
Run the worker as its own process: `npm run worker` (`worker:once` for cron).
Jobs: `expire-quotes`, `cleanup-media`.

## 7. JazzCash
1. Get sandbox merchant ID, password, integrity salt from JazzCash.
2. Set `JAZZCASH_ENV=sandbox`, the three secrets, and `JAZZCASH_RETURN_URL`
   (public HTTPS URL of `/api/v1/payments/jazzcash/return`).
3. Run sandbox payments: success, failure, cancel, duplicate callback, tampered callback.
4. Confirm field names/hash against JazzCash's current integration document.
5. Only then set `JAZZCASH_ENV=live` and `JAZZCASH_CHECKOUT_URL` from JazzCash's live docs.

## 8. E-mail (password reset)
Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` (any SMTP relay: your host, SES, Brevo, ...).
`PASSWORD_RESET_URL` is the storefront page that reads `?token=` (default `CLIENT_URL/reset-password`).
Send yourself a reset from a real account before launch. If SMTP is unset in production the API still answers
normally but no e-mail leaves the server (a warning is logged).

## 9. Shared rate limiting
With `CACHE_URL` set, rate-limit counters are shared by all API instances through KeyDB/Redis; if the cache is
unreachable each instance falls back to its own memory counters. Without `CACHE_URL` limits are per process.

## 10. Probes and containers
* Liveness: `GET /api/v1/health` (process up). Readiness: `GET /api/v1/health/ready` (503 until MongoDB answers).
* `Dockerfile`/`.dockerignore` are provided but were not built in the authoring environment.
* `.github/workflows/ci.yml` runs the offline suite and `npm audit`; the integration suite is run by hand against an Atlas **test** database.

## 11. Process
* Set `NODE_ENV=production`, `TRUST_PROXY` to the number of proxy hops, `COOKIE_DOMAIN` if needed.
* Terminate TLS at the proxy; cookies are `Secure` in production.
* Health check: `GET /api/v1/health`.
* Graceful shutdown timeout: `SHUTDOWN_TIMEOUT_MS`.
