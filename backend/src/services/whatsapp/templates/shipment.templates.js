'use strict';

const { WHATSAPP_EVENTS: E } = require('../../../constants/WhatsApp');
const { lines, greet } = require('./format');

/* Delivery details depend on the method: a local rider (Karachi) has a name and phone, a courier a name and tracking number. */
function deliveryLines(v) {
  if (v.deliveryMethod === 'local_rider') return [['Rider', v.riderName], ['Rider phone', v.riderPhone]];
  return [['Courier', v.courierName], ['Tracking number', v.trackingNumber], ['Track here', v.trackingUrl]];
}

module.exports = {
  [E.CUSTOMER_ORDER_SHIPPED]: (v) => lines([greet(v.customerName), `Your order ${v.orderNumber} has been shipped.`, ...deliveryLines(v)]),
  [E.CUSTOMER_SHIPMENT_UPDATED]: (v) => lines([greet(v.customerName), `Shipping details for order ${v.orderNumber} were updated.`, ...deliveryLines(v)]),
};
