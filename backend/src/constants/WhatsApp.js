'use strict';

/*
 * WhatsApp notification catalogue. The event key doubles as the (future) Meta template name, so adding Meta later means
 * approving a template per event key - no business code changes.
 */

const WHATSAPP_AUDIENCES = Object.freeze({ ADMIN: 'admin', CUSTOMER: 'customer' });

const WHATSAPP_STATUSES = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  SENT: 'sent', // accepted by the provider. For provider "mock" this is SIMULATED (WhatsAppMessage.simulated = true)
  DELIVERED: 'delivered', // reserved for the Meta delivery webhook; the mock provider never produces it
  FAILED: 'failed',
  SKIPPED: 'skipped', // not attempted: no / invalid phone number, or notifications switched off
});

const WHATSAPP_EVENTS = Object.freeze({
  // ---- admin ----
  ADMIN_ORDER_NEW_RETAIL: 'admin_order_new_retail',
  ADMIN_ORDER_NEW_WHOLESALE: 'admin_order_new_wholesale',
  ADMIN_ORDER_CANCELLATION_REQUESTED: 'admin_order_cancellation_requested',
  ADMIN_ORDER_CANCELLED: 'admin_order_cancelled',
  ADMIN_PAYMENT_RECEIVED: 'admin_payment_received',
  ADMIN_PAYMENT_FAILED: 'admin_payment_failed',
  ADMIN_LOW_STOCK: 'admin_low_stock',
  ADMIN_OUT_OF_STOCK: 'admin_out_of_stock',
  ADMIN_BACK_IN_STOCK: 'admin_back_in_stock',
  ADMIN_WHOLESALE_REQUEST_NEW: 'admin_wholesale_request_new',
  ADMIN_MANUFACTURING_REQUEST_NEW: 'admin_manufacturing_request_new',
  ADMIN_PRINTING_REQUEST_NEW: 'admin_printing_request_new',
  ADMIN_QUOTE_ACCEPTED: 'admin_quote_accepted',
  ADMIN_QUOTE_REJECTED: 'admin_quote_rejected',
  ADMIN_DAILY_SUMMARY: 'admin_daily_summary',
  ADMIN_TEST: 'admin_test_message',
  // ---- customer ----
  CUSTOMER_ORDER_PLACED: 'customer_order_placed',
  CUSTOMER_ORDER_CONFIRMED: 'customer_order_confirmed',
  CUSTOMER_ORDER_PROCESSING: 'customer_order_processing',
  CUSTOMER_ORDER_SHIPPED: 'customer_order_shipped',
  CUSTOMER_SHIPMENT_UPDATED: 'customer_shipment_updated',
  CUSTOMER_ORDER_DELIVERED: 'customer_order_delivered',
  CUSTOMER_ORDER_CANCELLED: 'customer_order_cancelled',
  CUSTOMER_CANCELLATION_RECEIVED: 'customer_cancellation_received',
  CUSTOMER_WHOLESALE_RECEIVED: 'customer_wholesale_received',
  CUSTOMER_MANUFACTURING_RECEIVED: 'customer_manufacturing_received',
  CUSTOMER_PRINTING_RECEIVED: 'customer_printing_received',
  CUSTOMER_QUOTE_READY: 'customer_quote_ready',
  CUSTOMER_QUOTE_ACCEPTED: 'customer_quote_accepted',
  CUSTOMER_QUOTE_REJECTED: 'customer_quote_rejected',
  CUSTOMER_REQUEST_STATUS: 'customer_request_status_updated',
});

const WHATSAPP_PROVIDERS = Object.freeze({ MOCK: 'mock', META: 'meta', OFF: 'off' });

const audienceOf = (event) => (String(event).startsWith('admin_') ? WHATSAPP_AUDIENCES.ADMIN : WHATSAPP_AUDIENCES.CUSTOMER);

module.exports = { WHATSAPP_AUDIENCES, WHATSAPP_STATUSES, WHATSAPP_EVENTS, WHATSAPP_PROVIDERS, audienceOf };
