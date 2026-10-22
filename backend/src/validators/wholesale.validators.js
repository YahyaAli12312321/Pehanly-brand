'use strict';

const { z } = require('zod');
const { mediaUrl } = require('./common');

const {
  WHOLESALE_REQUEST_STATUSES,
  WHOLESALE_REQUEST_TYPES,
} = require('../constants/Wholesale');
/*
|--------------------------------------------------------------------------
| Common Validators
|--------------------------------------------------------------------------
*/

const objectId = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    'Invalid MongoDB ObjectId',
  );

const wholesaleIdParams = z
  .object({
    id: objectId,
  })
  .strict();

const packSlugParams = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(180)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug must contain lowercase letters, numbers and hyphens only',
      ),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Customer Snapshot
|--------------------------------------------------------------------------
*/

const customerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(120),

    email: z
      .string()
      .trim()
      .email()
      .max(160),

    phone: z
      .string()
      .trim()
      .min(7)
      .max(20),

    businessName: z
      .string()
      .trim()
      .max(160)
      .optional(),

    businessType: z
      .string()
      .trim()
      .max(120)
      .optional(),

    taxNtn: z
      .string()
      .trim()
      .max(50)
      .optional(),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Build Your Own Wholesale Request
|--------------------------------------------------------------------------
*/

const customWholesaleItemSchema = z
  .object({
    sku: objectId,

    quantity: z.coerce
      .number()
      .int()
      .min(1),
  })
  .strict();

const createCustomRequestBody = z
  .object({
    customer: customerSchema,

    items: z
      .array(customWholesaleItemSchema)
      .min(1)
      .max(100),

    partnershipProposal: z
      .string()
      .trim()
      .max(5000)
      .optional(),

    customerNotes: z
      .string()
      .trim()
      .max(2000)
      .optional(),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Ready Pack Request
|--------------------------------------------------------------------------
*/

const createPackRequestBody = z
  .object({
    customer: customerSchema,

    partnershipProposal: z
      .string()
      .trim()
      .max(5000)
      .optional(),

    customerNotes: z
      .string()
      .trim()
      .max(2000)
      .optional(),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Admin Pack Management
|--------------------------------------------------------------------------
*/

const packItemSchema = z
  .object({
    sku: objectId,

    quantity: z.coerce
      .number()
      .int()
      .min(1),
  })
  .strict();

const packImageSchema = z
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

const createPackBody = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(160),

    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(180)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug must contain lowercase letters, numbers and hyphens only',
      ),

    description: z
      .string()
      .trim()
      .max(2000)
      .optional(),

    image: packImageSchema.optional(),

    items: z
      .array(packItemSchema)
      .min(1)
      .max(100),

    isActive: z
      .boolean()
      .default(true),

    sortOrder: z.coerce
      .number()
      .int()
      .default(0),
  })
  .strict();

const updatePackBody = createPackBody
  .partial()
  .refine(
    (value) =>
      Object.keys(value).length > 0,
    {
      message:
        'At least one field is required',
    },
  );

/*
|--------------------------------------------------------------------------
| Customer Request Listing
|--------------------------------------------------------------------------
*/

const listMyRequestsQuery = z
  .object({
    status: z
      .enum(
        Object.values(
          WHOLESALE_REQUEST_STATUSES,
        ),
      )
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
| Admin Request Listing
|--------------------------------------------------------------------------
| Supports:
| - Search
| - Status filtering
| - Pagination
|--------------------------------------------------------------------------
*/
const listAdminRequestsQuery = z
  .object({
    search: z
      .string()
      .trim()
      .max(160)
      .optional(),

    status: z
      .enum(
        Object.values(
          WHOLESALE_REQUEST_STATUSES,
        ),
      )
      .optional(),

    requestType: z
      .enum(
        Object.values(
          WHOLESALE_REQUEST_TYPES,
        ),
      )
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
      .default(10),
  })
  .strict();
/*
|--------------------------------------------------------------------------
| Ready Pack Listing
|--------------------------------------------------------------------------
*/

const listPacksQuery = z
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
|--------------------------------------------------------------------------
| Admin Review Request
|--------------------------------------------------------------------------
| review:
|   pending -> under_review
|
| reject:
|   pending / under_review -> rejected
|--------------------------------------------------------------------------
*/

const reviewRequestBody = z
  .object({
    action: z.enum([
      'review',
      'reject',
    ]),

    adminNotes: z
      .string()
      .trim()
      .max(5000)
      .optional(),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Admin Approve Request
|--------------------------------------------------------------------------
| Used by:
| "Approve Account" action in Admin Wholesale UI.
|
| Discount scheme is optional.
|--------------------------------------------------------------------------
*/

const approveRequestBody = z
  .object({
    adminNotes: z
      .string()
      .trim()
      .max(5000)
      .optional(),

    discountScheme: z
      .object({
        name: z
          .string()
          .trim()
          .min(1)
          .max(160),

        discountPercent: z.coerce
          .number()
          .min(0)
          .max(100),

        minimumOrderQuantity:
          z.coerce
            .number()
            .int()
            .min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
const packStatusBody = z
  .object({
    isActive: z.boolean(),
  })
  .strict();
/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  wholesaleIdParams,
  packSlugParams,
  packStatusBody,
  createCustomRequestBody,
  createPackRequestBody,

  createPackBody,
  updatePackBody,

  listMyRequestsQuery,
  listAdminRequestsQuery,
  listPacksQuery,

  reviewRequestBody,
  approveRequestBody,
};