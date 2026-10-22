'use strict';

const service =
  require('../services/coupon.service');

const asyncHandler =
  require('../utils/asyncHandler');

const {
  success,
  created,
} = require('../utils/apiResponse');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } =
    await service.list(req.validated.query);

  return success(res, {
    data: items,
    meta,
  });
});

exports.get = asyncHandler(async (req, res) =>
  success(res, {
    data: await service.getById(
      req.validated.params.id,
    ),
  }),
);

exports.create = asyncHandler(async (req, res) =>
  created(res, {
    message: 'Coupon created',

    data: await service.create(
      req.validated.body,
    ),
  }),
);

exports.update = asyncHandler(async (req, res) =>
  success(res, {
    message: 'Coupon updated',

    data: await service.update(
      req.validated.params.id,
      req.validated.body,
    ),
  }),
);

exports.setStatus = asyncHandler(async (req, res) =>
  success(res, {
    message: 'Coupon status updated',

    data: await service.setStatus(
      req.validated.params.id,
      req.validated.body.isActive,
    ),
  }),
);

exports.remove = asyncHandler(async (req, res) =>
  success(res, {
    message: 'Coupon deleted',

    data: await service.remove(
      req.validated.params.id,
    ),
  }),
);

/*
|--------------------------------------------------------------------------
| Logged-in Customer Preview
|--------------------------------------------------------------------------
*/

exports.validate = asyncHandler(async (req, res) => {
  const data =
    await service.validateForCustomer({
      code: req.validated.body.code,
      subtotal: req.validated.body.subtotal,
      userId: req.user.id,
      currency: req.validated.body.currency || 'PKR',
    });

  return success(res, {
    message: 'Coupon applied',
    data,
  });
});