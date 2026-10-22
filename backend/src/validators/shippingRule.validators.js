'use strict';

const { z } = require('zod');

const {
  SHIPPING_RULE_TYPES,
} = require('../constants/ShippingRule');

const objectId = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    'Invalid shipping rule id',
  );

const cityRateSchema = z
  .object({
    city: z
      .string()
      .trim()
      .min(1)
      .max(100),

    rate: z.coerce
      .number()
      .min(0),
  })
  .strict();

const baseRuleShape = {
  name: z
    .string()
    .trim()
    .min(2)
    .max(120),

  type: z.enum(
    SHIPPING_RULE_TYPES,
  ),

  flatRate: z.coerce
    .number()
    .min(0)
    .nullable()
    .optional(),

  cityRates: z
    .array(cityRateSchema)
    .max(100)
    .optional(),

  minimumOrderAmount: z.coerce
    .number()
    .min(0)
    .nullable()
    .optional(),

  country: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .default('Pakistan'),

  currency: z
    .enum(['PKR', 'USD'])
    .default('PKR'),

  isActive: z
    .boolean()
    .default(true),

  priority: z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .default(100),
};

function validateRuleConfiguration(
  data,
  ctx,
) {
  if (
    data.type === 'flat' &&
    (
      data.flatRate ===
        undefined ||
      data.flatRate === null
    )
  ) {
    ctx.addIssue({
      code:
        z.ZodIssueCode.custom,

      path: ['flatRate'],

      message:
        'Flat rate is required for flat shipping',
    });
  }

  if (
    data.type ===
      'city_based' &&
    (
      !Array.isArray(
        data.cityRates,
      ) ||
      data.cityRates.length === 0
    )
  ) {
    ctx.addIssue({
      code:
        z.ZodIssueCode.custom,

      path: ['cityRates'],

      message:
        'At least one city rate is required',
    });
  }

  if (
    data.type ===
      'free_shipping' &&
    (
      data.minimumOrderAmount ===
        undefined ||
      data.minimumOrderAmount ===
        null
    )
  ) {
    ctx.addIssue({
      code:
        z.ZodIssueCode.custom,

      path: [
        'minimumOrderAmount',
      ],

      message:
        'Minimum order amount is required for free shipping',
    });
  }

  /*
   * Prevent duplicate city names
   * inside one rule.
   */
  if (
    Array.isArray(
      data.cityRates,
    )
  ) {
    const cities =
      data.cityRates.map(
        (item) =>
          item.city
            .trim()
            .toLowerCase(),
      );

    if (
      new Set(cities).size !==
      cities.length
    ) {
      ctx.addIssue({
        code:
          z.ZodIssueCode.custom,

        path: ['cityRates'],

        message:
          'Duplicate cities are not allowed',
      });
    }
  }
}

/*
|--------------------------------------------------------------------------
| Create
|--------------------------------------------------------------------------
*/

exports.createBody = z
  .object(baseRuleShape)
  .strict()
  .superRefine(
    validateRuleConfiguration,
  );

/*
|--------------------------------------------------------------------------
| Update
|--------------------------------------------------------------------------
*/

exports.updateBody = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .optional(),

    type: z
      .enum(
        SHIPPING_RULE_TYPES,
      )
      .optional(),

    flatRate: z.coerce
      .number()
      .min(0)
      .nullable()
      .optional(),

    cityRates: z
      .array(cityRateSchema)
      .max(100)
      .optional(),

    minimumOrderAmount:
      z.coerce
        .number()
        .min(0)
        .nullable()
        .optional(),

    country: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .optional(),

    currency: z
      .enum(['PKR', 'USD'])
      .optional(),

    isActive: z
      .boolean()
      .optional(),

    priority: z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .optional(),
  })
  .strict()
  .refine(
    (data) =>
      Object.keys(data).length >
      0,
    {
      message:
        'At least one field is required',
    },
  );

/*
|--------------------------------------------------------------------------
| Status
|--------------------------------------------------------------------------
*/

exports.statusBody = z
  .object({
    isActive:
      z.boolean(),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| ID Params
|--------------------------------------------------------------------------
*/

exports.idParams = z
  .object({
    id: objectId,
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Admin List
|--------------------------------------------------------------------------
*/

exports.listQuery = z
  .object({
    type: z
      .enum(
        SHIPPING_RULE_TYPES,
      )
      .optional(),

    isActive: z
      .enum([
        'true',
        'false',
      ])
      .transform(
        (value) =>
          value === 'true',
      )
      .optional(),

    currency: z
      .enum(['PKR', 'USD'])
      .optional(),

    search: z
      .string()
      .trim()
      .max(100)
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
| Public Shipping Calculation
|--------------------------------------------------------------------------
|
| subtotal must be server authoritative
| during actual checkout.
|
| This public endpoint is only useful for
| displaying an estimate.
|--------------------------------------------------------------------------
*/

exports.calculateBody = z
  .object({
    subtotal: z.coerce
      .number()
      .min(0),

    city: z
      .string()
      .trim()
      .min(1)
      .max(100),

    country: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .default('Pakistan'),

    currency: z
      .enum(['PKR', 'USD'])
      .default('PKR'),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Public Free-Shipping Info Query
|--------------------------------------------------------------------------
*/

exports.freeShippingQuery = z
  .object({
    // Omitted: Pakistan for PKR; for USD, rules of any country.
    country: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .optional(),

    // Currency the amounts are wanted in. Omitted = PKR (backward compatible).
    currency: z
      .enum(['PKR', 'USD'])
      .default('PKR'),
  })
  .strict()
  // PKR keeps the original default country; USD without a country spans all USD rules.
  .transform((q) => ({
    ...q,
    country: q.country ?? (q.currency === 'PKR' ? 'Pakistan' : undefined),
  }));
