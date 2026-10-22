'use strict';

const inventory = require(
  '../services/inventory.service',
);

const asyncHandler = require(
  '../utils/asyncHandler',
);

const {
  success,
} = require(
  '../utils/apiResponse',
);

/*
|--------------------------------------------------------------------------
| List Inventory
|--------------------------------------------------------------------------
*/

exports.list = asyncHandler(
  async (req, res) => {
    const {
      items,
      meta,
    } =
      await inventory.list(
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
| Inventory Summary
|--------------------------------------------------------------------------
*/

exports.summary = asyncHandler(
  async (_req, res) => {
    const data =
      await inventory.summary();

    return success(res, {
      data,
    });
  },
);

/*
|--------------------------------------------------------------------------
| Adjust Stock
|--------------------------------------------------------------------------
*/

exports.adjust = asyncHandler(
  async (req, res) => {
    const data =
      await inventory.adjust(
        {
          ...req.validated.body,

          sku:
            req.validated
              .params
              .sku,
        },

        req.user,

        req,
      );

    return success(res, {
      message:
        'Stock updated successfully',

      data,
    });
  },
);

/*
|--------------------------------------------------------------------------
| Inventory History
|--------------------------------------------------------------------------
*/

exports.history = asyncHandler(
  async (req, res) => {
    const {
      items,
      meta,
    } =
      await inventory.history(
        req.validated
          .params
          .sku,

        req.validated
          .query,
      );

    return success(res, {
      data: items,
      meta,
    });
  },
);