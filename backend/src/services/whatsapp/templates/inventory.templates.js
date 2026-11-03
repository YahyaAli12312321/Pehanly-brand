'use strict';

const { WHATSAPP_EVENTS: E } = require('../../../constants/WhatsApp');
const { lines } = require('./format');

const stockLines = (title, v) => lines([title, ['Product', v.productName], ['SKU', v.sku], ['Available', v.available], ['Low-stock threshold', v.lowStockThreshold]]);

module.exports = {
  [E.ADMIN_LOW_STOCK]: (v) => stockLines('*Low stock*', v),
  [E.ADMIN_OUT_OF_STOCK]: (v) => stockLines('*Out of stock*', v),
  [E.ADMIN_BACK_IN_STOCK]: (v) => stockLines('*Back in stock*', v),
};
