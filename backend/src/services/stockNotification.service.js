'use strict';

const {
  stockStatus,
} = require('../utils/stock');

const adminNotificationEvents =
  require('./adminNotificationEvents.service');

/*
|--------------------------------------------------------------------------
| Handle Stock Transition
|--------------------------------------------------------------------------
|
| Notification sirf actual stock-state transition par create hogi.
|
| Examples:
|
| OK  -> OK   = no notification
| OK  -> LOW  = LOW_STOCK
| LOW -> LOW  = no notification
| LOW -> OUT  = OUT_OF_STOCK
| OUT -> OUT  = no notification
| OUT -> LOW  = LOW_STOCK
| LOW -> OK   = BACK_IN_STOCK
| OUT -> OK   = BACK_IN_STOCK
|
| IMPORTANT:
| Is function ko business transaction commit hone ke BAAD call karna hai.
|--------------------------------------------------------------------------
*/

async function handleStockTransition({
  before,
  after,
}) {
  if (
    !before ||
    !after
  ) {
    return {
      triggered: false,
      reason:
        'MISSING_STOCK_SNAPSHOT',
    };
  }

  const previousStatus =
    stockStatus({
      available:
        before.available,

      lowStockThreshold:
        before.lowStockThreshold,
    });

  const currentStatus =
    stockStatus({
      available:
        after.available,

      lowStockThreshold:
        after.lowStockThreshold,
    });

  /*
  |--------------------------------------------------------------------------
  | No State Change
  |--------------------------------------------------------------------------
  */

  if (
    previousStatus ===
    currentStatus
  ) {
    return {
      triggered: false,

      previousStatus,
      currentStatus,

      reason:
        'STOCK_STATUS_UNCHANGED',
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Any State -> OUT
  |--------------------------------------------------------------------------
  */

  if (
    currentStatus === 'out'
  ) {
    adminNotificationEvents
      .outOfStock(after);

    return {
      triggered: true,

      event:
        'out_of_stock',

      previousStatus,
      currentStatus,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | OK / OUT -> LOW
  |--------------------------------------------------------------------------
  |
  | OUT -> LOW can happen when stock is partially replenished.
  |--------------------------------------------------------------------------
  */

  if (
    currentStatus === 'low'
  ) {
    adminNotificationEvents
      .lowStock(after);

    return {
      triggered: true,

      event:
        'low_stock',

      previousStatus,
      currentStatus,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | LOW / OUT -> OK
  |--------------------------------------------------------------------------
  */

  if (
    currentStatus === 'ok' &&
    (
      previousStatus ===
        'low' ||
      previousStatus ===
        'out'
    )
  ) {
    adminNotificationEvents
      .backInStock(after);

    return {
      triggered: true,

      event:
        'back_in_stock',

      previousStatus,
      currentStatus,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Defensive Fallback
  |--------------------------------------------------------------------------
  */

  return {
    triggered: false,

    previousStatus,
    currentStatus,

    reason:
      'NO_NOTIFICATION_REQUIRED',
  };
}

module.exports = {
  handleStockTransition,
};