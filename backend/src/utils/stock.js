'use strict';
const { DEFAULT_LOW_STOCK_THRESHOLD } = require('../constants/inventory');

/** Derived, stored stock status. out: nothing available; low: at/below threshold; ok otherwise. */
function stockStatus({ available, lowStockThreshold }, defaultThreshold = DEFAULT_LOW_STOCK_THRESHOLD) {
  const threshold = lowStockThreshold ?? defaultThreshold;
  if (available <= 0) return 'out';
  return available <= threshold ? 'low' : 'ok';
}

module.exports = { stockStatus };
