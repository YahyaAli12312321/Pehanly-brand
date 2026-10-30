'use strict';

/*
|--------------------------------------------------------------------------
| Order Lifecycle (stock / coupon / payment side effects)
|--------------------------------------------------------------------------
|
| ONE place for the database effects of an order leaving or advancing in its
| lifecycle, so every entry point (admin status update, customer
| cancellation approval, ...) behaves identically.
|
| STOCK LIFECYCLE (retail and wholesale orders)
|
|   checkout   reserveSku : reservedStock +q, available -q   (stock unchanged)
|   cancelled  releaseSku : reservedStock -q, available +q   (stock unchanged)
|   shipped    commitSku  : stock -q, reservedStock -q       (available unchanged)
|
| An order that is cancelled before SHIPPED therefore never touches physical
| stock. Once shipped, the reservation has been converted into a physical
| deduction exactly once (guarded by order.stockCommittedAt).
|
| RULES
|  - Every function runs inside the caller's MongoDB transaction (session).
|  - No notification / FCM / email is sent here. Functions return the stock
|    transitions; the caller notifies AFTER the transaction commits.
|--------------------------------------------------------------------------
*/

const Payment = require('../models/Payment');
const Sku = require('../models/Sku');
const ApiError = require('../utils/ApiError');
const stockReservation = require('./stockReservation.service');
const couponService = require('./coupon.service');

/* Order types whose items reserve SKU inventory. */
const STOCK_ORDER_TYPES = ['retail', 'wholesale'];

function assertSession(session) {
  if (!session) {
    throw new Error('orderLifecycle requires a MongoDB session');
  }
}

function validItemQuantity(item) {
  const quantity = Number(item.quantity);

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw ApiError.conflict(
      'Order contains an invalid stock quantity',
      'INVALID_RESERVED_STOCK_QUANTITY',
    );
  }

  return quantity;
}

/*
 * Group order lines by SKU and process them in a stable order so that two
 * concurrent transactions touching the same SKUs cannot deadlock/abort each
 * other more often than necessary.
 */
function groupedSkuLines(order) {
  const bySku = new Map();

  for (const item of order.items || []) {
    if (!item.sku) {
      throw ApiError.conflict(
        'Reserved SKU reference is missing from an order item',
        'ORDER_SKU_REFERENCE_MISSING',
      );
    }

    const key = String(item.sku);
    bySku.set(key, (bySku.get(key) || 0) + validItemQuantity(item));
  }

  return [...bySku.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/*
 * The stock guards in stockReservation refuse (409) when the SKU does not hold what the order needs, but their message
 * ("Unable to commit reserved stock") does not tell the admin which SKU or why. This keeps the same 409 + code (the
 * guard is NOT relaxed) and only swaps in a specific, actionable message. Any other error passes through untouched.
 */
async function explainStockFailure(err, code, skuId, quantity, session) {
  if (!(err instanceof ApiError) || err.code !== code) return err;
  try {
    const sku = await Sku.findById(skuId).session(session).select('sku stock reservedStock available').lean();
    if (!sku) return ApiError.conflict(`A SKU on this order no longer exists, so its stock cannot be updated (SKU id ${skuId}).`, code);
    const label = sku.sku || String(skuId);
    const have = `${sku.stock ?? 0} in stock, ${sku.reservedStock ?? 0} reserved`;
    if (code === 'INVALID_STOCK_COMMIT') {
      const why = (sku.reservedStock ?? 0) < quantity
        ? 'fewer units are reserved for orders than this order needs (the reservation was released or stock was edited after the order was placed)'
        : 'there is less physical stock than this order needs';
      return ApiError.conflict(`Cannot mark as shipped: SKU ${label} needs ${quantity} unit(s) but has ${have}; ${why}. Correct the SKU's stock in Inventory, then try again.`, code);
    }
    return ApiError.conflict(`Cannot cancel: SKU ${label} should have ${quantity} unit(s) reserved for this order but has ${have}. Correct the SKU's stock in Inventory, then try again.`, code);
  } catch {
    return err; // never hide the original refusal because the explanation lookup failed
  }
}

/*
 * Convert reservations into a physical stock deduction (order -> SHIPPED).
 * Idempotent: a second call for the same order does nothing.
 */
async function commitOrderStock(order, session) {
  assertSession(session);

  if (!STOCK_ORDER_TYPES.includes(order.orderType) || order.stockCommittedAt) {
    return;
  }

  for (const [skuId, quantity] of groupedSkuLines(order)) {
    try {
      await stockReservation.commitSku(skuId, quantity, session);
    } catch (err) {
      throw await explainStockFailure(err, 'INVALID_STOCK_COMMIT', skuId, quantity, session);
    }
  }

  order.stockCommittedAt = new Date();
}

/*
 * Release a retail order's reservations. Returns the stock transitions the
 * caller must hand to stockNotification AFTER the transaction commits.
 */
async function releaseOrderStock(order, session) {
  assertSession(session);

  const transitions = [];

  if (!STOCK_ORDER_TYPES.includes(order.orderType)) {
    return transitions;
  }

  if (order.stockCommittedAt) {
    throw ApiError.conflict(
      'Stock for this order has already been deducted; use the return/refund flow',
      'ORDER_STOCK_ALREADY_COMMITTED',
    );
  }

  for (const [skuId, quantity] of groupedSkuLines(order)) {
    let release;
    try {
      release = await stockReservation.releaseSku(skuId, quantity, session);
    } catch (err) {
      throw await explainStockFailure(err, 'INVALID_STOCK_RELEASE', skuId, quantity, session);
    }

    if (release?.stockTransition?.before && release?.stockTransition?.after) {
      transitions.push(release.stockTransition);
    }
  }

  return transitions;
}

/*
 * Cancel an order inside the caller's transaction.
 *
 *  - paid orders are refused (REFUND_REQUIRED): money must go through the
 *    refund module, never be silently dropped
 *  - reservations are released
 *  - the coupon redemption is given back
 *  - open (pending/processing) payments are cancelled
 *
 * The caller persists the order (order.save) after this returns.
 * Pass recordStatus:false when the caller sets orderStatus/statusHistory itself.
 */
async function cancelOrder({
  order,
  session,
  actorId = null,
  note,
  recordStatus = true,
}) {
  assertSession(session);

  if (
    order.paymentStatus === 'paid' ||
    order.paymentStatus === 'partially_refunded'
  ) {
    throw ApiError.conflict(
      'Paid orders require refund processing before cancellation',
      'REFUND_REQUIRED',
    );
  }

  const stockTransitions = await releaseOrderStock(order, session);

  if (order.coupon?.couponId && order.user) {
    await couponService.release({
      couponId: order.coupon.couponId,
      userId: order.user,
      session,
    });
  }

  await Payment.updateMany(
    {
      order: order._id,
      status: { $in: ['pending', 'processing'] },
    },
    { $set: { status: 'cancelled', cancelledAt: new Date() } },
    { session },
  );

  if (['pending', 'processing'].includes(order.paymentStatus)) {
    order.paymentStatus = 'cancelled';
  }

  if (recordStatus) {
    order.orderStatus = 'cancelled';

    if (!Array.isArray(order.statusHistory)) {
      order.statusHistory = [];
    }

    order.statusHistory.push({
      status: 'cancelled',
      note: note || 'Order cancelled',
      changedAt: new Date(),
      changedBy: actorId,
    });
  }

  return { stockTransitions };
}

module.exports = {
  commitOrderStock,
  releaseOrderStock,
  cancelOrder,
};
