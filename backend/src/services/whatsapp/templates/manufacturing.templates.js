'use strict';

const { WHATSAPP_EVENTS: E } = require('../../../constants/WhatsApp');
const { lines, greet } = require('./format');

module.exports = {
  [E.ADMIN_MANUFACTURING_REQUEST_NEW]: (v) => lines(['*New manufacturing request*', ['Request', v.requestNumber], ['Customer', v.customerName], ['Business', v.businessName], ['Phone', v.customerPhone], ['Type', v.requestType], ['Quantity', v.quantity]]),
  [E.CUSTOMER_MANUFACTURING_RECEIVED]: (v) => lines([greet(v.customerName), `We received your manufacturing request ${v.requestNumber}. Our team will review it and get back to you.`]),
};
