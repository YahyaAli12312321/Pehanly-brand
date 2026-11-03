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

/*
 * Size/colour allocation contract: for each product the customer declares how many pieces they ordered;
 * the backend rejects (create) / reports (preview) any product whose SKU rows do not add up to it.
 */
const orderedQuantitySchema = z
  .object({
    product: objectId,
    ordered: z.coerce.number().int().min(1).max(1_000_000),
  })
  .strict();

const previewBody = z
  .object({
    // With a packId, `items` is only meaningful for a FLEXIBLE pack (the buyer's selection); the service rejects it for fixed packs.
    items: z.array(customWholesaleItemSchema).max(500).optional(),
    packId: objectId.optional(),
    ordered: z.array(orderedQuantitySchema).max(100).optional(),
  })
  .strict()
  .refine((b) => (b.packId ? true : b.items?.length > 0), {
    message: 'Provide either items or a packId',
    path: ['items'],
  });

const createCustomRequestBody = z
  .object({
    customer: customerSchema,

    items: z
      .array(customWholesaleItemSchema)
      .min(1)
      .max(100),

    ordered: z.array(orderedQuantitySchema).max(100).optional(),

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

const packSelectionSchema = z
  .object({
    sku: objectId,
    quantity: z.coerce.number().int().min(1).max(1_000_000),
  })
  .strict();

const createPackRequestBody = z
  .object({
    customer: customerSchema,

    // Flexible packs only: the buyer's colour/size split. Must add up to the pack size exactly (checked by the backend).
    selections: z.array(packSelectionSchema).max(500).optional(),

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

    // Flexible packs list eligible SKUs only, so the quantity is optional there (stored as 1, not used).
    quantity: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),
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

const createPackShape = z
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

    badge: z.string().trim().max(40).optional(),
    packPrice: z.number().positive().max(100_000_000).nullable().optional(),
    compareAtValue: z.number().positive().max(100_000_000).nullable().optional(),
    moq: z.number().int().min(1).max(100000).nullable().optional(),
    dispatchText: z.string().trim().max(160).optional(),
    isFeatured: z.boolean().default(false),

    selectionMode: z.enum(['fixed', 'flexible']).default('fixed'),
    packSize: z.number().int().min(1).max(100000).nullable().optional(),
    colorProduct: objectId.nullable().optional(),

    sortOrder: z.coerce
      .number()
      .int()
      .default(0),
  })
  .strict();

const createPackBody = createPackShape.refine(
  (b) => b.selectionMode !== 'flexible' || b.packSize >= 1,
  { message: 'Pack size is required for a flexible pack', path: ['packSize'] },
);

const updatePackBody = createPackShape
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
  previewBody,

  createPackBody,
  updatePackBody,

  listMyRequestsQuery,
  listAdminRequestsQuery,
  listPacksQuery,

  reviewRequestBody,
  approveRequestBody,
};