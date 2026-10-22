'use strict';

const { z } = require('zod');

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug');

exports.slugParams = z.object({ slug }).strict();

exports.productsQuery = z
  .object({
    category: slug.optional(), // category slug; sub-categories are included
    search: z.string().trim().max(120).optional(),
    featured: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
    // Only affects price sorting (which price to sort by). Omitted = PKR.
    currency: z.enum(['PKR', 'USD']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(60).default(24),
  })
  .strict();

exports.categoriesQuery = z
  .object({
    audience: z.string().trim().toLowerCase().max(40).optional(),
    homeOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  })
  .strict();
