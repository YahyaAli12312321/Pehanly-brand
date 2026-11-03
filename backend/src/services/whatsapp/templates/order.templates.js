'use strict';

const { WHATSAPP_EVENTS: E } = require('../../../constants/WhatsApp');
const { money, paymentMethod, lines, greet } = require('./format');

const total = (v) => money(v.total, v.currency);

module.exports = {
  /* ---- admin ---- */
  [E.ADMIN_ORDER_NEW_RETAIL]: (v) => lines(['*New retail order*', ['Order', v.orderNumber], ['Customer', v.customerName], ['Phone', v.customerPhone], ['City', v.city], ['Total', total(v)], ['Payment', paymentMethod(v.paymentMethod)]]),
  [E.ADMIN_ORDER_NEW_WHOLESALE]: (v) => lines(['*New wholesale order*', ['Order', v.orderNumber], ['Customer', v.customerName], ['Phone', v.customerPhone], ['Total', total(v)], ['Payment', paymentMethod(v.paymentMethod)]]),
  [E.ADMIN_ORDER_CANCELLATION_REQUESTED]: (v) => lines(['*Cancellation requested*', ['Order', v.orderNumber], ['Customer', v.customerName], ['Reason', v.reason]]),
  [E.ADMIN_ORDER_CANCELLED]: (v) => lines(['*Order cancelled*', ['Order', v.orderNumber], ['Customer', v.customerName], ['Total', total(v)]]),
  [E.ADMIN_PAYMENT_RECEIVED]: (v) => lines(['*Payment received*', ['Order', v.orderNumber], ['Amount', money(v.amount, v.currency)], ['Method', paymentMethod(v.paymentMethod)]]),
  [E.ADMIN_PAYMENT_FAILED]: (v) => lines(['*Payment failed*', ['Order', v.orderNumber], ['Amount', money(v.amount, v.currency)], ['Method', paymentMethod(v.paymentMethod)]]),

  /* ---- customer ---- */
  [E.CUSTOMER_ORDER_PLACED]: (v) => lines([greet(v.customerName), `Thank you for your order with PEHANLY. We have received order ${v.orderNumber}.`, ['Total', total(v)], ['Payment', paymentMethod(v.paymentMethod)], 'We will update you as it progresses.']),
  [E.CUSTOMER_ORDER_CONFIRMED]: (v) => lines([greet(v.customerName), `Your order ${v.orderNumber} has been confirmed.`]),
  [E.CUSTOMER_ORDER_PROCESSING]: (v) => lines([greet(v.customerName), `We have started preparing your order ${v.orderNumber}.`]),
  [E.CUSTOMER_ORDER_DELIVERED]: (v) => lines([greet(v.customerName), `Your order ${v.orderNumber} has been delivered. Thank you for shopping with PEHANLY.`]),
  [E.CUSTOMER_ORDER_CANCELLED]: (v) => lines([greet(v.customerName), `Your order ${v.orderNumber} has been cancelled.`, 'If you did not expect this, please contact us.']),
  [E.CUSTOMER_CANCELLATION_RECEIVED]: (v) => lines([greet(v.customerName), `We received your request to cancel order ${v.orderNumber}. Our team will review it and update you.`]),
};
