'use strict';

const { z } = require('zod');
const { mediaUrl, safeLink } = require('./common');

const {
  BANNER_PLACEMENTS,
  BANNER_STATUSES,
} = require('../constants/Banner');

const objectId = z
  .string()
  .trim()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    'Invalid MongoDB ObjectId',
  );

const optionalDate = z
  .union([
    z.coerce.date(),
    z.null(),
  ])
  .optional();

const imageSchema = z
  .object({
    url: mediaUrl(500),

    publicId: z
      .string()
      .trim()
      .max(250)
      .optional(),

    alt: z
      .string()
      .trim()
      .max(160)
      .optional(),
  })
  .strict();

const ctaSchema = z
  .object({
    label: z
      .string()
      .trim()
      .max(80)
      .optional(),

    target: safeLink(500).optional(),
  })
  .strict()
  .refine(
    (data) =>
      !data.label ||
      Boolean(data.target),
    {
      message:
        'CTA target is required when CTA label is provided',
      path: ['target'],
    },
  );

const createBannerBody = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(160),

    subtitle: z
      .string()
      .trim()
      .max(500)
      .optional(),

    placement: z.enum(
      Object.values(BANNER_PLACEMENTS),
    ),

    image: imageSchema,

    mobileImage:
      imageSchema.optional(),

    cta: ctaSchema.optional(),

    isActive:
      z.boolean().default(true),

    sortOrder: z.coerce
      .number()
      .int()
      .min(0)
      .default(0),

    startsAt: optionalDate,
    endsAt: optionalDate,
  })
  .strict()
  .refine(
    (data) =>
      !data.startsAt ||
      !data.endsAt ||
      data.endsAt > data.startsAt,
    {
      message:
        'Banner end date must be after start date',
      path: ['endsAt'],
    },
  );

const updateBannerBody = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional(),

    subtitle: z
      .string()
      .trim()
      .max(500)
      .optional(),

    placement: z
      .enum(
        Object.values(
          BANNER_PLACEMENTS,
        ),
      )
      .optional(),

    image:
      imageSchema.optional(),

    mobileImage: z
      .union([
        imageSchema,
        z.null(),
      ])
      .optional(),

    cta: z
      .union([
        ctaSchema,
        z.null(),
      ])
      .optional(),

    isActive:
      z.boolean().optional(),

    sortOrder: z.coerce
      .number()
      .int()
      .min(0)
      .optional(),

    startsAt: optionalDate,
    endsAt: optionalDate,
  })
  .strict()
  .refine(
    (data) =>
      Object.keys(data).length > 0,
    {
      message:
        'At least one field is required',
    },
  )
  .refine(
    (data) =>
      !data.startsAt ||
      !data.endsAt ||
      data.endsAt > data.startsAt,
    {
      message:
        'Banner end date must be after start date',
      path: ['endsAt'],
    },
  );

const bannerStatusBody = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

const bannerIdParams = z
  .object({
    id: objectId,
  })
  .strict();

const publicBannersQuery = z
  .object({
    placement: z.enum(
      Object.values(
        BANNER_PLACEMENTS,
      ),
    ),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10),
  })
  .strict();

const adminBannersQuery = z
  .object({
    search: z
      .string()
      .trim()
      .max(160)
      .optional(),

    placement: z
      .enum(
        Object.values(
          BANNER_PLACEMENTS,
        ),
      )
      .optional(),

    status: z
      .enum(
        Object.values(
          BANNER_STATUSES,
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

module.exports = {
  createBannerBody,
  updateBannerBody,
  bannerStatusBody,

  bannerIdParams,

  publicBannersQuery,
  adminBannersQuery,
};