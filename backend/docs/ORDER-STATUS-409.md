# Order status update 409 — findings and change

**Production was not inspected** (no access to your database, logs or the response body for request d6b519f5-…). The exact 409 for that request is therefore NOT identified; only the possible causes were traced.

## Flow traced
Admin `OrdersPage` → `ordersApi.updateStatus` → `PATCH /admin/orders/:id/status` `{status, note?}` → `adminOrder.routes` → `order.service.updateOrderStatus` (one MongoDB transaction). Frontend and backend transition tables are identical: pending→confirmed|cancelled, confirmed→processing|cancelled, processing→shipped|cancelled, shipped→delivered, delivered/cancelled final. There is no client retry; the double-click guard is in place.

## Every 409 this endpoint can return (all carry `message` + `code`)
| code | when |
|---|---|
| ORDER_STATUS_UNCHANGED | order already has that status (stale screen / second admin) |
| INVALID_ORDER_STATUS_TRANSITION | move not in the table above |
| SHIPMENT_REQUIRED | Shipped without rider (Karachi) or courier+waybill (elsewhere); Karachi never needs tracking |
| LOCAL_RIDER_KARACHI_ONLY | rider delivery chosen for a non-Karachi address |
| REFUND_REQUIRED | cancelling a paid / partially refunded order |
| ORDER_STOCK_ALREADY_COMMITTED | cancelling after stock was deducted |
| INVALID_STOCK_COMMIT | Shipped, but the SKU has fewer reserved or in-stock units than the order |
| INVALID_STOCK_RELEASE | Cancelled, but the SKU has fewer reserved units than the order |
| ORDER_SKU_REFERENCE_MISSING / INVALID_RESERVED_STOCK_QUANTITY | order line without a SKU / bad quantity |

## Change (smallest, guards unchanged)
`src/services/orderLifecycle.service.js`: the two stock refusals used to say only "Unable to commit/release reserved stock". They keep the same 409 and codes but now name the SKU, the numbers and the fix, e.g. "Cannot mark as shipped: SKU TEE-BLK-M needs 3 unit(s) but has 10 in stock, 1 reserved; …Correct the SKU's stock in Inventory, then try again." If the explanation lookup fails, or the error is anything else, the original error is returned untouched. No validation, auth or transition rule was relaxed. The dashboard already shows the backend message in its error toast.

Tests: `test/order-status-409.test.js` (6) — backend suite 244/244.

## To pin the exact cause
Open DevTools → Network → the failed PATCH → Response: send `message` and `code`. If it is INVALID_STOCK_COMMIT, check that SKU's stock/reserved in Inventory (typical after stock was edited or the order predates reservations).
