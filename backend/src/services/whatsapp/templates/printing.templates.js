'use strict';

const { WHATSAPP_EVENTS: E } = require('../../../constants/WhatsApp');
const { lines, greet } = require('./format');

module.exports = {
  [E.ADMIN_PRINTING_REQUEST_NEW]: (v) => lines(['*New printing request*', ['Request', v.requestNumber], ['Customer', v.customerName], ['Business', v.businessName], ['Phone', v.customerPhone], ['Type', v.requestType], ['Quantity', v.quantity]]),
  [E.CUSTOMER_PRINTING_RECEIVED]: (v) => lines([greet(v.customerName), `We received your printing request ${v.requestNumber}. Our team will review it and get back to you.`]),
};
