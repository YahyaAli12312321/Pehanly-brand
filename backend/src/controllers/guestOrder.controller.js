'use strict';

const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/apiResponse');

const guestOrderService =
  require('../services/order.service');

exports.trackOrder = asyncHandler(
  async (req, res) => {
    const result =
      await guestOrderService.trackGuestOrder(
        req.validated.body,
      );

    return response.success(
      res,
      result,
      'Order tracking details fetched successfully',
    );
  },
);