'use strict';
/**
 * Low-stock threshold: FIXED by the business at 10 units and not editable by admins.
 * A SKU with 1..10 available units is "low", 0 is "out". This is the only place the number lives; every status
 * calculation (utils/stock.js), inventory view and notification reads it from here. A per-SKU lowStockThreshold that may
 * still be stored on legacy SKU documents is ignored (scripts/normalize-low-stock.js clears it).
 */
exports.LOW_STOCK_THRESHOLD = 10;
// Backward-compatible alias for older imports.
exports.DEFAULT_LOW_STOCK_THRESHOLD = exports.LOW_STOCK_THRESHOLD;
