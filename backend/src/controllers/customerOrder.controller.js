'use strict';

const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/apiResponse');

const customerOrderService =
  require('../services/order.service');

/**
 * GET /api/v1/orders/my
 *
 * Logged-in customer's orders.
 */
exports.listMyOrders = asyncHandler(
  async (req, res) => {
    const result =
      await customerOrderService.listMyOrders(
        req.user.id,
        req.validated.query,
      );

    return response.success(
      res,
      result.orders,
      'Orders fetched successfully',
      result.meta,
    );
  },
);

/**
 * GET /api/v1/orders/my/:id
 *
 * Logged-in customer's single order.
 */
exports.getMyOrder = asyncHandler(
  async (req, res) => {
    const order =
      await customerOrderService.getMyOrderById(
        req.user.id,
        req.validated.params.id,
      );

    return response.success(
      res,
      order,
      'Order fetched successfully',
    );
  },
);