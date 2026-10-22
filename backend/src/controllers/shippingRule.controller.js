'use strict';

const service =
  require('../services/shippingRule.service');

const asyncHandler =
  require('../utils/asyncHandler');

const {
  success,
  created,
} = require('../utils/apiResponse');

/*
|--------------------------------------------------------------------------
| Admin
|--------------------------------------------------------------------------
*/

exports.list =
  asyncHandler(
    async (req, res) => {
      const {
        items,
        meta,
      } =
        await service.list(
          req.validated.query,
        );

      return success(res, {
        data:
          items,

        meta,
      });
    },
  );

exports.get =
  asyncHandler(
    async (req, res) =>
      success(res, {
        data:
          await service.getById(
            req.validated.params
              .id,
          ),
      }),
  );

exports.create =
  asyncHandler(
    async (req, res) =>
      created(res, {
        message:
          'Shipping rule created',

        data:
          await service.create(
            req.validated.body,
          ),
      }),
  );

exports.update =
  asyncHandler(
    async (req, res) =>
      success(res, {
        message:
          'Shipping rule updated',

        data:
          await service.update(
            req.validated.params
              .id,

            req.validated.body,
          ),
      }),
  );

exports.setStatus =
  asyncHandler(
    async (req, res) =>
      success(res, {
        message:
          'Shipping rule status updated',

        data:
          await service.setStatus(
            req.validated.params
              .id,

            req.validated.body
              .isActive,
          ),
      }),
  );

exports.remove =
  asyncHandler(
    async (req, res) =>
      success(res, {
        message:
          'Shipping rule deleted',

        data:
          await service.remove(
            req.validated.params
              .id,
          ),
      }),
  );

/*
|--------------------------------------------------------------------------
| Public / Checkout Estimate
|--------------------------------------------------------------------------
*/

exports.calculate =
  asyncHandler(
    async (req, res) =>
      success(res, {
        data:
          await service
            .calculateShipping(
              req.validated.body,
            ),
      }),
  );

/*
|--------------------------------------------------------------------------
| Public Free-Shipping Info
|--------------------------------------------------------------------------
|
| GET /api/v1/shipping/free-shipping
|--------------------------------------------------------------------------
*/

exports.freeShippingInfo =
  asyncHandler(
    async (req, res) =>
      success(res, {
        data:
          await service
            .getFreeShippingInfo(
              req.validated.query,
            ),
      }),
  );
