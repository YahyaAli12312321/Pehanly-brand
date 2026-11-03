# Rider name / phone not stored in MongoDB — investigation

**Production was not inspected.** The stored order PH-000007 and your deployed builds were not available to me.

## Result of tracing the code in this repository (every layer persists the rider fields)
1. Inputs → React `ship` state: `onChange` handlers for Rider Name / Rider Phone update `riderName` / `riderPhone` (OrdersPage).
2. `saveShipment()` sends `{...ship, deliveryMethod: method}`.
3. `ordersApi.updateShipment` forwards `deliveryMethod, riderName, riderPhone, …` (non-empty only).
4. Request payload: asserted in the browser test `fe/e2e/orders-ship.mocked-api.cjs` (`riderName`, `riderPhone` are in the PATCH body) — passes.
5. Route + Zod (`updateShipmentBody`): both fields kept.
6. Controller passes `req.validated.body`; service merges all six fields.
7. Mongoose: `shipmentSchema` defines both; a real hydrated `Order` document assigned the merged object produces `$set: { shipment: { deliveryMethod, riderName, riderPhone } }` (verified, see tests).
8. The response is re-read from the database by `getAdminOrder`.

I found **no defect in these layers**, so I cannot name a code-level root cause for the missing fields. A stored `shipment: { deliveryMethod: 'local_rider' }` with a 200 can only come from one of two things, which differ in where the data is lost:
* **The PATCH body never contained the rider fields** (an older admin build deployed on Vercel, or a cached bundle): check DevTools → Network → PATCH `/admin/orders/<id>/shipment` → *Payload*.
* **The body had them, but the deployed backend dropped them**: Mongoose in strict mode silently ignores fields that its deployed schema does not declare, answering 200. That happens if the Render service runs an older `order.model.js` whose `shipmentSchema` lacks `riderName` / `riderPhone`.

## Change made (safety net, no behaviour change when everything is correct)
`src/services/order.service.js → updateShipment`: after saving, the order is read back and each requested shipment field is compared. If any is missing, the API answers **500 `SHIPMENT_NOT_PERSISTED`** naming the lost fields instead of a silent 200. Nothing else changed (no validation, auth or courier-flow change).

## Tests
`test/shipment-persistence.test.js` (4, real Mongoose Order model, DB round-trip faked): the exact production state (`{deliveryMethod}` only) + rider save stores all three fields and returns them; first save with no shipment; courier switch clears rider fields and Karachi needs no tracking; simulated schema-drop → loud 500. Backend suite **248/248**; admin `orders-ship` browser test still 10/10.
**Not tested:** a real MongoDB, and your deployed Render/Vercel builds.

## What to do
1. Redeploy the backend (and the admin if it was not redeployed after the shipping fix), then hard-refresh the dashboard.
2. Save the rider again with DevTools → Network open. Read the PATCH *Payload*: both rider fields present? Then read the response: `shipment.riderName` / `riderPhone` present?
3. If the response is now `SHIPMENT_NOT_PERSISTED` the Render service is running an older model/schema: confirm the deployed commit contains `riderName` / `riderPhone` in `shipmentSchema`, then redeploy. If Payload lacks the rider fields, the admin build being served is stale.
