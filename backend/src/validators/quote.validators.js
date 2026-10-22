'use strict';

const { z } = require('zod');

const {
  QUOTE_STATUSES,
  QUOTE_SOURCE_TYPES,
} = require('../constants/Quote');

/*
|--------------------------------------------------------------------------
| Common Validators
|--------------------------------------------------------------------------
*/

const objectId =
  z
    .string()
    .regex(
      /^[a-f\d]{24}$/i,
      'Invalid id',
    );

const money =
  z.coerce
    .number()
    .min(0)
    .max(100_000_000);

const positiveMoney =
  z.coerce
    .number()
    .gt(0)
    .max(100_000_000);

/*
|--------------------------------------------------------------------------
| Shipping Address
|--------------------------------------------------------------------------
*/

const shippingAddressSchema =
  z
    .object({
      fullName:
        z
          .string()
          .trim()
          .min(1)
          .max(120),

      phone:
        z
          .string()
          .trim()
          .min(1)
          .max(20),

      addressLine1:
        z
          .string()
          .trim()
          .min(1)
          .max(250),

      addressLine2:
        z
          .string()
          .trim()
          .max(250)
          .optional(),

      city:
        z
          .string()
          .trim()
          .min(1)
          .max(100),

      province:
        z
          .string()
          .trim()
          .max(100)
          .optional(),

      postalCode:
        z
          .string()
          .trim()
          .max(30)
          .optional(),

      country:
        z
          .string()
          .trim()
          .min(1)
          .max(80)
          .default('Pakistan'),
    })
    .strict();

/*
|--------------------------------------------------------------------------
| Create Wholesale Quote
|--------------------------------------------------------------------------
|
| Wholesale prices already come from the backend-validated Wholesale Request.
| Admin does NOT provide item prices here.
|--------------------------------------------------------------------------
*/

const createWholesaleQuoteBody =
  z
    .object({
      wholesaleRequestId:
        objectId,

      discount:
        money.default(0),

      shipping:
        money.default(0),

      additionalCharges:
        money.default(0),

      validUntil:
        z.coerce
          .date()
          .optional(),

      adminNotes:
        z
          .string()
          .trim()
          .max(5000)
          .optional(),

      terms:
        z
          .string()
          .trim()
          .max(10000)
          .optional(),
    })
    .strict();

/*
|--------------------------------------------------------------------------
| Create Manufacturing Quote
|--------------------------------------------------------------------------
|
| Manufacturing does not use retail SKU pricing.
| Admin supplies the commercial unit price.
|--------------------------------------------------------------------------
*/

const createManufacturingQuoteBody =
  z
    .object({
      manufacturingRequestId:
        objectId,

      unitPrice:
        positiveMoney,

      discount:
        money.default(0),

      shipping:
        money.default(0),

      additionalCharges:
        money.default(0),

      validUntil:
        z.coerce
          .date()
          .optional(),

      adminNotes:
        z
          .string()
          .trim()
          .max(5000)
          .optional(),

      terms:
        z
          .string()
          .trim()
          .max(10000)
          .optional(),
    })
    .strict();

/*
|--------------------------------------------------------------------------
| Create Printing & Branding Quote
|--------------------------------------------------------------------------
|
| Printing is request-based, not SKU-based.
| Admin provides the commercial unit price.
|--------------------------------------------------------------------------
*/

const createPrintingQuoteBody =
  z
    .object({
      printingRequestId:
        objectId,

      unitPrice:
        positiveMoney,

      discount:
        money.default(0),

      shipping:
        money.default(0),

      additionalCharges:
        money.default(0),

      validUntil:
        z.coerce
          .date()
          .optional(),

      adminNotes:
        z
          .string()
          .trim()
          .max(5000)
          .optional(),

      terms:
        z
          .string()
          .trim()
          .max(10000)
          .optional(),
    })
    .strict();

/*
|--------------------------------------------------------------------------
| Update Draft Quote
|--------------------------------------------------------------------------
|
| Commercial totals can be adjusted while quote remains DRAFT.
| Source request and source type cannot be changed here.
|--------------------------------------------------------------------------
*/

const updateQuoteBody =
  z
    .object({
      discount:
        money.optional(),

      shipping:
        money.optional(),

      additionalCharges:
        money.optional(),

      validUntil:
        z.coerce
          .date()
          .nullable()
          .optional(),

      adminNotes:
        z
          .string()
          .trim()
          .max(5000)
          .optional(),

      terms:
        z
          .string()
          .trim()
          .max(10000)
          .optional(),
    })
    .strict()
    .refine(
      (body) =>
        Object.keys(body).length >
        0,
      {
        message:
          'Nothing to update',
      },
    );

/*
|--------------------------------------------------------------------------
| Reject Quote
|--------------------------------------------------------------------------
*/

const rejectQuoteBody =
  z
    .object({
      customerNotes:
        z
          .string()
          .trim()
          .max(3000)
          .optional(),
    })
    .strict();

/*
|--------------------------------------------------------------------------
| Convert Quote To Order
|--------------------------------------------------------------------------
|
| Quote already contains the authoritative commercial snapshot.
| Only shipping address is supplied at conversion time.
|--------------------------------------------------------------------------
*/

const convertQuoteToOrderBody =
  z
    .object({
      shippingAddress:
        shippingAddressSchema,
    })
    .strict();

/*
|--------------------------------------------------------------------------
| ID Params
|--------------------------------------------------------------------------
*/

const idParams =
  z
    .object({
      id:
        objectId,
    })
    .strict();

/*
|--------------------------------------------------------------------------
| Admin List Query
|--------------------------------------------------------------------------
*/

const adminQuoteListQuery =
  z
    .object({
      search:
        z
          .string()
          .trim()
          .max(120)
          .optional(),

      status:
        z
          .enum(
            Object.values(
              QUOTE_STATUSES,
            ),
          )
          .optional(),

      sourceType:
        z
          .enum(
            Object.values(
              QUOTE_SOURCE_TYPES,
            ),
          )
          .optional(),

      page:
        z.coerce
          .number()
          .int()
          .min(1)
          .default(1),

      limit:
        z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10),
    })
    .strict();

/*
|--------------------------------------------------------------------------
| Customer List Query
|--------------------------------------------------------------------------
*/

const myQuoteListQuery =
  z
    .object({
      status:
        z
          .enum(
            Object.values(
              QUOTE_STATUSES,
            ),
          )
          .optional(),

      page:
        z.coerce
          .number()
          .int()
          .min(1)
          .default(1),

      limit:
        z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20),
    })
    .strict();

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  createWholesaleQuoteBody,
  createManufacturingQuoteBody,
  createPrintingQuoteBody,

  updateQuoteBody,
  rejectQuoteBody,
  convertQuoteToOrderBody,

  idParams,
  quoteIdParams: idParams,

  adminQuoteListQuery,
  listAdminQuotesQuery: adminQuoteListQuery,

  myQuoteListQuery,
  listMyQuotesQuery: myQuoteListQuery,
};
