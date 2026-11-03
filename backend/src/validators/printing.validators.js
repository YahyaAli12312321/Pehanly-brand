'use strict';

const { z } = require('zod');
const { mediaUrl } = require('./common');

const {
  PRINTING_REQUEST_STATUSES,
  PRINTING_GARMENT_SOURCES,
} = require('../constants/Printing');

const objectId = z
  .string()
  .trim()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    'Invalid MongoDB ObjectId',
  );

const paginationQuery = {
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
};

const mediaItem = z
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

    sortOrder: z.coerce
      .number()
      .int()
      .min(0)
      .default(0),
  })
  .strict();

const artworkItem = z
  .object({
    url: mediaUrl(500),

    publicId: z
      .string()
      .trim()
      .min(1)
      .max(250),

    resourceType: z
      .string()
      .trim()
      .max(50)
      .optional(),

    originalName: z
      .string()
      .trim()
      .max(255)
      .optional(),

    format: z
      .string()
      .trim()
      .max(30)
      .optional(),

    bytes: z.coerce
      .number()
      .int()
      .min(0)
      .optional(),
  })
  .strict();

const placementItem = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(120),

    description: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  })
  .strict();

const customerBody = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(120),

    email: z
      .string()
      .trim()
      .email()
      .max(160),

    phone: z
      .string()
      .trim()
      .min(5)
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

const createPrintingServiceBody = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(160),

    slug: z
      .string()
      .trim()
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

    media: z
      .array(mediaItem)
      .max(20)
      .optional(),

    isActive: z.boolean().default(true),

    sortOrder: z.coerce
      .number()
      .int()
      .min(0)
      .default(0),
  })
  .strict();

const updatePrintingServiceBody =
  createPrintingServiceBody
    .partial()
    .refine(
      (data) =>
        Object.keys(data).length > 0,
      {
        message: 'At least one field is required',
      },
    );

const createPrintingRequestBody = z
  .object({
    serviceId: objectId,

    customer: customerBody,

    garmentSource: z.enum(
      Object.values(PRINTING_GARMENT_SOURCES),
    ),

    garmentDetails: z
      .string()
      .trim()
      .min(1)
      .max(3000),

    colors: z
      .array(
        z.string()
          .trim()
          .min(1)
          .max(80),
      )
      .max(50)
      .optional(),

    quantity: z.coerce
      .number()
      .int()
      .min(1)
      .max(1_000_000),

    requirements: z
      .string()
      .trim()
      .min(1)
      .max(10000),

    placements: z
      .array(placementItem)
      .max(20)
      .optional(),

    artwork: z
      .array(artworkItem)
      .max(20)
      .optional(),

    customerNotes: z
      .string()
      .trim()
      .max(3000)
      .optional(),
  })
  .strict();

const reviewPrintingRequestBody = z
  .object({
    adminNotes: z
      .string()
      .trim()
      .max(5000)
      .optional(),
  })
  .strict();

const approvePrintingRequestBody = z
  .object({
    adminNotes: z
      .string()
      .trim()
      .max(5000)
      .optional(),
  })
  .strict();

const rejectPrintingRequestBody = z
  .object({
    adminNotes: z
      .string()
      .trim()
      .min(1)
      .max(5000),
  })
  .strict();

const printingIdParams = z
  .object({
    id: objectId,
  })
  .strict();

const publicPrintingServicesQuery = z
  .object({
    ...paginationQuery,

    search: z
      .string()
      .trim()
      .max(160)
      .optional(),
  })
  .strict();

const myPrintingRequestsQuery = z
  .object({
    ...paginationQuery,

    status: z
      .enum(
        Object.values(
          PRINTING_REQUEST_STATUSES,
        ),
      )
      .optional(),
  })
  .strict();

const adminPrintingServicesQuery = z
  .object({
    ...paginationQuery,

    search: z
      .string()
      .trim()
      .max(160)
      .optional(),

    isActive: z
      .enum(['true', 'false'])
      .optional(),
  })
  .strict();

const adminPrintingRequestsQuery = z
  .object({
    ...paginationQuery,

    search: z
      .string()
      .trim()
      .max(160)
      .optional(),

    status: z
      .enum(
        Object.values(
          PRINTING_REQUEST_STATUSES,
        ),
      )
      .optional(),

    garmentSource: z
      .enum(
        Object.values(
          PRINTING_GARMENT_SOURCES,
        ),
      )
      .optional(),
  })
  .strict();

module.exports = {
  createPrintingServiceBody,
  updatePrintingServiceBody,

  createPrintingRequestBody,

  reviewPrintingRequestBody,
  approvePrintingRequestBody,
  rejectPrintingRequestBody,

  printingIdParams,

  publicPrintingServicesQuery,
  myPrintingRequestsQuery,

  adminPrintingServicesQuery,
  adminPrintingRequestsQuery,
};