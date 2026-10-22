'use strict';

const { z } = require('zod');
const { mediaUrl } = require('./common');

const {
  MANUFACTURING_REQUEST_STATUSES,
  MANUFACTURING_DOCUMENT_TYPES,
} = require('../constants/Manufacturing');

const objectId = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    'Invalid MongoDB ObjectId',
  );

const manufacturingIdParams = z
  .object({
    id: objectId,
  })
  .strict();

const slugParams = z
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

const mediaSchema = z
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

    viewType: z
      .enum([
        'model',
        'mockup',
        'other',
      ])
      .default('other'),

    sortOrder: z.coerce
      .number()
      .int()
      .default(0),
  })
  .strict();

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
| Category
|--------------------------------------------------------------------------
*/

const createCategoryBody = z
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
      .max(3000)
      .optional(),

    isActive: z
      .boolean()
      .default(true),

    sortOrder: z.coerce
      .number()
      .int()
      .default(0),
  })
  .strict();

const updateCategoryBody =
  createCategoryBody
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
| Style
|--------------------------------------------------------------------------
*/

const createStyleBody = z
  .object({
    category: objectId,

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
      .max(3000)
      .optional(),

    isActive: z
      .boolean()
      .default(true),

    sortOrder: z.coerce
      .number()
      .int()
      .default(0),
  })
  .strict();

const updateStyleBody =
  createStyleBody
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
| Variant
|--------------------------------------------------------------------------
*/

const createVariantBody = z
  .object({
    style: objectId,

    name: z
      .string()
      .trim()
      .min(1)
      .max(160),

    variantCode: z
      .string()
      .trim()
      .min(1)
      .max(60),

    colorName: z
      .string()
      .trim()
      .max(80)
      .optional(),

    description: z
      .string()
      .trim()
      .max(3000)
      .optional(),

    media: z
      .array(mediaSchema)
      .max(30)
      .optional(),

    isActive: z
      .boolean()
      .default(true),

    sortOrder: z.coerce
      .number()
      .int()
      .default(0),
  })
  .strict();

const updateVariantBody =
  createVariantBody
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
| Request
|--------------------------------------------------------------------------
*/

const createRequestBody = z
  .object({
    customer: customerSchema,

    category: objectId,
    style: objectId,

    variant: objectId
      .nullable()
      .optional(),

    quantity: z.coerce
      .number()
      .int()
      .min(1),

    requirements: z
      .string()
      .trim()
      .min(3)
      .max(10000),

    customerNotes: z
      .string()
      .trim()
      .max(3000)
      .optional(),
  })
  .strict();

const listMyRequestsQuery = z
  .object({
    status: z
      .enum(
        Object.values(
          MANUFACTURING_REQUEST_STATUSES,
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
          MANUFACTURING_REQUEST_STATUSES,
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

const listCatalogQuery = z
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
      .default(50),
  })
  .strict();

const statusBody = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

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

const approveRequestBody = z
  .object({
    adminNotes: z
      .string()
      .trim()
      .max(5000)
      .optional(),
  })
  .strict();

/*
 * Route-facing names used by manufacturing.routes.js and adminManufacturing.routes.js.
 */
const idParams = manufacturingIdParams;

const categoryIdParams = z
  .object({
    categoryId: objectId,
  })
  .strict();

const styleIdParams = z
  .object({
    styleId: objectId,
  })
  .strict();

const catalogTypeParams = z
  .object({
    type: z.enum([
      MANUFACTURING_DOCUMENT_TYPES.CATEGORY,
      MANUFACTURING_DOCUMENT_TYPES.STYLE,
      MANUFACTURING_DOCUMENT_TYPES.VARIANT,
    ]),
  })
  .strict();

const listPublicQuery = listCatalogQuery;
const catalogStatusBody = statusBody;

module.exports = {
  manufacturingIdParams,
  idParams,
  slugParams,
  categoryIdParams,
  styleIdParams,
  catalogTypeParams,

  createCategoryBody,
  updateCategoryBody,

  createStyleBody,
  updateStyleBody,

  createVariantBody,
  updateVariantBody,

  createRequestBody,

  listMyRequestsQuery,
  listAdminRequestsQuery,
  listCatalogQuery,
  listPublicQuery,

  statusBody,
  catalogStatusBody,
  reviewRequestBody,
  approveRequestBody,
};
