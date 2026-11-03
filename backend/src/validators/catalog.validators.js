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
    // men => men + unisex, women => women + unisex, unisex => unisex only
    audience: z.enum(['men', 'women', 'unisex']).optional(),
    featured: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    // true => only products whose isNewArrival flag is explicitly true; false => everything else (flag false/unset)
    newArrival: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    // true => this request is for a dedicated section's own page (needs `category`); products of a dedicated section are
    // returned ONLY with this flag, never by the general listing.
    section: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    // Refinements (applied on the server so pagination and totals stay correct)
    size: z.string().trim().max(20).optional(),
    color: z.string().trim().max(60).optional(),
    minPrice: z.coerce.number().min(0).max(100_000_000).optional(),
    maxPrice: z.coerce.number().min(0).max(100_000_000).optional(),
    inStock: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
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
    // true => top-level (parent) categories only: those with no parentCategory
    parentOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    // slug of a dedicated section: returns that section and its active sub-categories (otherwise they are never listed)
    section: slug.optional(),
  })
  .strict();

// Filter options (sizes, colours, price span, sub-categories with counts) for one category.
exports.facetsQuery = z
  .object({
    category: slug,
    section: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    currency: z.enum(['PKR', 'USD']).optional(),
  })
  .strict();
