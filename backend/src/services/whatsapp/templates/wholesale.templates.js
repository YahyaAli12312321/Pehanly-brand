'use strict';

const { WHATSAPP_EVENTS: E } = require('../../../constants/WhatsApp');
const { lines, greet } = require('./format');

module.exports = {
  [E.ADMIN_WHOLESALE_REQUEST_NEW]: (v) => lines(['*New wholesale request*', ['Request', v.requestNumber], ['Customer', v.customerName], ['Business', v.businessName], ['Phone', v.customerPhone], ['Type', v.requestType], ['Quantity', v.quantity]]),
  [E.CUSTOMER_WHOLESALE_RECEIVED]: (v) => lines([greet(v.customerName), `We received your wholesale request ${v.requestNumber}. Our team will review it and get back to you.`]),
};
