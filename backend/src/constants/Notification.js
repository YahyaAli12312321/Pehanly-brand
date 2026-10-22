'use strict';

const NOTIFICATION_TYPES = Object.freeze({
  NEW_ORDER: 'new_order',

  NEW_WHOLESALE_REQUEST: 'new_wholesale_request',
  NEW_MANUFACTURING_REQUEST: 'new_manufacturing_request',
  NEW_PRINTING_REQUEST: 'new_printing_request',

  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
  BACK_IN_STOCK: 'back_in_stock',

  NEW_RETURN_REQUEST: 'new_return_request',

  QUOTE_ACCEPTED: 'quote_accepted',
  QUOTE_REJECTED: 'quote_rejected',

  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_FAILED: 'payment_failed',

  NEW_REVIEW: 'new_review',
});

const NOTIFICATION_PRIORITIES = Object.freeze({
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const NOTIFICATION_ENTITY_TYPES = Object.freeze({
  ORDER: 'order',
  SKU: 'sku',
  PRODUCT: 'product',

  WHOLESALE_REQUEST: 'wholesale_request',
  MANUFACTURING_REQUEST: 'manufacturing_request',
  PRINTING_REQUEST: 'printing_request',

  RETURN_REQUEST: 'return_request',

  QUOTE: 'quote',
  PAYMENT: 'payment',
  REVIEW: 'review',
});

const DEVICE_PLATFORMS = Object.freeze({
  WEB: 'web',
  ANDROID: 'android',
  IOS: 'ios',
});

module.exports = {
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_ENTITY_TYPES,
  DEVICE_PLATFORMS,
};