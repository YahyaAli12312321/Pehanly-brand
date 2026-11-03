'use strict';

const { WHATSAPP_EVENTS: E } = require('../../../constants/WhatsApp');
const { money, lines, greet } = require('./format');

module.exports = {
  [E.CUSTOMER_QUOTE_READY]: (v) => lines([greet(v.customerName), `Your ${v.service} quote ${v.quoteNumber} is ready.`, ['Quote amount', money(v.amount, v.currency)], ['Valid until', v.validUntil], 'Please review it in your account.']),
  [E.CUSTOMER_QUOTE_ACCEPTED]: (v) => lines([greet(v.customerName), `You accepted ${v.service} quote ${v.quoteNumber}. We will contact you with the next steps.`]),
  [E.CUSTOMER_QUOTE_REJECTED]: (v) => lines([greet(v.customerName), `${v.service} quote ${v.quoteNumber} was declined.`]),
  [E.CUSTOMER_REQUEST_STATUS]: (v) => lines([greet(v.customerName), `Your ${v.service} request ${v.requestNumber} is now: ${v.statusLabel}.`, ['Note', v.note]]),
  [E.ADMIN_QUOTE_ACCEPTED]: (v) => lines(['*Quote accepted*', ['Quote', v.quoteNumber], ['Service', v.service], ['Customer', v.customerName], ['Amount', money(v.amount, v.currency)]]),
  [E.ADMIN_QUOTE_REJECTED]: (v) => lines(['*Quote rejected*', ['Quote', v.quoteNumber], ['Service', v.service], ['Customer', v.customerName], ['Amount', money(v.amount, v.currency)]]),
};
