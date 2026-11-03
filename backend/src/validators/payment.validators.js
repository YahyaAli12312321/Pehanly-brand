'use strict';

const { z } = require('zod');

const {
  PAYMENT_GATEWAYS,
  PAYMENT_STATUSES,
} = require('../constants/Payment');

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

const objectId = z
  .string()
  .trim()
  .regex(
    /^[a-f\d]{24}$/i,
    'Invalid ID',
  );

const optionalDate = z
  .string()
  .trim()
  .datetime({
    offset: true,
  })
  .optional();

/*
|--------------------------------------------------------------------------
| Payment ID Params
|--------------------------------------------------------------------------
*/

const paymentIdParams = z.object({
  id: objectId,
});

/*
|--------------------------------------------------------------------------
| Initiate Payment
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Frontend is NOT allowed to send:
|
| - amount
| - gatewayFee
| - netAmount
| - currency
| - status
|
| Amount comes from Order.pricing.total.
|--------------------------------------------------------------------------
*/

const initiatePaymentBody = z
  .object({
    orderId: objectId,

    gateway: z.enum(
      PAYMENT_GATEWAYS,
    ),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Customer Payment Status
|--------------------------------------------------------------------------
*/

const paymentStatusParams = z.object({
  id: objectId,
});

/*
|--------------------------------------------------------------------------
| Admin Payment List
|--------------------------------------------------------------------------
*/

const adminPaymentsQuery = z.object({
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

  search: z
    .string()
    .trim()
    .max(120)
    .optional(),

  status: z
    .enum(PAYMENT_STATUSES)
    .optional(),

  gateway: z
    .enum(PAYMENT_GATEWAYS)
    .optional(),

  from: optionalDate,

  to: optionalDate,
});

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

const orderIdParams = z
  .object({
    orderId: objectId,
  })
  .strict();

const listPaymentsQuery = adminPaymentsQuery;

module.exports = {
  paymentIdParams,
  paymentStatusParams,
  orderIdParams,
  initiatePaymentBody,
  adminPaymentsQuery,
  listPaymentsQuery,
};
