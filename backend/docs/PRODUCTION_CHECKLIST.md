# Production checklist

Tick only after you have actually done it.

## Must verify against live services
- [ ] `npm run test:integration` against a replica-set **test** database (written, never run)
- [ ] Checkout -> reserve -> ship -> commit on real data; 20 concurrent buyers of 5 units oversell nothing
- [ ] Cancellation releases stock, coupon and open payments; paid orders refuse with `REFUND_REQUIRED`
- [ ] Quote accept/convert/reject/expire in a transaction
- [ ] Cloudinary upload, replace, delete, orphan cleanup with real credentials
- [ ] JazzCash sandbox: success, failure, abandoned, duplicate callback, tampered hash
- [ ] KeyDB cache and BullMQ worker (if used)
- [ ] FCM admin push (if configured)

## Data / operations
- [ ] `npm run sync-indexes` run on production
- [ ] `reconcile-stock` dry-run reviewed, then applied after backup
- [ ] Owner account created; staff accounts get least-privilege permissions
- [ ] Atlas backups on; separate prod/test DB users
- [ ] Secrets in a secret store; `.env` not committed; any previously exposed secret rotated
- [ ] `CORS_ORIGINS`/`CLIENT_URL` set to real storefront/admin origins
- [ ] `TRUST_PROXY` matches infrastructure (rate limits and IPs depend on it)

- [ ] SMTP configured and a real password-reset e-mail received
- [ ] `GET /api/v1/health/ready` returns 200 behind your load balancer
- [ ] `npm run test:integration` (both files) green on the Atlas test database
- [ ] Docker image builds (Dockerfile never built by the author)

## Known gaps (decide before launch)
- Customer-uploaded artwork URLs are public but unguessable (Cloudinary).
- Return window defaults to 7 days (setting), no auto-cancel of unpaid orders.
