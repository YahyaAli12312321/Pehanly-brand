'use strict';

const mongoose = require('mongoose');

const Payment = require('../models/Payment');
const Order = require('../models/order.model');
const ApiError = require('../utils/ApiError');

const {
  generatePaymentNumber,
} = require('./paymentNumber.service');

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function escapeRegex(value = '') {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

function buildPaginationMeta(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages:
      total === 0
        ? 0
        : Math.ceil(total / limit),
  };
}

function getActorId(actor) {
  return actor?.id || actor?._id || null;
}

/*
|--------------------------------------------------------------------------
| Order Payment Eligibility
|--------------------------------------------------------------------------
*/

function getPayableAmount(order) {
  if (!order) {
    throw ApiError.notFound(
      'Order not found',
      'ORDER_NOT_FOUND',
    );
  }

  if (order.orderStatus === 'cancelled') {
    throw ApiError.conflict(
      'Cancelled order cannot be paid',
      'ORDER_CANCELLED',
    );
  }

  if (order.paymentStatus === 'paid') {
    throw ApiError.conflict(
      'Order is already paid',
      'ORDER_ALREADY_PAID',
    );
  }

  if (
    ['refunded', 'partially_refunded'].includes(
      order.paymentStatus,
    )
  ) {
    throw ApiError.conflict(
      'Payment cannot be created for a refunded order',
      'ORDER_PAYMENT_NOT_ALLOWED',
    );
  }

  const amount = Number(order.pricing?.total);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.conflict(
      'Order has an invalid payable amount',
      'INVALID_ORDER_PAYMENT_AMOUNT',
    );
  }

  return amount;
}

/*
|--------------------------------------------------------------------------
| Customer Ownership
|--------------------------------------------------------------------------
*/

/*
 * Ownership rules:
 *  - admin actors may act on any order
 *  - a logged-in customer may only act on their own order
 *  - a guest (no actor) may only act on a guest order (order.user is empty);
 *    guest orders are reached by the unguessable order id created at checkout
 */
function assertOrderOwnership(order, actor) {
  if (actor?.role === 'admin') {
    return;
  }

  const actorId = getActorId(actor);

  if (!actorId) {
    if (order.user) {
      throw ApiError.notFound(
        'Order not found',
        'ORDER_NOT_FOUND',
      );
    }
    return;
  }

  if (
    !order.user ||
    String(order.user) !== String(actorId)
  ) {
    throw ApiError.notFound(
      'Order not found',
      'ORDER_NOT_FOUND',
    );
  }
}

async function getPaymentById(paymentId) {
  const payment = await Payment.findById(paymentId)
    .populate(
      'order',
      'orderNumber orderType orderStatus paymentStatus pricing customer',
    )
    .populate(
      'user',
      'name email phone',
    )
    .lean();

  if (!payment) {
    throw ApiError.notFound(
      'Payment not found',
      'PAYMENT_NOT_FOUND',
    );
  }

  return payment;
}

/*
|--------------------------------------------------------------------------
| Create COD Payment
|--------------------------------------------------------------------------
|
| Amount ALWAYS comes from Order.
| Frontend cannot control payment amount.
|--------------------------------------------------------------------------
*/

/*
 * Creates (or returns the existing active) COD payment for an order inside
 * the caller's transaction. Used by checkout and by createCodPayment().
 */
async function createCodPaymentInSession(order, session) {
  /*
   * The payment ledger is PKR-only (COD and the JazzCash adapter both settle
   * in PKR). An order in any other currency must never get a PKR payment row
   * with a foreign amount - no silent conversion.
   */
  if (order.currency && order.currency !== 'PKR') {
    throw ApiError.conflict(
      `No payment method is available for ${order.currency} orders`,
      'PAYMENT_CURRENCY_UNSUPPORTED',
    );
  }

  const amount = getPayableAmount(order);

  const existingPayment = await Payment.findOne({
    order: order._id,
    gateway: 'cod',
    status: { $in: ['pending', 'processing'] },
  })
    .session(session)
    .sort({ createdAt: -1 });

  if (existingPayment) {
    return existingPayment;
  }

  const paymentNumber = await generatePaymentNumber({ session });

  const [payment] = await Payment.create(
    [
      {
        paymentNumber,
        order: order._id,
        user: order.user || null,
        gateway: 'cod',
        amount,
        gatewayFee: 0,
        netAmount: amount,
        currency: 'PKR',
        status: 'pending',
      },
    ],
    { session },
  );

  return payment;
}

async function createCodPayment({
  orderId,
  actor = null,
}) {
  const session = await mongoose.startSession();

  try {
    let paymentId;

    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);

      if (!order) {
        throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
      }

      assertOrderOwnership(order, actor);

      const payment = await createCodPaymentInSession(order, session);

      if (order.paymentStatus !== 'pending') {
        order.paymentStatus = 'pending';
        await order.save({ session });
      }

      paymentId = payment._id;
    });

    return getPaymentById(paymentId);
  } finally {
    await session.endSession();
  }
}

async function confirmCodPayment({
  paymentId,
  actor,
}) {
  const actorId = getActorId(actor);

  if (!actorId) {
    throw ApiError.unauthorized(
      'Authentication required',
      'UNAUTHORIZED',
    );
  }

  const session = await mongoose.startSession();

  try {
    let updatedPaymentId;

    await session.withTransaction(async () => {
      const payment =
        await Payment.findById(
          paymentId,
        ).session(session);

      if (!payment) {
        throw ApiError.notFound(
          'Payment not found',
          'PAYMENT_NOT_FOUND',
        );
      }

      if (payment.gateway !== 'cod') {
        throw ApiError.conflict(
          'Only COD payments can be confirmed manually',
          'COD_CONFIRMATION_NOT_ALLOWED',
        );
      }

      /*
       * Idempotent:
       * repeated admin request will not
       * create an invalid state.
       */
      if (payment.status === 'paid') {
        updatedPaymentId = payment._id;
        return;
      }

      if (
        !['pending', 'processing'].includes(
          payment.status,
        )
      ) {
        throw ApiError.conflict(
          `COD payment cannot be confirmed from ${payment.status} status`,
          'INVALID_PAYMENT_STATUS_TRANSITION',
        );
      }

      const order =
        await Order.findById(
          payment.order,
        ).session(session);

      if (!order) {
        throw ApiError.notFound(
          'Linked order not found',
          'ORDER_NOT_FOUND',
        );
      }

      if (order.orderStatus === 'cancelled') {
        throw ApiError.conflict(
          'COD payment cannot be confirmed for a cancelled order',
          'ORDER_CANCELLED',
        );
      }

      payment.status = 'paid';
      payment.confirmedBy = actorId;
      payment.paidAt =
        payment.paidAt || new Date();

      payment.failedAt = null;
      payment.cancelledAt = null;

      await payment.save({ session });

      order.paymentStatus = 'paid';

      await order.save({ session });

      updatedPaymentId = payment._id;
    });

    return getPaymentById(
      updatedPaymentId,
    );
  } finally {
    await session.endSession();
  }
}

/*
|--------------------------------------------------------------------------
| Customer Payment Status
|--------------------------------------------------------------------------
*/

async function getCustomerPaymentStatus({
  paymentId,
  actor,
}) {
  const userId = getActorId(actor);

  if (!userId) {
    throw ApiError.unauthorized(
      'Authentication required',
      'UNAUTHORIZED',
    );
  }

  const payment = await Payment.findOne({
    _id: paymentId,
    user: userId,
  })
    .select({
      paymentNumber: 1,
      order: 1,
      gateway: 1,
      amount: 1,
      currency: 1,
      status: 1,
      transactionId: 1,
      failureReason: 1,
      paidAt: 1,
      failedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .populate(
      'order',
      'orderNumber orderStatus paymentStatus',
    )
    .lean();

  if (!payment) {
    throw ApiError.notFound(
      'Payment not found',
      'PAYMENT_NOT_FOUND',
    );
  }

  return payment;
}

/*
|--------------------------------------------------------------------------
| Admin - List Payments
|--------------------------------------------------------------------------
|
| Search:
| - Payment #
| - Transaction ID
| - Order #
| - Customer name
| - Customer email
| - Customer phone
|--------------------------------------------------------------------------
*/

async function listPayments(query = {}) {
  const page = Math.max(
    1,
    Number(query.page) || 1,
  );

  const limit = Math.min(
    100,
    Math.max(
      1,
      Number(query.limit) || 20,
    ),
  );

  const baseMatch = {};

  if (query.status) {
    baseMatch.status = query.status;
  }

  if (query.gateway) {
    baseMatch.gateway = query.gateway;
  }

  if (query.from || query.to) {
    baseMatch.createdAt = {};

    if (query.from) {
      baseMatch.createdAt.$gte =
        new Date(query.from);
    }

    if (query.to) {
      baseMatch.createdAt.$lte =
        new Date(query.to);
    }
  }

  const pipeline = [
    {
      $match: baseMatch,
    },

    {
      $lookup: {
        from: Order.collection.name,
        localField: 'order',
        foreignField: '_id',
        as: 'orderData',
      },
    },

    {
      $unwind: {
        path: '$orderData',
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  const search = String(
    query.search || '',
  ).trim();

  if (search) {
    const regex = new RegExp(
      escapeRegex(search),
      'i',
    );

    pipeline.push({
      $match: {
        $or: [
          {
            paymentNumber: regex,
          },
          {
            transactionId: regex,
          },
          {
            'orderData.orderNumber':
              regex,
          },
          {
            'orderData.customer.name':
              regex,
          },
          {
            'orderData.customer.email':
              regex,
          },
          {
            'orderData.customer.phone':
              regex,
          },
        ],
      },
    });
  }

  pipeline.push({
    $facet: {
      items: [
        {
          $sort: {
            createdAt: -1,
            _id: -1,
          },
        },

        {
          $skip:
            (page - 1) * limit,
        },

        {
          $limit: limit,
        },

        {
          $project: {
            paymentNumber: 1,
            order: 1,
            user: 1,

            gateway: 1,
            transactionId: 1,

            amount: 1,
            gatewayFee: 1,
            netAmount: 1,
            currency: 1,

            status: 1,

            providerResponse: 1,
            failureReason: 1,

            paidAt: 1,
            failedAt: 1,
            cancelledAt: 1,
            refundedAt: 1,

            createdAt: 1,
            updatedAt: 1,

            orderData: {
              _id:
                '$orderData._id',

              orderNumber:
                '$orderData.orderNumber',

              orderType:
                '$orderData.orderType',

              orderStatus:
                '$orderData.orderStatus',

              paymentStatus:
                '$orderData.paymentStatus',

              customer:
                '$orderData.customer',

              pricing:
                '$orderData.pricing',
            },
          },
        },
      ],

      totalCount: [
        {
          $count: 'count',
        },
      ],
    },
  });

  const [result] =
    await Payment.aggregate(pipeline);

  const items =
    result?.items || [];

  const total =
    result?.totalCount?.[0]?.count || 0;

  return {
    items,

    meta: buildPaginationMeta(
      page,
      limit,
      total,
    ),
  };
}

/*
|--------------------------------------------------------------------------
| Admin - Payment Summary
|--------------------------------------------------------------------------
*/

async function getPaymentSummary() {
  const [
    settledResult,
    pendingResult,
    refundPaymentCount,
    gatewayStats,
  ] = await Promise.all([
    /*
     * Total settled
     */
    Payment.aggregate([
      {
        $match: {
          status: 'paid',
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$netAmount',
          },
        },
      },
    ]),

    /*
     * Pending inflow
     */
    Payment.aggregate([
      {
        $match: {
          status: {
            $in: [
              'pending',
              'processing',
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount',
          },
        },
      },
    ]),

    /*
     * Count only.
     *
     * Actual refund monetary total will
     * come from PaymentRefund later.
     */
    Payment.countDocuments({
      status: {
        $in: [
          'refunded',
          'partially_refunded',
        ],
      },
    }),

    /*
     * Online gateway efficiency.
     * COD excluded.
     */
    Payment.aggregate([
      {
        $match: {
          gateway: {
            $ne: 'cod',
          },

          status: {
            $in: [
              'paid',
              'failed',
            ],
          },
        },
      },

      {
        $group: {
          _id: null,

          successful: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    '$status',
                    'paid',
                  ],
                },
                1,
                0,
              ],
            },
          },

          attempted: {
            $sum: 1,
          },
        },
      },
    ]),
  ]);

  const successful =
    gatewayStats[0]?.successful || 0;

  const attempted =
    gatewayStats[0]?.attempted || 0;

  const gatewayEfficiency =
    attempted === 0
      ? 0
      : Number(
          (
            (successful / attempted) *
            100
          ).toFixed(2),
        );

  return {
    totalSettled:
      settledResult[0]?.total || 0,

    pendingGatewayInflow:
      pendingResult[0]?.total || 0,

    /*
     * Intentionally null until
     * PaymentRefund ledger exists.
     */
    disbursedRefunds: null,

    refundPaymentCount,

    gatewayEfficiency,

    currency: 'PKR',
  };
}

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  createCodPaymentInSession,
  // Customer
  createCodPayment,
  getCustomerPaymentStatus,

  // Shared/Admin
  getPaymentById,

  // Admin
  confirmCodPayment,
  listPayments,
  getPaymentSummary,
};