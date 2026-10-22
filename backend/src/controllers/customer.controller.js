'use strict';

const customer =
  require(
    '../services/customer.service',
  );

const asyncHandler =
  require(
    '../utils/asyncHandler',
  );

const {
  success,
} = require(
  '../utils/apiResponse',
);

/*
|--------------------------------------------------------------------------
| List Customers
|--------------------------------------------------------------------------
*/

exports.list = asyncHandler(
  async (req, res) => {
    const {
      items,
      meta,
    } =
      await customer.list(
        req.validated.query,
      );

    return success(res, {
      data: items,
      meta,
    });
  },
);

/*
|--------------------------------------------------------------------------
| Summary
|--------------------------------------------------------------------------
*/

exports.summary =
  asyncHandler(
    async (_req, res) => {
      const data =
        await customer.summary();

      return success(res, {
        data,
      });
    },
  );

/*
|--------------------------------------------------------------------------
| Customer Detail
|--------------------------------------------------------------------------
*/

exports.get = asyncHandler(
  async (req, res) => {
    const data =
      await customer.getById(
        req.validated
          .params
          .id,
      );

    return success(res, {
      data,
    });
  },
);

/*
|--------------------------------------------------------------------------
| Order History
|--------------------------------------------------------------------------
*/

exports.orderHistory =
  asyncHandler(
    async (req, res) => {
      const {
        items,
        meta,
      } =
        await customer.orderHistory(
          req.validated
            .params
            .id,

          req.validated
            .query,
        );

      return success(res, {
        data: items,
        meta,
      });
    },
  );

/*
|--------------------------------------------------------------------------
| Suspend / Reactivate
|--------------------------------------------------------------------------
*/

exports.setStatus =
  asyncHandler(
    async (req, res) => {
      const data =
        await customer.setStatus(
          req.validated
            .params
            .id,

          req.validated.body,

          req.user,

          req,
        );

      return success(res, {
        message:
          data.status ===
          'suspended'
            ? 'Customer suspended successfully'
            : 'Customer reactivated successfully',

        data,
      });
    },
  );