'use strict';

const {
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_ENTITY_TYPES,
} = require('../constants/Notification');

const adminNotificationEvents =
  require('./adminNotificationEvents.service');
const {
  notifyAdminsSafe,
} = require('./notification.service');

/*
|--------------------------------------------------------------------------
| New Order
|--------------------------------------------------------------------------
*/

function newOrder(order) {
  notifyAdminsSafe({
    type: NOTIFICATION_TYPES.NEW_ORDER,

    title: 'New Order Received',

    message:
      `Order ${order.orderNumber} has been placed for Rs. ${order.pricing?.total ?? 0}.`,

    priority:
      NOTIFICATION_PRIORITIES.HIGH,

    entityType:
      NOTIFICATION_ENTITY_TYPES.ORDER,

    entityId: order._id,

    data: {
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      total: order.pricing?.total ?? 0,
    },

    actionUrl:
      `/orders/${order._id}`,

    dedupeKey:
      `new_order:${order._id}`,
  });
}

/*
|--------------------------------------------------------------------------
| Wholesale
|--------------------------------------------------------------------------
*/

function newWholesaleRequest(request) {
  notifyAdminsSafe({
    type:
      NOTIFICATION_TYPES.NEW_WHOLESALE_REQUEST,

    title:
      'New Wholesale Request',

    message:
      `Wholesale request ${request.requestNumber} has been submitted.`,

    priority:
      NOTIFICATION_PRIORITIES.HIGH,

    entityType:
      NOTIFICATION_ENTITY_TYPES.WHOLESALE_REQUEST,

    entityId:
      request._id,

    data: {
      requestNumber:
        request.requestNumber,

      requestType:
        request.requestType,

      requestedVolume:
        request.requestedVolume,
    },

    actionUrl:
      `/wholesale/${request._id}`,

    dedupeKey:
      `new_wholesale_request:${request._id}`,
  });
}

/*
|--------------------------------------------------------------------------
| Manufacturing
|--------------------------------------------------------------------------
*/

function newManufacturingRequest(request) {
  notifyAdminsSafe({
    type:
      NOTIFICATION_TYPES.NEW_MANUFACTURING_REQUEST,

    title:
      'New Manufacturing Request',

    message:
      `Manufacturing request ${request.requestNumber} has been submitted.`,

    priority:
      NOTIFICATION_PRIORITIES.HIGH,

    entityType:
      NOTIFICATION_ENTITY_TYPES.MANUFACTURING_REQUEST,

    entityId:
      request._id,

    data: {
      requestNumber:
        request.requestNumber,

      quantity:
        request.quantity,
    },

    actionUrl:
      `/manufacturing/${request._id}`,

    dedupeKey:
      `new_manufacturing_request:${request._id}`,
  });
}

/*
|--------------------------------------------------------------------------
| Printing
|--------------------------------------------------------------------------
*/

function newPrintingRequest(request) {
  notifyAdminsSafe({
    type:
      NOTIFICATION_TYPES.NEW_PRINTING_REQUEST,

    title:
      'New Printing & Branding Request',

    message:
      `Printing request ${request.requestNumber} has been submitted.`,

    priority:
      NOTIFICATION_PRIORITIES.HIGH,

    entityType:
      NOTIFICATION_ENTITY_TYPES.PRINTING_REQUEST,

    entityId:
      request._id,

    data: {
      requestNumber:
        request.requestNumber,

      quantity:
        request.quantity,

      garmentSource:
        request.garmentSource,
    },

    actionUrl:
      `/printing/${request._id}`,

    dedupeKey:
      `new_printing_request:${request._id}`,
  });
}

/*
|--------------------------------------------------------------------------
| Return
|--------------------------------------------------------------------------
*/

function newReturnRequest(request) {
  notifyAdminsSafe({
    type:
      NOTIFICATION_TYPES.NEW_RETURN_REQUEST,

    title:
      'New Return / Refund Request',

    message:
      'A new return/refund request requires review.',

    priority:
      NOTIFICATION_PRIORITIES.HIGH,

    entityType:
      NOTIFICATION_ENTITY_TYPES.RETURN_REQUEST,

    entityId:
      request._id,

    data: {
      orderId:
        request.order,

      requestedBy:
        request.requestedBy,

      returnStatus:
        request.returnStatus,
    },

    actionUrl:
      `/returns/${request._id}`,

    dedupeKey:
      `new_return_request:${request._id}`,
  });
}

/*
|--------------------------------------------------------------------------
| Quote Accepted
|--------------------------------------------------------------------------
*/

function quoteAccepted(quote) {
  notifyAdminsSafe({
    type:
      NOTIFICATION_TYPES.QUOTE_ACCEPTED,

    title:
      'Quote Accepted',

    message:
      `A ${quote.sourceType} quote has been accepted by the customer.`,

    priority:
      NOTIFICATION_PRIORITIES.HIGH,

    entityType:
      NOTIFICATION_ENTITY_TYPES.QUOTE,

    entityId:
      quote._id,

    data: {
      sourceType:
        quote.sourceType,

      quoteNumber:
        quote.quoteNumber,
    },

    actionUrl:
      `/quotes/${quote._id}`,

    dedupeKey:
      `quote_accepted:${quote._id}`,
  });
}

/*
|--------------------------------------------------------------------------
| Quote Rejected
|--------------------------------------------------------------------------
*/

function quoteRejected(quote) {
  notifyAdminsSafe({
    type:
      NOTIFICATION_TYPES.QUOTE_REJECTED,

    title:
      'Quote Rejected',

    message:
      `A ${quote.sourceType} quote has been rejected by the customer.`,

    priority:
      NOTIFICATION_PRIORITIES.NORMAL,

    entityType:
      NOTIFICATION_ENTITY_TYPES.QUOTE,

    entityId:
      quote._id,

    data: {
      sourceType:
        quote.sourceType,

      quoteNumber:
        quote.quoteNumber,
    },

    actionUrl:
      `/quotes/${quote._id}`,

    dedupeKey:
      `quote_rejected:${quote._id}`,
  });
}

/*
|--------------------------------------------------------------------------
| Payment Success
|--------------------------------------------------------------------------
*/

function paymentSuccess(payment) {
  notifyAdminsSafe({
    type:
      NOTIFICATION_TYPES.PAYMENT_SUCCESS,

    title:
      'Payment Received',

    message:
      `Payment of Rs. ${payment.amount ?? 0} has been completed.`,

    priority:
      NOTIFICATION_PRIORITIES.HIGH,

    entityType:
      NOTIFICATION_ENTITY_TYPES.PAYMENT,

    entityId:
      payment._id,

    data: {
      orderId:
        payment.order,

      amount:
        payment.amount,

      method:
        payment.method,

      status:
        payment.status,
    },

    actionUrl:
      `/payments/${payment._id}`,

    dedupeKey:
      `payment_success:${payment._id}`,
  });
}

/*
|--------------------------------------------------------------------------
| Payment Failed
|--------------------------------------------------------------------------
*/

function paymentFailed(payment) {
  notifyAdminsSafe({
    type:
      NOTIFICATION_TYPES.PAYMENT_FAILED,

    title:
      'Payment Failed',

    message:
      `A ${payment.method || ''} payment attempt failed.`.trim(),

    priority:
      NOTIFICATION_PRIORITIES.HIGH,

    entityType:
      NOTIFICATION_ENTITY_TYPES.PAYMENT,

    entityId:
      payment._id,

    data: {
      orderId:
        payment.order,

      amount:
        payment.amount,

      method:
        payment.method,
    },

    actionUrl:
      `/payments/${payment._id}`,

    dedupeKey:
      `payment_failed:${payment._id}`,
  });
}

/*
|--------------------------------------------------------------------------
| New Review
|--------------------------------------------------------------------------
*/

function newReview(review) {
  notifyAdminsSafe({
    type:
      NOTIFICATION_TYPES.NEW_REVIEW,

    title:
      'New Product Review',

    message:
      `A new ${review.rating}-star product review is awaiting moderation.`,

    priority:
      NOTIFICATION_PRIORITIES.NORMAL,

    entityType:
      NOTIFICATION_ENTITY_TYPES.REVIEW,

    entityId:
      review._id,

    data: {
      productId:
        review.product,

      rating:
        review.rating,

      status:
        review.status,
    },

    actionUrl:
      `/reviews/${review._id}`,

    dedupeKey:
      `new_review:${review._id}`,
  });
}
function lowStock(sku) {
  notifyAdminsSafe({
    type:
      NOTIFICATION_TYPES.LOW_STOCK,

    title:
      'Low Stock Alert',

    message:
      `${sku.sku} has only ${sku.available} units available.`,

    priority:
      NOTIFICATION_PRIORITIES.HIGH,

    entityType:
      NOTIFICATION_ENTITY_TYPES.SKU,

    entityId:
      sku._id,

    data: {
      sku:
        sku.sku,

      productId:
        sku.product,

      variantId:
        sku.variant,

      available:
        sku.available,

      lowStockThreshold:
        sku.lowStockThreshold,
    },

    actionUrl:
      `/inventory?sku=${encodeURIComponent(sku.sku)}`,

    /*
     * Important:
     *
     * This key is NOT enough by itself if stock later
     * recovers and becomes low again.
     *
     * Transition detection below ensures the function
     * only fires on OK -> LOW.
     */
    dedupeKey:
      `low_stock:${sku._id}:${sku.updatedAt?.getTime?.() || Date.now()}`,
  });
}

function outOfStock(sku) {
  notifyAdminsSafe({
    type:
      NOTIFICATION_TYPES.OUT_OF_STOCK,

    title:
      'Out of Stock',

    message:
      `${sku.sku} is now out of stock.`,

    priority:
      NOTIFICATION_PRIORITIES.CRITICAL,

    entityType:
      NOTIFICATION_ENTITY_TYPES.SKU,

    entityId:
      sku._id,

    data: {
      sku:
        sku.sku,

      productId:
        sku.product,

      variantId:
        sku.variant,

      available:
        sku.available,
    },

    actionUrl:
      `/inventory?sku=${encodeURIComponent(sku.sku)}`,

    dedupeKey:
      `out_of_stock:${sku._id}:${sku.updatedAt?.getTime?.() || Date.now()}`,
  });
}

function backInStock(sku) {
  notifyAdminsSafe({
    type:
      NOTIFICATION_TYPES.BACK_IN_STOCK,

    title:
      'Stock Replenished',

    message:
      `${sku.sku} is back in stock with ${sku.available} units available.`,

    priority:
      NOTIFICATION_PRIORITIES.NORMAL,

    entityType:
      NOTIFICATION_ENTITY_TYPES.SKU,

    entityId:
      sku._id,

    data: {
      sku:
        sku.sku,

      productId:
        sku.product,

      available:
        sku.available,
    },

    actionUrl:
      `/inventory?sku=${encodeURIComponent(sku.sku)}`,

    dedupeKey:
      `back_in_stock:${sku._id}:${sku.updatedAt?.getTime?.() || Date.now()}`,
  });
}
module.exports = {
  newOrder,

  newWholesaleRequest,
  newManufacturingRequest,
  newPrintingRequest,

  newReturnRequest,

  quoteAccepted,
  quoteRejected,

  paymentSuccess,
  paymentFailed,

  newReview,
  lowStock,
  outOfStock,
  backInStock,
};