'use strict';

const Sku = require('../models/Sku');
const ApiError = require('../utils/ApiError');
const { stockStatus } = require('../utils/stock');

/*
|--------------------------------------------------------------------------
| Build Stock Snapshot
|--------------------------------------------------------------------------
|
| Notification system ko sirf stock transition determine karne ke liye
| required fields dete hain.
|
| IMPORTANT:
| Is service ke andar notification/FCM send nahi hogi because these
| functions MongoDB transactions ke andar use ho sakte hain.
|--------------------------------------------------------------------------
*/

function buildStockSnapshot(sku) {
  if (!sku) {
    return null;
  }

  return {
    _id: sku._id,

    sku: sku.sku,

    product: sku.product,

    variant: sku.variant,

    stock: sku.stock,

    reservedStock:
      sku.reservedStock,

    available:
      sku.available,

    lowStockThreshold:
      sku.lowStockThreshold,

    stockStatus:
      sku.stockStatus,
  };
}

/*
|--------------------------------------------------------------------------
| Reserve SKU
|--------------------------------------------------------------------------
|
| Order placement:
|
| available      decreases
| reservedStock  increases
| physical stock unchanged
|
| Example:
|
| Before:
| stock = 10
| reserved = 0
| available = 10
|
| Reserve 3:
| stock = 10
| reserved = 3
| available = 7
|
| This operation CAN cause:
|
| OK  -> LOW
| OK  -> OUT
| LOW -> OUT
|
| so caller ko before + after snapshots return karte hain.
|--------------------------------------------------------------------------
*/

async function reserveSku(
  skuId,
  quantity,
  session,
) {
  /*
  |--------------------------------------------------------------------------
  | Atomic Reservation + Previous State
  |--------------------------------------------------------------------------
  |
  | new:false se update successful hone par previous SKU state milti hai.
  |--------------------------------------------------------------------------
  */

  const before =
    await Sku.findOneAndUpdate(
      {
        _id: skuId,

        isEnabled:
          true,

        available: {
          $gte:
            quantity,
        },
      },

      {
        $inc: {
          reservedStock:
            quantity,

          available:
            -quantity,
        },
      },

      {
        new: false,
        session,
      },
    );

  if (!before) {
    throw ApiError.conflict(
      'One or more items are unavailable or have insufficient stock',
      'INSUFFICIENT_STOCK',
    );
  }

  const newAvailable =
    before.available -
    quantity;

  const nextStockStatus =
    stockStatus({
      available:
        newAvailable,

      lowStockThreshold:
        before.lowStockThreshold,
    });

  /*
  |--------------------------------------------------------------------------
  | Persist Derived Stock Status
  |--------------------------------------------------------------------------
  */

  await Sku.updateOne(
    {
      _id:
        before._id,
    },

    {
      $set: {
        stockStatus:
          nextStockStatus,
      },
    },

    {
      session,
    },
  );

  /*
  |--------------------------------------------------------------------------
  | Fetch Final State Inside Same Transaction
  |--------------------------------------------------------------------------
  */

  const after =
    await Sku.findById(
      before._id,
    )
      .session(session)
      .lean();

  return {
    sku:
      after,

    stockTransition: {
      before:
        buildStockSnapshot(
          before,
        ),

      after:
        buildStockSnapshot(
          after,
        ),
    },
  };
}

/*
|--------------------------------------------------------------------------
| Release SKU
|--------------------------------------------------------------------------
|
| Cancellation / reservation release:
|
| reservedStock decreases
| available increases
|
| This CAN cause:
|
| OUT -> LOW
| OUT -> OK
| LOW -> OK
|
| Therefore BACK_IN_STOCK / LOW_STOCK notification may be required.
|--------------------------------------------------------------------------
*/

async function releaseSku(
  skuId,
  quantity,
  session,
) {
  const before =
    await Sku.findOneAndUpdate(
      {
        _id: skuId,

        reservedStock: {
          $gte:
            quantity,
        },
      },

      {
        $inc: {
          reservedStock:
            -quantity,

          available:
            quantity,
        },
      },

      {
        new: false,
        session,
      },
    );

  if (!before) {
    throw ApiError.conflict(
      'Unable to release reserved stock',
      'INVALID_STOCK_RELEASE',
    );
  }

  const newAvailable =
    before.available +
    quantity;

  const nextStockStatus =
    stockStatus({
      available:
        newAvailable,

      lowStockThreshold:
        before.lowStockThreshold,
    });

  await Sku.updateOne(
    {
      _id:
        before._id,
    },

    {
      $set: {
        stockStatus:
          nextStockStatus,
      },
    },

    {
      session,
    },
  );

  const after =
    await Sku.findById(
      before._id,
    )
      .session(session)
      .lean();

  return {
    sku:
      after,

    stockTransition: {
      before:
        buildStockSnapshot(
          before,
        ),

      after:
        buildStockSnapshot(
          after,
        ),
    },
  };
}

/*
|--------------------------------------------------------------------------
| Commit SKU
|--------------------------------------------------------------------------
|
| Delivery / stock commitment:
|
| physical stock decreases
| reservedStock decreases
| available DOES NOT change
|
| Example:
|
| Before:
| stock = 10
| reserved = 2
| available = 8
|
| Commit 2:
| stock = 8
| reserved = 0
| available = 8
|
| Since available does not change, availability-based LOW/OUT/BACK-IN-STOCK
| notification is NOT required here.
|--------------------------------------------------------------------------
*/

async function commitSku(
  skuId,
  quantity,
  session,
) {
  const sku =
    await Sku.findOneAndUpdate(
      {
        _id: skuId,

        reservedStock: {
          $gte:
            quantity,
        },

        stock: {
          $gte:
            quantity,
        },
      },

      {
        $inc: {
          stock:
            -quantity,

          reservedStock:
            -quantity,
        },
      },

      {
        new: true,
        session,
      },
    );

  if (!sku) {
    throw ApiError.conflict(
      'Unable to commit reserved stock',
      'INVALID_STOCK_COMMIT',
    );
  }

  return sku;
}

module.exports = {
  reserveSku,
  releaseSku,
  commitSku,
};