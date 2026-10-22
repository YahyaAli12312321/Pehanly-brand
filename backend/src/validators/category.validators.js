'use strict';
const { z } = require('zod');
const { mediaUrl } = require('./common');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const media = z.object({ url: mediaUrl(500), publicId: z.string().max(200).optional(), alt: z.string().max(160).optional() }).strict();
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const seo = z.object({
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(320).optional(),
  socialImage: media.optional(),
  canonicalUrl: z.string().trim().max(300).optional(),
  index: z.boolean().optional(),
}).strict();

const fields = {
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens').max(80),
  description: z.string().trim().max(1000),
  image: media.nullable(),
  parentCategory: objectId.nullable(),
  audience: z.string().trim().toLowerCase().max(40),
  isActive: z.boolean(),
  showOnHome: z.boolean(),
  retailOnly: z.boolean(),
  sortOrder: z.number().int().min(0).max(100000),
  seo,
};

exports.createBody = z.object({ ...fields, slug: fields.slug.optional(), description: fields.description.optional(), image: fields.image.optional(), parentCategory: fields.parentCategory.optional(), audience: fields.audience.optional(), isActive: fields.isActive.optional(), showOnHome: fields.showOnHome.optional(), retailOnly: fields.retailOnly.optional(), sortOrder: fields.sortOrder.optional(), seo: seo.optional() }).strict();

exports.updateBody = z.object(fields).partial().strict().refine((b) => Object.keys(b).length > 0, 'Nothing to update');

exports.statusBody = z.object({ isActive: z.boolean() }).strict();

exports.idParams = z.object({ id: objectId });

exports.listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  audience: z.string().trim().toLowerCase().max(40).optional(),
  parent: z.union([z.literal('root'), objectId]).optional(),
  showOnHome: bool.optional(),
  sortBy: z.enum(['sortOrder', 'name', 'createdAt']).default('sortOrder'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
