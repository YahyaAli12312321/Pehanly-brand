'use strict';

const { z } = require('zod');

const {
  ORDER_TYPES,
  ORDER_STATUSES,
} = require('../constants/Order');

/*
|--------------------------------------------------------------------------
| Common
|--------------------------------------------------------------------------
*/

const objectId = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    'Invalid order id',
  );

/*
|--------------------------------------------------------------------------
| My Orders Query
|--------------------------------------------------------------------------
|
| GET /api/v1/orders/my
|--------------------------------------------------------------------------
*/

exports.myOrdersQuery = z
  .object({
    status: z
      .enum(ORDER_STATUSES)
      .optional(),

    type: z
      .enum(ORDER_TYPES)
      .optional(),

    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| My Order Params
|--------------------------------------------------------------------------
|
| GET /api/v1/orders/my/:id
|--------------------------------------------------------------------------
*/

exports.myOrderParams = z
  .object({
    id:
      objectId,
  })
  .strict();