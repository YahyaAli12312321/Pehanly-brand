'use strict';

const { z } = require('zod');

const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id');

exports.idParams = z
  .object({
    id: objectId,
  })
  .strict();

exports.listQuery = z.object({
  search: z.string().trim().max(120).optional(),

  status: z.enum(['all', 'active', 'suspended']).default('all'),

  tier: z.enum(['all', 'retail', 'wholesale', 'vip']).default('all'),

  sortBy: z.enum(['createdAt', 'name', 'orders', 'ltv']).default('createdAt'),

  sortDir: z.enum(['asc', 'desc']).default('desc'),

  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),
});

exports.orderHistoryQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),
});

exports.statusBody = z
  .object({
    status: z.enum(['active', 'suspended']),

    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
