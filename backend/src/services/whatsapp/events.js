'use strict';

/*
 * Business-facing WhatsApp events. Call these AFTER the business transaction has committed (exactly where the existing
 * admin bell / push notifications are raised). Every function:
 *   - reads what it needs from the database (so the message reflects what was actually SAVED, e.g. the shipment),
 *   - never throws and never blocks the caller's result (failures are logged, the order / payment / stock change stands),
 *   - uses a deterministic idempotency key, so a retried request or a double call can not produce a duplicate message.
 */

const crypto = require('node:crypto');
const Order = require('../../models/order.model');
const Sku = require('../../models/Sku');
const Product = require('../../models/Product');
const WhatsAppMessage = require('../../models/WhatsAppMessage');
const logger = require('../../config/logger');
const { LOW_STOCK_THRESHOLD } = require('../../constants/inventory');
const { WHATSAPP_EVENTS: E } = require('../../constants/WhatsApp');
const { dispatch, dispatchSafe, dispatchToAdmins, dispatchToAdminsSafe } = require('./whatsapp.service');

const safe = (label, fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    logger.error({ err: error?.message || error, label }, 'WhatsApp event failed (ignored, business operation unaffected)');
    return null;
  }
};

const sid = (v) => (v ? String(v) : '');

/* ------------------------------------------------------------------ orders */

function orderVars(order) {
  return {
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    orderStatus: order.orderStatus,
    customerName: order.customer?.name,
    customerPhone: order.customer?.phone,
    city: order.shippingAddress?.city,
    total: order.pricing?.total,
    currency: order.currency || 'PKR',
    paymentMethod: order.paymentMethod,
  };
}

const orderEntity = (order) => ({ type: 'order', id: order._id, reference: order.orderNumber });
const orderCustomer = (order) => ({ id: order.user, name: order.customer?.name, phone: order.customer?.phone });

/** Order placed: admin (retail or wholesale) + the customer. Manufacturing / printing orders have their own request events. */
const orderPlaced = safe('orderPlaced', async (order) => {
  if (!order?._id) return null;
  const vars = orderVars(order);
  if (order.orderType === 'retail' || order.orderType === 'wholesale') {
    await dispatchToAdmins({
      event: order.orderType === 'wholesale' ? E.ADMIN_ORDER_NEW_WHOLESALE : E.ADMIN_ORDER_NEW_RETAIL,
      entity: orderEntity(order),
      variables: vars,
      idempotencyKey: `${order.orderType}_order_new:${order._id}`,
    });
  }
  await dispatch({ event: E.CUSTOMER_ORDER_PLACED, recipient: orderCustomer(order), entity: orderEntity(order), variables: vars, idempotencyKey: `customer_order_placed:${order._id}` });
  return true;
});

const STATUS_EVENTS = {
  confirmed: E.CUSTOMER_ORDER_CONFIRMED,
  processing: E.CUSTOMER_ORDER_PROCESSING,
  shipped: E.CUSTOMER_ORDER_SHIPPED,
  delivered: E.CUSTOMER_ORDER_DELIVERED,
  cancelled: E.CUSTOMER_ORDER_CANCELLED,
};

function shipmentVars(order) {
  const s = order.shipment || {};
  const vars = { deliveryMethod: s.deliveryMethod };
  if (s.deliveryMethod === 'local_rider') {
    vars.riderName = s.riderName;
    vars.riderPhone = s.riderPhone;
  } else {
    vars.courierName = s.courierName;
    vars.trackingNumber = s.trackingNumber;
    vars.trackingUrl = s.trackingUrl;
  }
  return vars;
}

const shipmentFingerprint = (vars) =>
  crypto.createHash('sha1').update(JSON.stringify([vars.deliveryMethod, vars.riderName, vars.riderPhone, vars.courierName, vars.trackingNumber, vars.trackingUrl])).digest('hex').slice(0, 12);

/**
 * Call after updateOrderStatus committed. The order (and for "shipped" its shipment) is re-read from the database, so the
 * message is only ever built from what was really saved: no shipped message exists unless the status change and shipment persisted.
 */
const orderStatusChanged = safe('orderStatusChanged', async (orderId, status) => {
  const event = STATUS_EVENTS[status];
  if (!event) return null; // pending has no message
  const order = await Order.findById(orderId).lean();
  if (!order || order.orderStatus !== status) return null; // not (or no longer) in that status: say nothing
  const vars = { ...orderVars(order), ...(status === 'shipped' ? shipmentVars(order) : {}) };
  await dispatch({ event, recipient: orderCustomer(order), entity: orderEntity(order), variables: vars, idempotencyKey: `${event}:${order._id}` });
  if (status === 'cancelled') {
    await dispatchToAdmins({ event: E.ADMIN_ORDER_CANCELLED, entity: orderEntity(order), variables: vars, idempotencyKey: `admin_order_cancelled:${order._id}` });
  }
  return true;
});

/** Call after the shipment was saved. Only meaningful once the order is shipped, and only when the details really changed. */
const shipmentUpdated = safe('shipmentUpdated', async (orderId) => {
  const order = await Order.findById(orderId).lean();
  if (!order || order.orderStatus !== 'shipped') return null;
  const vars = { ...orderVars(order), ...shipmentVars(order) };
  const fp = shipmentFingerprint(vars);
  const last = await WhatsAppMessage.findOne({ entityId: order._id, event: { $in: [E.CUSTOMER_ORDER_SHIPPED, E.CUSTOMER_SHIPMENT_UPDATED] } }).sort({ createdAt: -1 }).select('variables').lean();
  if (last && shipmentFingerprint(last.variables || {}) === fp) return null; // same details already sent to the customer
  await dispatch({ event: E.CUSTOMER_SHIPMENT_UPDATED, recipient: orderCustomer(order), entity: orderEntity(order), variables: vars, idempotencyKey: `customer_shipment_updated:${order._id}:${fp}` });
  return true;
});

/** Customer asked to cancel an order. */
const cancellationRequested = safe('cancellationRequested', async (cancellation) => {
  const order = await Order.findById(cancellation.order).lean();
  if (!order) return null;
  const vars = { ...orderVars(order), reason: cancellation.reason };
  await dispatchToAdmins({ event: E.ADMIN_ORDER_CANCELLATION_REQUESTED, entity: orderEntity(order), variables: vars, idempotencyKey: `admin_cancellation_requested:${cancellation._id}` });
  await dispatch({ event: E.CUSTOMER_CANCELLATION_RECEIVED, recipient: orderCustomer(order), entity: orderEntity(order), variables: vars, idempotencyKey: `customer_cancellation_received:${cancellation._id}` });
  return true;
});

/* ------------------------------------------------------------------ payments */

async function paymentVars(payment) {
  const order = payment.order ? await Order.findById(payment.order).select('orderNumber currency paymentMethod').lean() : null;
  return { orderNumber: order?.orderNumber, amount: payment.amount, currency: payment.currency || order?.currency || 'PKR', paymentMethod: payment.method || order?.paymentMethod };
}

const paymentReceived = safe('paymentReceived', async (payment) => {
  if (!payment?._id) return null;
  await dispatchToAdmins({ event: E.ADMIN_PAYMENT_RECEIVED, entity: { type: 'payment', id: payment._id, reference: '' }, variables: await paymentVars(payment), idempotencyKey: `admin_payment_received:${payment._id}` });
  return true;
});

const paymentFailed = safe('paymentFailed', async (payment) => {
  if (!payment?._id) return null;
  await dispatchToAdmins({ event: E.ADMIN_PAYMENT_FAILED, entity: { type: 'payment', id: payment._id, reference: '' }, variables: await paymentVars(payment), idempotencyKey: `admin_payment_failed:${payment._id}` });
  return true;
});

/* ------------------------------------------------------------------ inventory */

/**
 * Called from the existing stock-state transition handler (OK -> LOW, any -> OUT, LOW/OUT -> OK), which already fires once per
 * transition. As a second guard the service skips a message whose state equals the latest one sent for that SKU, so repeated
 * stock updates inside the same state never produce another WhatsApp message.
 */
async function stockEvent(event, sku) {
  const product = sku.product ? await Product.findById(sku.product).select('name').lean() : null;
  await dispatchToAdmins({
    event,
    entity: { type: 'sku', id: sku._id, reference: sku.sku },
    variables: { productName: product?.name, sku: sku.sku, available: sku.available, lowStockThreshold: LOW_STOCK_THRESHOLD },
    idempotencyKey: `${event}:${sku._id}:${sku.updatedAt?.getTime?.() || Date.now()}`,
    suppressRepeatState: true,
  });
  return true;
}
const lowStock = safe('lowStock', (sku) => stockEvent(E.ADMIN_LOW_STOCK, sku));
const outOfStock = safe('outOfStock', (sku) => stockEvent(E.ADMIN_OUT_OF_STOCK, sku));
const backInStock = safe('backInStock', (sku) => stockEvent(E.ADMIN_BACK_IN_STOCK, sku));

/* ------------------------------------------------------------------ wholesale / manufacturing / printing */

const B2B = {
  wholesale: { admin: E.ADMIN_WHOLESALE_REQUEST_NEW, customer: E.CUSTOMER_WHOLESALE_RECEIVED, quantity: (r) => r.requestedVolume },
  manufacturing: { admin: E.ADMIN_MANUFACTURING_REQUEST_NEW, customer: E.CUSTOMER_MANUFACTURING_RECEIVED, quantity: (r) => r.quantity },
  printing: { admin: E.ADMIN_PRINTING_REQUEST_NEW, customer: E.CUSTOMER_PRINTING_RECEIVED, quantity: (r) => r.quantity },
};

function requestVars(kind, request) {
  return {
    service: kind,
    requestNumber: request.requestNumber,
    requestType: request.requestType,
    customerName: request.customer?.name,
    businessName: request.customer?.businessName,
    customerPhone: request.customer?.phone,
    quantity: B2B[kind].quantity(request),
  };
}
const requestEntity = (kind, request) => ({ type: `${kind}_request`, id: request._id, reference: request.requestNumber });
const requestCustomer = (request) => ({ id: request.user, name: request.customer?.name, phone: request.customer?.phone });

/** A new wholesale / manufacturing / printing request: admin + acknowledgement to the customer. */
const requestSubmitted = safe('requestSubmitted', async (kind, request) => {
  if (!B2B[kind] || !request?._id) return null;
  const vars = requestVars(kind, request);
  await dispatchToAdmins({ event: B2B[kind].admin, entity: requestEntity(kind, request), variables: vars, idempotencyKey: `admin_${kind}_request_new:${request._id}` });
  await dispatch({ event: B2B[kind].customer, recipient: requestCustomer(request), entity: requestEntity(kind, request), variables: vars, idempotencyKey: `customer_${kind}_received:${request._id}` });
  return true;
});

const humanize = (s) => String(s || '').replace(/_/g, ' ');

/** Admin moved a request along (under review, approved, rejected, ...). One message per status, once. */
const requestStatusChanged = safe('requestStatusChanged', async (kind, request, status, note) => {
  if (!B2B[kind] || !request?._id || !status) return null;
  await dispatch({
    event: E.CUSTOMER_REQUEST_STATUS,
    recipient: requestCustomer(request),
    entity: requestEntity(kind, request),
    variables: { ...requestVars(kind, request), statusLabel: humanize(status), note },
    idempotencyKey: `customer_request_status:${kind}:${request._id}:${status}`,
  });
  return true;
});

/* ------------------------------------------------------------------ quotes */

function quoteVars(quote) {
  return {
    service: quote.sourceType,
    quoteNumber: quote.quoteNumber,
    customerName: quote.customer?.name,
    amount: quote.pricing?.total,
    currency: quote.currency || 'PKR',
    validUntil: quote.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : undefined,
  };
}
const quoteEntity = (quote) => ({ type: 'quote', id: quote._id, reference: quote.quoteNumber });
const quoteCustomer = (quote) => ({ id: quote.user, name: quote.customer?.name, phone: quote.customer?.phone });

const quoteReady = safe('quoteReady', async (quote) => {
  await dispatch({ event: E.CUSTOMER_QUOTE_READY, recipient: quoteCustomer(quote), entity: quoteEntity(quote), variables: quoteVars(quote), idempotencyKey: `customer_quote_ready:${quote._id}:${quote.sentAt ? new Date(quote.sentAt).getTime() : quote.revision || 0}` });
  return true;
});

const quoteDecision = safe('quoteDecision', async (quote, accepted) => {
  const vars = quoteVars(quote);
  await dispatchToAdmins({ event: accepted ? E.ADMIN_QUOTE_ACCEPTED : E.ADMIN_QUOTE_REJECTED, entity: quoteEntity(quote), variables: vars, idempotencyKey: `admin_quote_${accepted ? 'accepted' : 'rejected'}:${quote._id}` });
  await dispatch({ event: accepted ? E.CUSTOMER_QUOTE_ACCEPTED : E.CUSTOMER_QUOTE_REJECTED, recipient: quoteCustomer(quote), entity: quoteEntity(quote), variables: vars, idempotencyKey: `customer_quote_${accepted ? 'accepted' : 'rejected'}:${quote._id}` });
  return true;
});

/** Wraps an admin review/approve/reject function: after it returns the updated request, tell the customer the new status. */
const trackRequestStatus = (kind, fn) => async (...args) => {
  const result = await fn(...args);
  if (result?.status) await requestStatusChanged(kind, result, result.status); // safe: never throws
  return result;
};

module.exports = {
  trackRequestStatus,
  orderPlaced,
  orderStatusChanged,
  shipmentUpdated,
  cancellationRequested,
  paymentReceived,
  paymentFailed,
  lowStock,
  outOfStock,
  backInStock,
  requestSubmitted,
  requestStatusChanged,
  quoteReady,
  quoteDecision,
  // exported for tests
  _internals: { shipmentFingerprint, shipmentVars },
  dispatchSafe,
  dispatchToAdminsSafe,
};
