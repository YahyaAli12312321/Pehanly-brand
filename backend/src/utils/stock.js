'use strict';
const { LOW_STOCK_THRESHOLD } = require('../constants/inventory');

/**
 * Derived, stored stock status. out: nothing available; low: 1..LOW_STOCK_THRESHOLD available; ok otherwise.
 * The threshold is fixed (constants/inventory.js). A lowStockThreshold passed by older callers/legacy SKU documents is ignored.
 */
function stockStatus({ available }) {
  if (!(available > 0)) return 'out';
  return available <= LOW_STOCK_THRESHOLD ? 'low' : 'ok';
}

module.exports = { stockStatus, LOW_STOCK_THRESHOLD };
