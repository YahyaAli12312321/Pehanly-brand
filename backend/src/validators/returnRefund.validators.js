'use strict';

const { z } = require('zod');
const { mediaUrl } = require('./common');

const {
  RETURN_STATUSES,
  RETURN_ITEM_CONDITIONS,
  REFUND_STATUSES,
} = require('../constants/ReturnRefund');

const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid MongoDB ObjectId');

const requestIdParams = z
  .object({
    id: objectId,
  })
  .strict();

const orderIdParams = z
  .object({
    id: objectId,
  })
  .strict();

/*
 * Customer return creation
 */

const returnImageSchema = z
  .object({
    url: mediaUrl(500),

    publicId: z
      .string()
      .trim()
      .max(200)
      .optional(),

    alt: z
      .string()
      .trim()
      .max(160)
      .optional(),
  })
  .strict();

const createReturnItemSchema = z
  .object({
    /*
     * _id of embedded Order.items item.
     * Customer does NOT send product/SKU/price.
     * Service takes those from the Order snapshot.
     */
    orderItem: objectId,

    quantity: z.coerce
      .number()
      .int()
      .min(1),
  })
  .strict();

const createReturnBody = z
  .object({
    items: z
      .array(createReturnItemSchema)
      .min(1)
      .max(100),

    reason: z
      .string()
      .trim()
      .min(3)
      .max(1000),

    images: z
      .array(returnImageSchema)
      .max(10)
      .default([]),

    customerNote: z
      .string()
      .trim()
      .max(2000)
      .optional(),
  })
  .strict();

/*
 * Customer list
 */

const listMyReturnsQuery = z
  .object({
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
 * Admin list
 */

const listAdminReturnsQuery = z
  .object({
    status: z
      .enum(Object.values(RETURN_STATUSES))
      .optional(),

    refundStatus: z
      .enum(Object.values(REFUND_STATUSES))
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
 * Approve / Reject
 */

const reviewReturnBody = z
  .object({
    action: z.enum([
      'approve',
      'reject',
    ]),

    note: z
      .string()
      .trim()
      .max(2000)
      .optional(),
  })
  .strict();

/*
 * Mark physical return received
 */

const receiveReturnBody = z
  .object({
    note: z
      .string()
      .trim()
      .max(2000)
      .optional(),
  })
  .strict();

/*
 * Inspection
 */

const inspectReturnItemSchema = z
  .object({
    /*
     * _id of ReturnRefundRequest.items item,
     * NOT Order.items._id.
     */
    returnItem: objectId,

    condition: z.enum([
      RETURN_ITEM_CONDITIONS.RESTOCKABLE,
      RETURN_ITEM_CONDITIONS.DAMAGED,
      RETURN_ITEM_CONDITIONS.NOT_RESTOCKABLE,
    ]),

    restockQuantity: z.coerce
      .number()
      .int()
      .min(0)
      .default(0),
  })
  .strict();

const inspectReturnBody = z
  .object({
    items: z
      .array(inspectReturnItemSchema)
      .min(1)
      .max(100),

    note: z
      .string()
      .trim()
      .max(2000)
      .optional(),
  })
  .strict();

/*
 * Refund preparation
 */

const prepareRefundBody = z
  .object({
    paymentId: objectId,

    amount: z.coerce
      .number()
      .positive()
      .finite(),
  })
  .strict();

module.exports = {
  requestIdParams,
  orderIdParams,

  createReturnBody,

  listMyReturnsQuery,
  listAdminReturnsQuery,

  reviewReturnBody,
  receiveReturnBody,
  inspectReturnBody,

  prepareRefundBody,
};