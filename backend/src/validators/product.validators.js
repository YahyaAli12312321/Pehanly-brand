'use strict';
const { z } = require('zod');
const { mediaUrl } = require('./common');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const media = z.object({ url: mediaUrl(500), publicId: z.string().max(200).optional(), alt: z.string().max(160).optional(), sortOrder: z.number().int().min(0).optional() }).strict();
const money = z.number().min(0).max(100_000_000);

const wholesale = z.object({ isEnabled: z.boolean(), moq: z.number().int().min(1).max(1_000_000).optional() }).strict()
  .refine((w) => !w.isEnabled || w.moq, { message: 'MOQ is required when wholesale is enabled', path: ['moq'] });

const seo = z.object({
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(320).optional(),
  socialImage: media.optional(),
  canonicalUrl: z.string().trim().max(300).optional(),
  index: z.boolean().optional(),
}).strict();

const productFields = {
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens').max(100),
  shortDescription: z.string().trim().max(300),
  description: z.string().trim().max(10000),
  category: objectId,
  generalImages: z.array(media).max(20),
  isFeatured: z.boolean(),
  isNewArrival: z.boolean(),
  isBestSeller: z.boolean(),
  wholesale,
  seo,
};

exports.createProductBody = z.object(productFields).partial({ slug: true, shortDescription: true, description: true, generalImages: true, isFeatured: true, isNewArrival: true, isBestSeller: true, wholesale: true, seo: true }).strict();
exports.updateProductBody = z.object(productFields).partial().strict().refine((b) => Object.keys(b).length > 0, 'Nothing to update');
exports.statusBody = z.object({ status: z.enum(['draft', 'active', 'inactive']) }).strict();
exports.bulkBody = z.object({ ids: z.array(objectId).min(1).max(100), action: z.enum(['activate', 'deactivate', 'feature', 'unfeature']) }).strict();
exports.idParams = z.object({ id: objectId });
exports.variantParams = z.object({ id: objectId, variantId: objectId });

const sizeFields = {
  size: z.string().trim().min(1).max(20),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{1,39}$/, 'Use letters, numbers, dots, dashes (2-40 chars)'),
  price: money.refine((n) => n > 0, 'Price must be greater than 0'),
  compareAtPrice: money,
  wholesalePrice: money,
  priceUSD: money.refine((n) => n > 0, 'USD price must be greater than 0'),
  compareAtPriceUSD: money,
  lowStockThreshold: z.number().int().min(0).max(100000),
  isEnabled: z.boolean(),
};
const checkCompare = (s) => s.compareAtPrice == null || s.price === undefined || s.compareAtPrice > s.price;
const compareMsg = { message: 'Compare price must be higher than price', path: ['compareAtPrice'] };
// A USD compare-at needs a USD price, and must be higher than it.
const checkCompareUSD = (s) => s.compareAtPriceUSD == null || (s.priceUSD != null && s.compareAtPriceUSD > s.priceUSD) || (s.priceUSD === undefined);
const compareUsdMsg = { message: 'USD compare price must be higher than the USD price', path: ['compareAtPriceUSD'] };

const newSize = z.object({ ...sizeFields, stock: z.number().int().min(0).max(10_000_000).default(0) })
  .partial({ compareAtPrice: true, wholesalePrice: true, priceUSD: true, compareAtPriceUSD: true, lowStockThreshold: true, isEnabled: true }).strict().refine(checkCompare, compareMsg)
  .refine((s) => s.compareAtPriceUSD == null || s.priceUSD != null, { message: 'Set a USD price before a USD compare price', path: ['compareAtPriceUSD'] })
  .refine(checkCompareUSD, compareUsdMsg);
// For updates, stock is accepted only when the SKU is new (existing stock changes go through Inventory).
const sizeUpsert = z.object({ ...sizeFields, compareAtPrice: money.nullable(), wholesalePrice: money.nullable(), priceUSD: sizeFields.priceUSD.nullable(), compareAtPriceUSD: money.nullable(), stock: z.number().int().min(0).max(10_000_000).optional() })
  .partial({ size: true, price: true, compareAtPrice: true, wholesalePrice: true, priceUSD: true, compareAtPriceUSD: true, lowStockThreshold: true, isEnabled: true, stock: true }).strict().refine(checkCompare, compareMsg)
  .refine((s) => !(s.priceUSD === null && s.compareAtPriceUSD != null), { message: 'Cannot keep a USD compare price while clearing the USD price', path: ['compareAtPriceUSD'] });

const color = z.object({ name: z.string().trim().min(1).max(60), hexCode: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB color').optional() }).strict();
const variantFields = {
  color,
  variantCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,39}$/),
  images: z.array(media).max(12),
  isEnabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(100000),
};
const dupSkuCheck = (b) => !b.sizes || new Set(b.sizes.map((s) => s.sku)).size === b.sizes.length;
const dupMsg = { message: 'Each SKU may appear once', path: ['sizes'] };

exports.createVariantBody = z.object({ ...variantFields, sizes: z.array(newSize).min(1).max(80) })
  .partial({ images: true, isEnabled: true, sortOrder: true }).strict().refine(dupSkuCheck, dupMsg);
exports.updateVariantBody = z.object({ ...variantFields, sizes: z.array(sizeUpsert.refine((s) => s.sku, { message: 'sku is required', path: ['sku'] })).max(80) })
  .partial().strict().refine((b) => Object.keys(b).length > 0, 'Nothing to update').refine(dupSkuCheck, dupMsg);

exports.listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  category: objectId.optional(),
  status: z.enum(['draft', 'active', 'inactive']).optional(),
  stock: z.enum(['low', 'out']).optional(),
  featured: bool.optional(),
  sortBy: z.enum(['createdAt', 'name', 'updatedAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
