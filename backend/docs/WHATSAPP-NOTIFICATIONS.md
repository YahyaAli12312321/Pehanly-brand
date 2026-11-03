# PEHANLY — WhatsApp Notifications (mock provider)

**Status: implemented and tested with the MOCK provider only. No real WhatsApp message is sent. Meta Cloud API is NOT connected.**
A mock message that "succeeds" is stored as `status=sent`, `provider=mock`, `simulated=true` and shown in the dashboard as **Sent (simulated)**. Nothing is ever marked `delivered` (that status is reserved for a future Meta webhook).

## 1. Files created
Backend (`proj`)
- `src/constants/WhatsApp.js` – audiences, statuses, event keys (event key == future Meta template name)
- `src/models/WhatsAppMessage.js` – notification history/outbox (unique `idempotencyKey`)
- `src/services/whatsapp/whatsapp.service.js` – central service (dispatch, retry, list, test, recipients)
- `src/services/whatsapp/events.js` – the only API business modules call (orderPlaced, orderStatusChanged, shipmentUpdated, …)
- `src/services/whatsapp/summary.js` – daily admin summary
- `src/services/whatsapp/provider.js` – provider selection
- `src/services/whatsapp/providers/mock.provider.js`, `providers/meta.provider.js` (inactive stub)
- `src/services/whatsapp/templates/{format,order,shipment,inventory,wholesale,manufacturing,printing,quote,summary,index}.js`
- `src/validators/whatsapp.validators.js`, `src/controllers/whatsapp.controller.js`, `src/routes/adminWhatsApp.routes.js`
- Tests: `test/whatsapp.test.js` (27), `test/whatsapp-api.test.js` (6), `test/whatsapp-env.test.js` (3), `test/helpers/fakeWhatsAppDb.js`

Admin dashboard (`fe`)
- `src/components/notifications/WhatsAppPanel.jsx`, `src/lib/whatsapp.js`
- Tests: `src/lib/whatsapp.test.js`, `src/services/notificationsApi.whatsapp.test.js`, `e2e/whatsapp.mocked-api.cjs`

## 2. Files modified
Backend: `src/config/env.js`, `src/routes/admin.routes.js`, `src/services/order.service.js`, `cancellation.service.js`, `payment.service.js`, `jazzcash.service.js`, `quote.service.js`, `adminNotificationEvents.service.js`, `wholesale.service.js`, `manufacturing.service.js`, `printing.service.js`, `src/jobs/maintenance.js`, `scripts/worker.js`, `test/units.test.js` (task list expectation), `.env.example`.
Admin: `src/services/notificationsApi.js`, `src/lib/queryKeys.js`, `src/pages/NotificationsPage.jsx` (existing page extended with an "In-app alerts / WhatsApp" switch; the in-app list is unchanged).
Customer website: unchanged.

## 3. Architecture
Business code → `whatsapp/events.js` → `whatsapp.service.dispatch()` → template render → `WhatsAppMessage` record (pending) → atomic claim (processing) → `provider.sendMessage({to, template, variables, message})` → `sent` / `failed` / `skipped`.
- Hooks run **after** the order/payment/stock/shipment change is committed and are wrapped so an error is logged and never rolls anything back.
- Events re-read the order from the database, so "shipped" is only sent when the saved order is actually `shipped` and carries saved rider/courier details.
- **Idempotency:** unique `idempotencyKey` (e.g. `customer_order_shipped:<orderId>:<trackingHash>`); admin keys are suffixed per recipient. A duplicate returns the existing record.
- **Inventory dedupe:** only state transitions (ok→low, →out, out→back) fire, plus a second guard that skips a repeat of the same state for the same SKU and recipient.
- **Retry:** temporary failures get `nextAttemptAt` with backoff 60s·2^(n-1), up to `WHATSAPP_MAX_ATTEMPTS`; the `whatsapp-retry-failed` task (every 5 min in the worker) retries them. Admins can retry any `failed` message manually.
- **Missing/invalid phone:** record is `skipped` with a reason; nothing is sent, nothing throws.
- **Recipients:** customers use the order/request phone; admins = active admin users with a phone + `WHATSAPP_ADMIN_NUMBERS`. Phones are normalized to `+92…` via the existing `normalizePhone`.
- No new infrastructure: uses MongoDB and the existing worker/maintenance task runner (BullMQ only if you already run it).

## 4. Implemented events
Admin: new retail order, new wholesale order (incl. converted quotes), cancellation requested, order cancelled, payment received, payment failed, low stock, out of stock, back in stock, new wholesale request/inquiry/custom order, new manufacturing request, new printing request, quote accepted, quote rejected, daily summary, test message.
Customer: order placed, confirmed, processing, shipped (rider name+phone for `local_rider`; courier+tracking number+URL for `courier`), shipment tracking updated, delivered, cancelled, cancellation request received, wholesale/manufacturing/printing request received, quote ready, quote accepted/rejected, request status updated.
Daily summary: orders, sales, revenue, pending payments, wholesale orders, low-stock products (PKR orders only). Runs 21:00 business time via the worker, or from cron: `node scripts/worker.js --task=whatsapp-daily-summary`.

## 5. API endpoints (admin only, session + CSRF as for other admin routes)
- `GET  /api/v1/admin/notifications/whatsapp` – history; filters `status, event, recipientType, provider, search, from, to, page, limit`
- `GET  /api/v1/admin/notifications/whatsapp/config` – provider mode, enabled, maxAttempts, event list (no credentials)
- `GET  /api/v1/admin/notifications/whatsapp/:id`
- `POST /api/v1/admin/notifications/whatsapp/:id/retry` – failed messages only (409 otherwise)
- `POST /api/v1/admin/notifications/whatsapp/test` – body `{ to, simulate: success|failure|temporary_failure }`
There is no customer-facing endpoint, so customers cannot read any notification record. Responses never include idempotency keys or credentials.

## 6. Environment variables
```
WHATSAPP_PROVIDER=mock            # mock | meta | off   (default mock)
WHATSAPP_ADMIN_NUMBERS=           # optional extra admin numbers, comma separated
WHATSAPP_MAX_ATTEMPTS=3
WHATSAPP_META_ACCESS_TOKEN=       # required only when provider=meta (server side only)
WHATSAPP_META_PHONE_NUMBER_ID=
WHATSAPP_META_BUSINESS_ACCOUNT_ID=
WHATSAPP_META_API_VERSION=
WHATSAPP_META_WEBHOOK_VERIFY_TOKEN=   # optional until the webhook is added
```
Startup fails with a clear message if `meta` is selected without the first four Meta values (values are never printed).

## 7. Test results (local)
- Backend full suite: **284 / 284 pass** (includes 36 WhatsApp tests).
- Admin: vitest 68 / 68 pass; `tsc --noEmit` clean; production build OK; browser e2e (mocked API) 10 / 10.
- Spec checklist: retail order (admin+customer records) ✔; wholesale order (via quote conversion) ✔; status-change customer message ✔; rider shipped message with rider name/phone ✔; courier shipped message with courier/tracking/URL ✔; not sent before saved ✔; low stock ✔; no duplicate low stock (and per-recipient) ✔; wholesale/manufacturing/printing requests ✔; missing phone → skipped ✔; failed mock send logged and retryable ✔; existing suite intact ✔.

## 8. Limitations (be aware)
- Tested with an in-memory fake of the notification collection, not a real MongoDB: real index creation and query behaviour are untested. Run `npm run sync-indexes` after deploy.
- Hooks inside transactional flows (status update, cancellation approval, quote conversion) are tested at event level, not through a live transaction.
- Mock only: nothing was ever sent to WhatsApp, and no Meta template exists yet.
- Daily summary counts PKR orders only; the 21:00 schedule only runs if the worker runs (needs `QUEUE_URL`), otherwise use cron.
- "Wholesale request" covers inquiry, quote request and custom-order request under one admin event; the type is stated in the message.
- Customer quote approve/reject is notified on the customer's own action; request status messages go out via the review/approve/reject actions.
- `delivered` is never set until a Meta webhook is built.

## 9. Connecting Meta later
1. Create the Meta Business account, WhatsApp Business account and a phone number; note Phone Number ID and Business Account ID; create a permanent System User access token with `whatsapp_business_messaging`.
2. In WhatsApp Manager create and get approved one template per event key (template name = event key from `src/constants/WhatsApp.js`, e.g. `customer_order_shipped`), with body variables in the order the template in `src/services/whatsapp/templates/` produces them. Business-initiated messages outside the 24h window must use approved templates.
3. Set on the server (Render): `WHATSAPP_PROVIDER=meta` and the five `WHATSAPP_META_*` values. Never put them in a frontend env.
4. Implement `sendMessage` in `providers/meta.provider.js`: POST `https://graph.facebook.com/{version}/{phoneNumberId}/messages` with `Authorization: Bearer <token>`, `type: "template"`, template name and ordered parameters; return `{ok:true, messageId}` or `{ok:false, retryable, error}` (retryable: 429/5xx/network; permanent: invalid number, template not approved). Set `isSimulated: false`. Nothing else in the codebase changes.
5. Add a webhook (verify with `WHATSAPP_META_WEBHOOK_VERIFY_TOKEN`, validate the signature) that updates records by `providerMessageId` to `delivered` / `failed`.
6. Test with `POST /admin/notifications/whatsapp/test` to your own number, then watch the history page before enabling for customers.
