'use strict';

const mongoose = require('mongoose');

const Product = require('../models/Product');
const ProductVariant = require(
  '../models/ProductVariant',
);
const Sku = require('../models/Sku');
const InventoryTransaction = require('../models/InventoryTransaction');

const ApiError = require('../utils/ApiError');
const { escapeRegex } = require(
  '../utils/slugify',
);
const { stockStatus } = require(
  '../utils/stock',
);
const stockNotification =
  require('./stockNotification.service');
const categoryService = require(
  './category.service',
);
const audit = require('./audit.service');
const logger = require('../config/logger');
const { runInTransaction } = require('../utils/transaction');
const adminNotificationEvents = require('./adminNotificationEvents.service');

/*
|--------------------------------------------------------------------------
| Adjustment Reason Labels
|--------------------------------------------------------------------------
*/

const ADJUSTMENT_REASON_LABELS =
  Object.freeze({
    factory_inward_batch_received:
      'Factory Inward Batch Received',

    physical_cycle_count_discrepancy:
      'Physical Cycle Count Discrepancy',

    fabric_qc_defect_damaged_return:
      'Fabric QC Defect / Damaged Return',

    sample_pull_institutional_client:
      'Sample Pull for Institutional Client',

    direct_sales_counter_allocation:
      'Direct Sales Counter Allocation',
  });

/*
|--------------------------------------------------------------------------
| List Inventory
|--------------------------------------------------------------------------
*/

async function list(q) {
  const filter = {};

  /*
   * Screenshot filters.
   */
  if (q.filter === 'out') {
    filter.available = 0;
  }

  if (q.filter === 'critical') {
    filter.available = {
      $gt: 0,
      $lt: 5,
    };
  }

  if (q.filter === 'low') {
    filter.stockStatus = 'low';
  }

  /*
   * Product filter.
   */
  if (q.product) {
    filter.product = q.product;
  }

  /*
   * Search:
   *
   * SKU
   * product title
   * color
   */
  if (q.search) {
    const re = new RegExp(
      escapeRegex(q.search),
      'i',
    );

    const [
      productIds,
      variantIds,
    ] = await Promise.all([
      Product.distinct(
        '_id',
        {
          name: re,
        },
      ),

      ProductVariant.distinct(
        '_id',
        {
          'color.name': re,
        },
      ),
    ]);

    filter.$or = [
      {
        sku: re,
      },

      ...(productIds.length
        ? [
            {
              product: {
                $in: productIds,
              },
            },
          ]
        : []),

      ...(variantIds.length
        ? [
            {
              variant: {
                $in: variantIds,
              },
            },
          ]
        : []),
    ];
  }

  /*
   * Category filter including descendants.
   */
  if (q.category) {
    const categoryIds =
      (
        await categoryService.subtreeIds(
          q.category,
        )
      ).map(
        (id) =>
          new mongoose.Types.ObjectId(
            id,
          ),
      );

    const productIds =
      await Product.distinct(
        '_id',
        {
          category: {
            $in: categoryIds,
          },
        },
      );

    if (filter.product) {
      const requestedProduct =
        String(filter.product);

      filter.product = {
        $in: productIds.filter(
          (id) =>
            String(id) ===
            requestedProduct,
        ),
      };
    } else {
      filter.product = {
        $in: productIds,
      };
    }
  }

  const sort = {
    [q.sortBy]:
      q.sortDir === 'asc'
        ? 1
        : -1,

    _id: 1,
  };

  const skip =
    (q.page - 1) *
    q.limit;

  const [
    total,
    skus,
  ] = await Promise.all([
    Sku.countDocuments(filter),

    Sku.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(q.limit)
      .lean(),
  ]);

  const [
    products,
    variants,
  ] = await Promise.all([
    Product.find({
      _id: {
        $in: skus.map(
          (sku) => sku.product,
        ),
      },
    })
      .select(
        'name slug category',
      )
      .lean(),

    ProductVariant.find({
      _id: {
        $in: skus.map(
          (sku) => sku.variant,
        ),
      },
    })
      .select(
        'color variantCode',
      )
      .lean(),
  ]);

  const productMap =
    new Map(
      products.map(
        (product) => [
          String(product._id),
          product,
        ],
      ),
    );

  const variantMap =
    new Map(
      variants.map(
        (variant) => [
          String(variant._id),
          variant,
        ],
      ),
    );

  const items =
    skus.map((sku) => {
      const product =
        productMap.get(
          String(sku.product),
        );

      const variant =
        variantMap.get(
          String(sku.variant),
        );

      return {
        sku: sku.sku,

        size: sku.size,

        price: sku.price,

        isEnabled:
          sku.isEnabled,

        /*
         * Dashboard terminology:
         *
         * stock         = On-Hand
         * reservedStock = Reserved
         * available     = Available to Sell
         */
        stock: sku.stock,

        reservedStock:
          sku.reservedStock,

        available:
          sku.available,

        lowStockThreshold:
          sku.lowStockThreshold ??
          null,

        stockStatus:
          sku.stockStatus,

        product: {
          _id:
            sku.product,

          name:
            product?.name,

          slug:
            product?.slug,

          category:
            product?.category,
        },

        variant: {
          _id:
            sku.variant,

          colorName:
            variant
              ?.color
              ?.name,

          variantCode:
            variant
              ?.variantCode,
        },
      };
    });

  return {
    items,

    meta: {
      page:
        q.page,

      limit:
        q.limit,

      total,

      totalPages:
        Math.max(
          1,
          Math.ceil(
            total /
              q.limit,
          ),
        ),
    },
  };
}

/*
|--------------------------------------------------------------------------
| Inventory Summary
|--------------------------------------------------------------------------
|
| Matches dashboard cards:
|
| Tracked SKUs
| Warehouse On-Hand
| Reserved for Orders
| Attention Required
|--------------------------------------------------------------------------
*/

async function summary() {
  const [result] =
    await Sku.aggregate([
      {
        $group: {
          _id: null,

          trackedSkus: {
            $sum: 1,
          },

          warehouseOnHand: {
            $sum: '$stock',
          },

          reservedForOrders: {
            $sum:
              '$reservedStock',
          },

          availableToSell: {
            $sum:
              '$available',
          },

          attentionRequired: {
            $sum: {
              $cond: [
                {
                  $or: [
                    {
                      $eq: [
                        '$stockStatus',
                        'low',
                      ],
                    },
                    {
                      $eq: [
                        '$stockStatus',
                        'out',
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },

          outOfStock: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    '$available',
                    0,
                  ],
                },
                1,
                0,
              ],
            },
          },

          criticalStock: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $gt: [
                        '$available',
                        0,
                      ],
                    },
                    {
                      $lt: [
                        '$available',
                        5,
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

  return {
    trackedSkus:
      result
        ?.trackedSkus ??
      0,

    warehouseOnHand:
      result
        ?.warehouseOnHand ??
      0,

    reservedForOrders:
      result
        ?.reservedForOrders ??
      0,

    availableToSell:
      result
        ?.availableToSell ??
      0,

    attentionRequired:
      result
        ?.attentionRequired ??
      0,

    outOfStock:
      result
        ?.outOfStock ??
      0,

    criticalStock:
      result
        ?.criticalStock ??
      0,
  };
}

/*
|--------------------------------------------------------------------------
| Adjust Inventory
|--------------------------------------------------------------------------
|
| Important:
|
| Deduction checks `available`, not only physical stock.
|
| Example:
|
| stock    = 20
| reserved = 8
| available= 12
|
| Admin cannot deduct > 12.
|--------------------------------------------------------------------------
*/

async function adjust(
  {
    sku,
    direction,
    quantity,
    reason,
    notes,
    reference,
  },
  actor,
  req,
) {
  const code = sku.toUpperCase();
  const remove = direction === 'remove';
  const delta = remove ? -quantity : quantity;

  /*
   * ONE transaction: stock change, derived stockStatus and the inventory
   * ledger row commit together or not at all. (Before this, a failure after
   * the stock update could leave stock changed with no history entry.)
   *
   * REMOVE requires enough `available` stock (reserved units cannot be taken).
   * ADD increases physical stock and available.
   * Audit and notifications run after the commit.
   */
  const outcome = await runInTransaction(async (session) => {
    const before = await Sku.findOneAndUpdate(
      remove ? { sku: code, available: { $gte: quantity } } : { sku: code },
      { $inc: { stock: delta, available: delta } },
      { new: false, session },
    );

    if (!before) {
      const exists = await Sku.exists({ sku: code }).session(session);

      if (!exists) {
        throw ApiError.notFound('SKU not found', 'SKU_NOT_FOUND');
      }

      throw ApiError.conflict('Not enough available stock to deduct', 'INSUFFICIENT_AVAILABLE_STOCK');
    }

    const newStock = before.stock + delta;
    const newAvailable = before.available + delta;

    await Sku.updateOne(
      { _id: before._id },
      {
        $set: {
          stockStatus: stockStatus({
            available: newAvailable,
            lowStockThreshold: before.lowStockThreshold,
          }),
        },
      },
      { session },
    );

    // Factory inward batches are stock_in; everything else is a manual adjustment.
    const transactionType =
      !remove && reason === 'factory_inward_batch_received' ? 'stock_in' : 'manual_adjustment';

    const [transaction] = await InventoryTransaction.create(
      [
        {
          product: before.product,
          variant: before.variant,
          sku: before.sku,
          type: transactionType,
          quantity: delta,
          previousStock: before.stock,
          newStock,
          reason: ADJUSTMENT_REASON_LABELS[reason] || reason,
          notes,
          reference,
          createdBy: actor.id,
        },
      ],
      { session },
    );

    const fresh = await Sku.findById(before._id).session(session).lean();

    return { before, fresh, transaction, newStock, newAvailable };
  });

  const { before, fresh, transaction, newStock, newAvailable } = outcome;

  await audit.record(
    actor,
    'inventory.adjust',
    'Sku',
    before.sku,
    {
      direction,
      quantity,
      delta,
      previousStock: before.stock,
      newStock,
      previousAvailable: before.available,
      newAvailable,
      reason,
      reasonLabel: ADJUSTMENT_REASON_LABELS[reason] || reason,
      transactionId: transaction._id,
    },
    req,
  );

  /*
   * Centralized automatic stock notification (after commit):
   * OK -> LOW = LOW_STOCK, LOW -> OUT = OUT_OF_STOCK, LOW/OUT -> OK = BACK_IN_STOCK,
   * unchanged state = nothing. A notification failure must not undo the adjustment.
   */
  if (fresh) {
    try {
      await stockNotification.handleStockTransition({ before, after: fresh });
    } catch (error) {
      logger.warn({ err: error.message, sku: before.sku }, 'Stock notification failed after inventory adjustment');
    }
  }

  return {
    sku: fresh.sku,
    stock: fresh.stock,
    reservedStock: fresh.reservedStock,
    available: fresh.available,
    lowStockThreshold: fresh.lowStockThreshold ?? null,
    stockStatus: fresh.stockStatus,
    transactionId: transaction._id,
  };
}

/*
|--------------------------------------------------------------------------
| Inventory History
|--------------------------------------------------------------------------
*/

async function history(
  sku,
  {
    page,
    limit,
  },
) {
  const code =
    sku.toUpperCase();

  const exists =
    await Sku.exists({
      sku: code,
    });

  if (!exists) {
    throw ApiError.notFound(
      'SKU not found',
      'SKU_NOT_FOUND',
    );
  }

  const skip =
    (page - 1) *
    limit;

  const [
    total,
    rows,
  ] = await Promise.all([
    InventoryTransaction
      .countDocuments({
        sku: code,
      }),

    InventoryTransaction
      .find({
        sku: code,
      })
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip(skip)
      .limit(limit)
      .populate(
        'createdBy',
        'name',
      )
      .lean(),
  ]);

  return {
    items:
      rows,

    meta: {
      page,

      limit,

      total,

      totalPages:
        Math.max(
          1,
          Math.ceil(
            total /
              limit,
          ),
        ),
    },
  };
}

module.exports = {
  list,
  summary,
  adjust,
  history,
};