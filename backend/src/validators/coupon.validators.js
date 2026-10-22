'use strict';

const { z } = require('zod');

const {
  COUPON_DISCOUNT_TYPES,
} = require('../constants/Coupon');

const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid coupon id');

const nullablePositiveInteger = z
  .union([
    z.coerce.number().int().min(1),
    z.null(),
  ])
  .optional();

const nullableNonNegativeNumber = z
  .union([
    z.coerce.number().min(0),
    z.null(),
  ])
  .optional();

const nullablePositiveNumber = z
  .union([
    z.coerce.number().positive(),
    z.null(),
  ])
  .optional();

const nullableDate = z
  .union([
    z.coerce.date(),
    z.null(),
  ])
  .optional();

function validateCoupon(data, ctx) {
  if (
    data.discountType === 'percentage' &&
    data.discountValue > 100
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discountValue'],
      message: 'Percentage discount cannot exceed 100',
    });
  }

  if (
    data.startsAt &&
    data.expiresAt &&
    data.expiresAt <= data.startsAt
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expiresAt'],
      message: 'Expiry date must be after start date',
    });
  }
}

exports.createBody = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(
        /^[A-Za-z0-9_-]+$/,
        'Coupon code may contain letters, numbers, - and _ only',
      )
      .transform((value) => value.toUpperCase()),

    name: z.string().trim().min(2).max(160),

    description: z
      .string()
      .trim()
      .max(1000)
      .optional(),

    discountType: z.enum(COUPON_DISCOUNT_TYPES),

    discountValue: z.coerce.number().positive(),

    minimumOrderAmount: z.coerce
      .number()
      .min(0)
      .default(0),

    maximumDiscountAmount:
      nullableNonNegativeNumber,

    discountValueUSD: nullablePositiveNumber,

    minimumOrderAmountUSD:
      nullableNonNegativeNumber,

    maximumDiscountAmountUSD:
      nullableNonNegativeNumber,

    startsAt: nullableDate,

    expiresAt: nullableDate,

    usageLimit: nullablePositiveInteger,

    usageLimitPerCustomer: z
      .union([
        z.coerce.number().int().min(1),
        z.null(),
      ])
      .default(1),

    isActive: z.boolean().default(true),
  })
  .strict()
  .superRefine(validateCoupon);

exports.updateBody = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((value) => value.toUpperCase())
      .optional(),

    name: z.string().trim().min(2).max(160).optional(),

    description: z
      .string()
      .trim()
      .max(1000)
      .optional(),

    discountType: z
      .enum(COUPON_DISCOUNT_TYPES)
      .optional(),

    discountValue: z.coerce
      .number()
      .positive()
      .optional(),

    minimumOrderAmount: z.coerce
      .number()
      .min(0)
      .optional(),

    maximumDiscountAmount:
      nullableNonNegativeNumber,

    discountValueUSD: nullablePositiveNumber,

    minimumOrderAmountUSD:
      nullableNonNegativeNumber,

    maximumDiscountAmountUSD:
      nullableNonNegativeNumber,

    startsAt: nullableDate,

    expiresAt: nullableDate,

    usageLimit: nullablePositiveInteger,

    usageLimitPerCustomer:
      nullablePositiveInteger,

    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message: 'At least one field is required',
    },
  );

exports.idParams = z
  .object({
    id: objectId,
  })
  .strict();

exports.statusBody = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

exports.listQuery = z
  .object({
    search: z.string().trim().max(100).optional(),

    discountType: z
      .enum(COUPON_DISCOUNT_TYPES)
      .optional(),

    isActive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),

    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
  })
  .strict();

exports.validateBody = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .transform((value) => value.toUpperCase()),

    subtotal: z.coerce.number().min(0),

    // Currency the subtotal is expressed in. Omitted = PKR (backward compatible).
    currency: z.enum(['PKR', 'USD']).optional(),
  })
  .strict();