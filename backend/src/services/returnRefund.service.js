'use strict';

const mongoose = require('mongoose');

const ReturnRefundRequest = require('../models/ReturnRefundRequest');
const Order = require('../models/order.model');
const Payment = require('../models/Payment');
const Sku = require('../models/Sku');
const InventoryTransaction = require('../models/InventoryTransaction');
const stockNotification = require('./stockNotification.service');
const adminNotificationEvents = require('./adminNotificationEvents.service');
const logger = require('../config/logger');
const settingsService = require('./settings.service');
const ApiError = require('../utils/ApiError');
const { stockStatus } = require('../utils/stock');

const {
  RETURN_STATUSES,
  RETURN_ITEM_CONDITIONS,
  REFUND_STATUSES,
  REFUND_TYPES,
} = require('../constants/ReturnRefund');

const {
  ORDER_STATUSES,
  PAYMENT_STATUSES: ORDER_PAYMENT_STATUSES,
} = require('../constants/Order');

const {
  PAYMENT_STATUSES,
} = require('../constants/Payment');

function calculateRefundType(amount, paymentAmount) {
  return amount >= paymentAmount
    ? REFUND_TYPES.FULL
    : REFUND_TYPES.PARTIAL;
}

async function createCustomerReturn({
  orderId,
  userId,
  items,
  reason,
  images = [],
  customerNote,
}) {
  /*
  |--------------------------------------------------------------------------
  | Find Customer Order
  |--------------------------------------------------------------------------
  */

  const order =
    await Order.findOne({
      _id: orderId,
      user: userId,
    });

  if (!order) {
    throw ApiError.notFound(
      'Order not found',
      'ORDER_NOT_FOUND',
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Only Delivered Orders Can Be Returned
  |--------------------------------------------------------------------------
  */

  if (
    order.orderStatus !==
    ORDER_STATUSES.DELIVERED
  ) {
    throw ApiError.badRequest(
      'Only delivered orders can be returned',
      'ORDER_NOT_DELIVERED',
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Validate Return Items
  |--------------------------------------------------------------------------
  */

  /*
   * Return policy comes from StoreSettings (returns.enabled / windowDays),
   * measured from the delivery date.
   */
  const settings = await settingsService.getSettings();

  if (settings.returns?.enabled === false) {
    throw ApiError.badRequest(
      'Returns are currently not accepted',
      'RETURNS_DISABLED',
    );
  }

  const windowDays = settings.returns?.windowDays ?? 7;
  const deliveredAt =
    order.shipment?.deliveredAt || order.updatedAt;

  if (
    deliveredAt &&
    Date.now() - new Date(deliveredAt).getTime() >
      windowDays * 24 * 60 * 60 * 1000
  ) {
    throw ApiError.badRequest(
      `The ${windowDays}-day return window for this order has passed`,
      'RETURN_WINDOW_EXPIRED',
    );
  }

  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    throw ApiError.badRequest(
      'At least one return item is required',
      'RETURN_ITEMS_REQUIRED',
    );
  }

  const seenItems =
    new Set();

  const returnItems = [];

  /*
  |--------------------------------------------------------------------------
  | Build Return Item Snapshots
  |--------------------------------------------------------------------------
  */

  for (
    const requestedItem
    of items
  ) {
    const orderItemId =
      String(
        requestedItem.orderItem,
      );

    /*
    |--------------------------------------------------------------------------
    | Prevent Duplicate Order Items
    |--------------------------------------------------------------------------
    */

    if (
      seenItems.has(
        orderItemId,
      )
    ) {
      throw ApiError.badRequest(
        'Duplicate order items are not allowed',
        'DUPLICATE_RETURN_ITEM',
      );
    }

    seenItems.add(
      orderItemId,
    );

    /*
    |--------------------------------------------------------------------------
    | Verify Item Belongs To Order
    |--------------------------------------------------------------------------
    */

    const orderItem =
      order.items.id(
        requestedItem.orderItem,
      );

    if (!orderItem) {
      throw ApiError.badRequest(
        'One or more return items do not belong to this order',
        'INVALID_RETURN_ITEM',
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Quantity
    |--------------------------------------------------------------------------
    */

    const quantity =
      Number(
        requestedItem.quantity,
      );

    if (
      !Number.isInteger(
        quantity,
      ) ||
      quantity <= 0
    ) {
      throw ApiError.badRequest(
        'Return quantity must be a positive integer',
        'INVALID_RETURN_QUANTITY',
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Previous Return Quantity
    |--------------------------------------------------------------------------
    |
    | Same Order item ke against pehle se kitni quantity return request
    | mein consume ho chuki hai ye calculate hota hai.
    |
    | Rejected aur cancelled requests quantity consume nahi karti.
    |--------------------------------------------------------------------------
    */

    const previousReturns =
      await ReturnRefundRequest
        .aggregate([
          {
            $match: {
              order:
                order._id,

              returnStatus: {
                $nin: [
                  RETURN_STATUSES
                    .REJECTED,

                  RETURN_STATUSES
                    .CANCELLED,
                ],
              },
            },
          },

          {
            $unwind:
              '$items',
          },

          {
            $match: {
              'items.orderItem':
                orderItem._id,
            },
          },

          {
            $group: {
              _id: null,

              quantity: {
                $sum:
                  '$items.quantity',
              },
            },
          },
        ]);

    const alreadyRequested =
      previousReturns[0]
        ?.quantity || 0;

    /*
    |--------------------------------------------------------------------------
    | Prevent Over-Return
    |--------------------------------------------------------------------------
    */

    if (
      alreadyRequested +
        quantity >
      orderItem.quantity
    ) {
      throw ApiError.badRequest(
        `Return quantity exceeds purchased quantity for ${orderItem.productName}`,
        'RETURN_QUANTITY_EXCEEDED',
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Return Item Snapshot
    |--------------------------------------------------------------------------
    */

    returnItems.push({
      orderItem:
        orderItem._id,

      product:
        orderItem.product ||
        null,

      variant:
        orderItem.variant ||
        null,

      sku:
        orderItem.sku ||
        null,

      productName:
        orderItem.productName,

      colorName:
        orderItem.colorName,

      size:
        orderItem.size,

      skuCode:
        orderItem.skuCode,

      quantity,

      unitPrice:
        orderItem.unitPrice,

      lineAmount:
        orderItem.unitPrice *
        quantity,

      condition:
        RETURN_ITEM_CONDITIONS
          .PENDING_INSPECTION,

      restockedQuantity:
        0,
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Create Return / Refund Request
  |--------------------------------------------------------------------------
  */

  const request =
    await ReturnRefundRequest
      .create({
        order:
          order._id,

        user:
          userId,

        requestedBy:
          'customer',

        items:
          returnItems,

        reason,

        images,

        customerNote,

        returnStatus:
          RETURN_STATUSES
            .PENDING,

        refund: {
          required:
            false,

          amount:
            0,

          status:
            REFUND_STATUSES
              .NOT_REQUIRED,
        },
      });

  /*
  |--------------------------------------------------------------------------
  | Convert To Plain Object
  |--------------------------------------------------------------------------
  */

  const result =
    request.toObject();

  /*
  |--------------------------------------------------------------------------
  | Admin Notification
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  |
  | Notification request successfully DB mein create hone ke BAAD
  | trigger hoti hai.
  |
  | Flow:
  |
  | Customer creates Return Request
  |              ↓
  | Return Request saved
  |              ↓
  | NEW_RETURN_REQUEST
  |              ↓
  | Admin Notification DB
  |              +
  | Admin FCM Push
  |
  | Notification/FCM failure original Return Request ko rollback
  | nahi karegi.
  |--------------------------------------------------------------------------
  */

  try {
    await adminNotificationEvents
      .newReturnRequest(
        result,
      );
  } catch (error) {
    logger.error(
      { err: error },
      'Return request notification failed (ignored)',
    );
  }

  return result;
}

async function getCustomerReturns({
  userId,
  page = 1,
  limit = 20,
}) {
  const skip = (page - 1) * limit;

  const filter = {
    user: userId,
  };

  const [requests, total] = await Promise.all([
    ReturnRefundRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    ReturnRefundRequest.countDocuments(filter),
  ]);

  return {
    requests,
    meta: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

async function getCustomerReturn({
  requestId,
  userId,
}) {
  const request = await ReturnRefundRequest.findOne({
    _id: requestId,
    user: userId,
  }).lean();

  if (!request) {
    throw ApiError.notFound(
      'Return request not found',
      'RETURN_REQUEST_NOT_FOUND',
    );
  }

  return request;
}

async function listAdminReturns({
  status,
  refundStatus,
  page = 1,
  limit = 20,
}) {
  const filter = {};

  if (status) {
    filter.returnStatus = status;
  }

  if (refundStatus) {
    filter['refund.status'] = refundStatus;
  }

  const skip = (page - 1) * limit;

  const [requests, total] = await Promise.all([
    ReturnRefundRequest.find(filter)
      .populate(
        'order',
        'orderNumber orderStatus paymentStatus customer',
      )
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    ReturnRefundRequest.countDocuments(filter),
  ]);

  return {
    requests,
    meta: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

async function getAdminReturn(requestId) {
  const request = await ReturnRefundRequest.findById(
    requestId,
  )
    .populate(
      'order',
      'orderNumber orderStatus paymentStatus customer pricing',
    )
    .populate('user', 'name email phone')
    .populate('reviewedBy', 'name email')
    .populate('refund.payment')
    .populate('refund.processedBy', 'name email')
    .lean();

  if (!request) {
    throw ApiError.notFound(
      'Return request not found',
      'RETURN_REQUEST_NOT_FOUND',
    );
  }

  return request;
}

async function reviewReturn({
  requestId,
  action,
  adminUserId,
  note,
}) {
  const request = await ReturnRefundRequest.findById(
    requestId,
  );

  if (!request) {
    throw ApiError.notFound(
      'Return request not found',
      'RETURN_REQUEST_NOT_FOUND',
    );
  }

  if (
    request.returnStatus !==
    RETURN_STATUSES.PENDING
  ) {
    throw ApiError.conflict(
      'Return request has already been reviewed',
      'RETURN_ALREADY_REVIEWED',
    );
  }

  const now = new Date();

  request.returnStatus =
    action === 'approve'
      ? RETURN_STATUSES.APPROVED
      : RETURN_STATUSES.REJECTED;

  request.adminNote = note;
  request.reviewedBy = adminUserId;
  request.reviewedAt = now;

  await request.save();

  return request.toObject();
}

async function markReceived({
  requestId,
  adminUserId,
  note,
}) {
  const request = await ReturnRefundRequest.findById(
    requestId,
  );

  if (!request) {
    throw ApiError.notFound(
      'Return request not found',
      'RETURN_REQUEST_NOT_FOUND',
    );
  }

  if (
    request.returnStatus !==
    RETURN_STATUSES.APPROVED
  ) {
    throw ApiError.conflict(
      'Only approved returns can be marked as received',
      'RETURN_NOT_APPROVED',
    );
  }

  request.returnStatus = RETURN_STATUSES.RECEIVED;
  request.receivedAt = new Date();

  if (note) {
    request.adminNote = note;
  }

  request.reviewedBy =
    request.reviewedBy || adminUserId;

  await request.save();

  return request.toObject();
}

async function inspectReturn({
  requestId,
  adminUserId,
  items,
  note,
}) {
  const session =
    await mongoose.startSession();

  try {
    let result;

    /*
    |--------------------------------------------------------------------------
    | Store Stock Transitions
    |--------------------------------------------------------------------------
    |
    | FCM / notifications transaction ke andar trigger nahi hongi.
    | Hum sirf before/after SKU snapshots collect karenge.
    |--------------------------------------------------------------------------
    */

    const stockTransitions = [];

    await session.withTransaction(
      async () => {
        const request =
          await ReturnRefundRequest.findById(
            requestId,
          ).session(session);

        if (!request) {
          throw ApiError.notFound(
            'Return request not found',
            'RETURN_REQUEST_NOT_FOUND',
          );
        }

        if (
          request.returnStatus !==
          RETURN_STATUSES.RECEIVED
        ) {
          throw ApiError.conflict(
            'Return must be received before inspection',
            'RETURN_NOT_RECEIVED',
          );
        }

        if (
          !Array.isArray(items) ||
          items.length === 0
        ) {
          throw ApiError.badRequest(
            'Inspection items are required',
            'INSPECTION_ITEMS_REQUIRED',
          );
        }

        const inspectionMap =
          new Map();

        for (const item of items) {
          const key =
            String(
              item.returnItem,
            );

          if (
            inspectionMap.has(
              key,
            )
          ) {
            throw ApiError.badRequest(
              'Duplicate inspection items are not allowed',
              'DUPLICATE_INSPECTION_ITEM',
            );
          }

          inspectionMap.set(
            key,
            item,
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Require Inspection Result For Every Returned Item
        |--------------------------------------------------------------------------
        */

        if (
          inspectionMap.size !==
          request.items.length
        ) {
          throw ApiError.badRequest(
            'Inspection result is required for every returned item',
            'INCOMPLETE_RETURN_INSPECTION',
          );
        }

        for (
          const returnItem
          of request.items
        ) {
          const inspection =
            inspectionMap.get(
              String(
                returnItem._id,
              ),
            );

          if (!inspection) {
            throw ApiError.badRequest(
              'Inspection result is required for every returned item',
              'INCOMPLETE_RETURN_INSPECTION',
            );
          }

          const allowedConditions = [
            RETURN_ITEM_CONDITIONS
              .RESTOCKABLE,

            RETURN_ITEM_CONDITIONS
              .DAMAGED,

            RETURN_ITEM_CONDITIONS
              .NOT_RESTOCKABLE,
          ];

          if (
            !allowedConditions.includes(
              inspection.condition,
            )
          ) {
            throw ApiError.badRequest(
              'Invalid return item condition',
              'INVALID_RETURN_CONDITION',
            );
          }

          let restockQuantity =
            Number(
              inspection.restockQuantity ||
                0,
            );

          if (
            !Number.isInteger(
              restockQuantity,
            ) ||
            restockQuantity < 0
          ) {
            throw ApiError.badRequest(
              'Restock quantity must be a non-negative integer',
              'INVALID_RESTOCK_QUANTITY',
            );
          }

          if (
            restockQuantity >
            returnItem.quantity
          ) {
            throw ApiError.badRequest(
              'Restock quantity cannot exceed returned quantity',
              'RESTOCK_QUANTITY_EXCEEDED',
            );
          }

          /*
          |--------------------------------------------------------------------------
          | Only Restockable Items Can Return To Inventory
          |--------------------------------------------------------------------------
          */

          if (
            inspection.condition !==
            RETURN_ITEM_CONDITIONS
              .RESTOCKABLE
          ) {
            restockQuantity = 0;
          }

          if (
            restockQuantity > 0 &&
            !returnItem.sku
          ) {
            throw ApiError.conflict(
              'Return item does not have a SKU for restocking',
              'RETURN_SKU_MISSING',
            );
          }

          returnItem.condition =
            inspection.condition;

          returnItem.restockedQuantity =
            restockQuantity;

          /*
          |--------------------------------------------------------------------------
          | Restock Inventory
          |--------------------------------------------------------------------------
          */

          if (
            restockQuantity > 0
          ) {
            const previousSku =
              await Sku.findById(
                returnItem.sku,
              ).session(session);

            if (!previousSku) {
              throw ApiError.notFound(
                'SKU not found for returned item',
                'SKU_NOT_FOUND',
              );
            }

            /*
            |--------------------------------------------------------------------------
            | Capture BEFORE Snapshot
            |--------------------------------------------------------------------------
            |
            | Ye snapshot stock transition detection ke liye use hoga.
            |--------------------------------------------------------------------------
            */

            const beforeSku = {
              _id:
                previousSku._id,

              sku:
                previousSku.sku,

              product:
                previousSku.product,

              variant:
                previousSku.variant,

              stock:
                previousSku.stock,

              reservedStock:
                previousSku.reservedStock,

              available:
                previousSku.available,

              lowStockThreshold:
                previousSku.lowStockThreshold,

              stockStatus:
                previousSku.stockStatus,
            };

            const previousStock =
              previousSku.stock;

            /*
            |--------------------------------------------------------------------------
            | Returned Physical Inventory Comes Back Into Stock
            |--------------------------------------------------------------------------
            |
            | available bhi increase hota hai because returned quantity
            | currently kisi order ke liye reserved nahi hai.
            |--------------------------------------------------------------------------
            */

            const updatedSku =
              await Sku.findOneAndUpdate(
                {
                  _id:
                    returnItem.sku,
                },
                {
                  $inc: {
                    stock:
                      restockQuantity,

                    available:
                      restockQuantity,
                  },
                },
                {
                  new: true,
                  session,
                },
              );

            if (!updatedSku) {
              throw ApiError.notFound(
                'SKU not found for returned item',
                'SKU_NOT_FOUND',
              );
            }

            /*
            |--------------------------------------------------------------------------
            | Recalculate Stock Status
            |--------------------------------------------------------------------------
            */

            updatedSku.stockStatus =
              stockStatus(
                updatedSku,
              );

            await updatedSku.save({
              session,
            });

            /*
            |--------------------------------------------------------------------------
            | Inventory Transaction
            |--------------------------------------------------------------------------
            */

            await InventoryTransaction.create(
              [
                {
                  product:
                    returnItem.product,

                  variant:
                    returnItem.variant,

                  sku:
                    returnItem.skuCode,

                  type:
                    'return',

                  quantity:
                    restockQuantity,

                  previousStock,

                  newStock:
                    updatedSku.stock,

                  order:
                    request.order,

                  reason:
                    'Customer return restocked after inspection',

                  reference:
                    String(
                      request._id,
                    ),

                  createdBy:
                    adminUserId,
                },
              ],
              {
                session,
              },
            );

            /*
            |--------------------------------------------------------------------------
            | Capture AFTER Snapshot
            |--------------------------------------------------------------------------
            |
            | Notification abhi send nahi hogi.
            | Transaction successful commit hone ke baad process hogi.
            |--------------------------------------------------------------------------
            */

            const afterSku = {
              _id:
                updatedSku._id,

              sku:
                updatedSku.sku,

              product:
                updatedSku.product,

              variant:
                updatedSku.variant,

              stock:
                updatedSku.stock,

              reservedStock:
                updatedSku.reservedStock,

              available:
                updatedSku.available,

              lowStockThreshold:
                updatedSku.lowStockThreshold,

              stockStatus:
                updatedSku.stockStatus,
            };

            stockTransitions.push({
              before:
                beforeSku,

              after:
                afterSku,
            });
          }
        }

        /*
        |--------------------------------------------------------------------------
        | Complete Inspection
        |--------------------------------------------------------------------------
        */

        request.returnStatus =
          RETURN_STATUSES.INSPECTED;

        request.inspectedAt =
          new Date();

        if (
          request.items.some(
            (item) =>
              item.restockedQuantity >
              0,
          )
        ) {
          request.restockedAt =
            new Date();
        }

        if (note) {
          request.adminNote =
            note;
        }

        await request.save({
          session,
        });

        result =
          request.toObject();
      },
    );

    /*
    |--------------------------------------------------------------------------
    | Post-Commit Stock Notifications
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | Ye block MongoDB transaction successfully commit hone ke BAAD chalta hai.
    |
    | stockNotification.service before/after available quantity compare karega.
    |
    | Examples:
    |
    | OUT → NORMAL
    |     => BACK_IN_STOCK
    |
    | LOW → NORMAL
    |     => BACK_IN_STOCK
    |
    | OUT → LOW
    |     => LOW_STOCK
    |
    | LOW → LOW
    |     => No notification
    |
    | NORMAL → NORMAL
    |     => No notification
    |--------------------------------------------------------------------------
    */

    for (
      const transition
      of stockTransitions
    ) {
      try {
        await stockNotification
          .handleStockTransition({
            before:
              transition.before,

            after:
              transition.after,
          });
      } catch (error) {
        logger.error(
          { err: error },
          'Restock notification failed (ignored)',
        );
      }
    }

    return result;
  } finally {
    await session.endSession();
  }
}

async function prepareRefund({
  requestId,
  paymentId,
  amount,
  adminUserId,
}) {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const request =
        await ReturnRefundRequest.findById(
          requestId,
        ).session(session);

      if (!request) {
        throw ApiError.notFound(
          'Return request not found',
          'RETURN_REQUEST_NOT_FOUND',
        );
      }

      if (
        ![
          RETURN_STATUSES.INSPECTED,
          RETURN_STATUSES.COMPLETED,
        ].includes(request.returnStatus)
      ) {
        throw ApiError.conflict(
          'Return must be inspected before refund processing',
          'RETURN_NOT_INSPECTED',
        );
      }

      if (
        request.refund?.status ===
        REFUND_STATUSES.COMPLETED
      ) {
        throw ApiError.conflict(
          'Refund has already been completed',
          'REFUND_ALREADY_COMPLETED',
        );
      }

      const payment = await Payment.findOne({
        _id: paymentId,
        order: request.order,
      }).session(session);

      if (!payment) {
        throw ApiError.notFound(
          'Payment not found for this order',
          'PAYMENT_NOT_FOUND',
        );
      }

      if (
        payment.status !==
        PAYMENT_STATUSES.PAID
      ) {
        throw ApiError.conflict(
          'Only paid payments can be refunded',
          'PAYMENT_NOT_PAID',
        );
      }

      const refundAmount = Number(amount);

      if (
        !Number.isFinite(refundAmount) ||
        refundAmount <= 0
      ) {
        throw ApiError.badRequest(
          'Refund amount must be greater than zero',
          'INVALID_REFUND_AMOUNT',
        );
      }

      /*
       * Because Return + Refund are stored in one model,
       * calculate completed/processing refunds against the
       * same Payment across all return requests.
       */
      const refundTotals =
        await ReturnRefundRequest.aggregate([
          {
            $match: {
              'refund.payment':
                payment._id,
              'refund.status': {
                $in: [
                  REFUND_STATUSES.PROCESSING,
                  REFUND_STATUSES.COMPLETED,
                ],
              },
              _id: {
                $ne: request._id,
              },
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: '$refund.amount',
              },
            },
          },
        ]).session(session);

      const alreadyRefunded =
        refundTotals[0]?.total || 0;

      const remaining =
        payment.amount - alreadyRefunded;

      if (refundAmount > remaining) {
        throw ApiError.badRequest(
          'Refund amount exceeds the remaining refundable amount',
          'REFUND_AMOUNT_EXCEEDED',
        );
      }

      /*
       * Also prevent refunding more than the value of the
       * items included in this particular return request.
       */
      const returnValue =
        request.items.reduce(
          (sum, item) =>
            sum + item.lineAmount,
          0,
        );

      if (refundAmount > returnValue) {
        throw ApiError.badRequest(
          'Refund amount exceeds returned item value',
          'RETURN_VALUE_EXCEEDED',
        );
      }

      request.refund.required = true;
      request.refund.payment = payment._id;
      request.refund.amount = refundAmount;
      request.refund.type =
        calculateRefundType(
          refundAmount,
          payment.amount,
        );

      /*
       * JazzCash provider refund is intentionally not
       * implemented yet.
       */
      request.refund.status =
        REFUND_STATUSES.PENDING;

      request.refund.processedBy =
        adminUserId;

      await request.save({ session });

      result = request.toObject();
    });

    return result;
  } finally {
    await session.endSession();
  }
}

async function completeCodRefund({
  requestId,
  adminUserId,
}) {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const request =
        await ReturnRefundRequest.findById(
          requestId,
        ).session(session);

      if (!request) {
        throw ApiError.notFound(
          'Return request not found',
          'RETURN_REQUEST_NOT_FOUND',
        );
      }

      if (
        request.refund?.status !==
        REFUND_STATUSES.PENDING
      ) {
        throw ApiError.conflict(
          'Refund is not pending',
          'REFUND_NOT_PENDING',
        );
      }

      if (!request.refund.payment) {
        throw ApiError.conflict(
          'Refund payment is missing',
          'REFUND_PAYMENT_MISSING',
        );
      }

      const payment = await Payment.findById(
        request.refund.payment,
      ).session(session);

      if (!payment) {
        throw ApiError.notFound(
          'Payment not found',
          'PAYMENT_NOT_FOUND',
        );
      }

      if (payment.gateway !== 'cod') {
        throw ApiError.badRequest(
          'Only COD refunds can be manually completed',
          'MANUAL_REFUND_NOT_ALLOWED',
        );
      }

      if (
        payment.status !==
        PAYMENT_STATUSES.PAID
      ) {
        throw ApiError.conflict(
          'Payment is not paid',
          'PAYMENT_NOT_PAID',
        );
      }

      request.refund.status =
        REFUND_STATUSES.COMPLETED;

      request.refund.processedBy =
        adminUserId;

      request.refund.processedAt =
        new Date();

      request.returnStatus =
        RETURN_STATUSES.COMPLETED;

      request.completedAt = new Date();

      await request.save({ session });

      /*
       * Original Payment is not rewritten as refunded.
       * ReturnRefundRequest remains the refund ledger.
       */
      const completedRefunds =
        await ReturnRefundRequest.aggregate([
          {
            $match: {
              'refund.payment':
                payment._id,
              'refund.status':
                REFUND_STATUSES.COMPLETED,
            },
          },
          {
            $group: {
              _id: null,
              total: {
                $sum: '$refund.amount',
              },
            },
          },
        ]).session(session);

      const refundedAmount =
        completedRefunds[0]?.total || 0;

      const order = await Order.findById(
        request.order,
      ).session(session);

      if (order) {
        if (
          refundedAmount >= payment.amount
        ) {
          order.paymentStatus =
            ORDER_PAYMENT_STATUSES.REFUNDED;
        } else if (refundedAmount > 0) {
          order.paymentStatus =
            ORDER_PAYMENT_STATUSES.PARTIALLY_REFUNDED;
        }

        await order.save({ session });
      }

      result = request.toObject();
    });

    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  createCustomerReturn,
  getCustomerReturns,
  getCustomerReturn,

  listAdminReturns,
  getAdminReturn,

  reviewReturn,
  markReceived,
  inspectReturn,

  prepareRefund,
  completeCodRefund,
};