'use strict';

const mongoose = require('mongoose');

const Order = require('../models/order.model');

const CancellationRequest =
  require('../models/CancellationRequest');

const ApiError =
  require('../utils/ApiError');

const logger = require('../config/logger');

const orderLifecycle =
  require('./orderLifecycle.service');

const stockNotification =
  require('./stockNotification.service');

const {
  canTransitionOrderStatus,
} = require('../constants/Order');

/**
 * Customer creates cancellation request.
 */
async function createCustomerRequest(
  userId,
  orderId,
  input,
) {
  const order = await Order.findOne({
    _id: orderId,
    user: userId,
  }).lean();

  if (!order) {
    throw ApiError.notFound(
      'Order not found',
      'ORDER_NOT_FOUND',
    );
  }

  if (
    !['pending', 'confirmed', 'processing']
      .includes(order.orderStatus)
  ) {
    throw ApiError.badRequest(
      'This order can no longer be cancelled',
      'ORDER_NOT_CANCELLABLE',
    );
  }

  const existing =
    await CancellationRequest.findOne({
      order: order._id,
      status: 'pending',
    });

  if (existing) {
    throw ApiError.conflict(
      'A cancellation request is already pending',
      'CANCELLATION_ALREADY_PENDING',
    );
  }

  try {
    return await CancellationRequest.create({
      order: order._id,
      user: userId,
      requestedBy: 'customer',
      reason: input.reason,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw ApiError.conflict(
        'A cancellation request is already pending',
        'CANCELLATION_ALREADY_PENDING',
      );
    }

    throw error;
  }
}

/**
 * Admin list.
 */
async function listRequests(query) {
  const {
    status,
    page,
    limit,
  } = query;

  const filter = {};

  if (status) {
    filter.status = status;
  }

  const skip = (page - 1) * limit;

  const [requests, total] =
    await Promise.all([
      CancellationRequest.find(filter)
        .populate(
          'user',
          'name email phone',
        )
        .populate({
          path: 'order',
          select:
            'orderNumber orderStatus paymentStatus pricing customer placedAt',
        })
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      CancellationRequest.countDocuments(
        filter,
      ),
    ]);

  return {
    requests,

    meta: {
      page,
      limit,
      total,
      totalPages:
        total === 0
          ? 0
          : Math.ceil(total / limit),
    },
  };
}

/**
 * Admin reviews cancellation.
 */
async function reviewRequest(
  requestId,
  input,
  admin,
) {
  const session =
    await mongoose.startSession();

  const adminId =
    admin?.id ||
    admin?._id ||
    null;

  /*
   * Post-commit work. Each transaction attempt builds its own array, so a
   * retried callback can never duplicate transitions.
   */
  let stockTransitions = [];
  let approvedOrderId = null;

  try {
    let result;

    await session.withTransaction(
      async () => {
        const attemptTransitions = [];
        let attemptApprovedOrderId = null;

        const cancellation =
          await CancellationRequest
            .findById(requestId)
            .session(session);

        if (!cancellation) {
          throw ApiError.notFound(
            'Cancellation request not found',
            'CANCELLATION_NOT_FOUND',
          );
        }

        if (
          cancellation.status !==
          'pending'
        ) {
          throw ApiError.conflict(
            'Cancellation request has already been reviewed',
            'CANCELLATION_ALREADY_REVIEWED',
          );
        }

        const order =
          await Order.findById(
            cancellation.order,
          ).session(session);

        if (!order) {
          throw ApiError.notFound(
            'Order not found',
            'ORDER_NOT_FOUND',
          );
        }

        const now = new Date();

        if (input.action === 'reject') {
          cancellation.status = 'rejected';
          cancellation.adminNote = input.note;
          cancellation.reviewedBy = adminId;
          cancellation.reviewedAt = now;

          await cancellation.save({ session });

          result = cancellation;
          stockTransitions = [];
          approvedOrderId = null;
          return;
        }

        if (
          !canTransitionOrderStatus(
            order.orderStatus,
            'cancelled',
          )
        ) {
          throw ApiError.conflict(
            'Order can no longer be cancelled',
            'ORDER_NOT_CANCELLABLE',
          );
        }

        /*
         * Same cancellation path as the admin status update:
         * releases reservations, gives the coupon back, cancels open
         * payments, refuses paid orders (REFUND_REQUIRED).
         */
        const { stockTransitions: released } =
          await orderLifecycle.cancelOrder({
            order,
            session,
            actorId: adminId,
            note:
              input.note ||
              cancellation.reason ||
              'Order cancelled',
          });

        attemptTransitions.push(...released);

        await order.save({ session });

        cancellation.status = 'approved';
        cancellation.adminNote = input.note;
        cancellation.reviewedBy = adminId;
        cancellation.reviewedAt = now;

        await cancellation.save({ session });

        attemptApprovedOrderId = order._id;

        result = cancellation;
        stockTransitions = attemptTransitions;
        approvedOrderId = attemptApprovedOrderId;
      },
    );

    /*
     * Transaction committed. Notifications are best-effort and can never
     * fail the already-successful cancellation.
     */
    for (const transition of stockTransitions) {
      try {
        await stockNotification.handleStockTransition({
          before: transition.before,
          after: transition.after,
        });
      } catch (error) {
        logger.error(
          { err: error },
          'Stock notification after cancellation failed (ignored)',
        );
      }
    }

    return result.toObject();
  } finally {
    await session.endSession();
  }
}

module.exports = {
  createCustomerRequest,
  listRequests,
  reviewRequest,
};