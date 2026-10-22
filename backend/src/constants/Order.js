'use strict';

const { enumList } = require('../utils/enumList');

const ORDER_TYPES = enumList({
  RETAIL: 'retail',
  WHOLESALE: 'wholesale',
  MANUFACTURING: 'manufacturing',
  PRINTING: 'printing',
});

const ORDER_STATUSES = enumList({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
});

const PAYMENT_STATUSES = enumList({
  PENDING: 'pending',
  PROCESSING: 'processing',
  PAID: 'paid',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
});

const ORDER_STATUS_TRANSITIONS = Object.freeze({
  pending: Object.freeze([
    'confirmed',
    'cancelled',
  ]),

  confirmed: Object.freeze([
    'processing',
    'cancelled',
  ]),

  processing: Object.freeze([
    'shipped',
    'cancelled',
  ]),

  shipped: Object.freeze([
    'delivered',
  ]),

  delivered: Object.freeze([]),

  cancelled: Object.freeze([]),
});

function canTransitionOrderStatus(from, to) {
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

module.exports = {
  ORDER_TYPES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  canTransitionOrderStatus,
};
