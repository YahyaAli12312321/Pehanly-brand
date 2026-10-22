'use strict';

const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

exports.listQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    action: z.string().trim().min(1).max(80).optional(),
    entityType: z.string().trim().min(1).max(80).optional(),
    entityId: z.string().trim().min(1).max(80).optional(),
    admin: objectId.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"from" must not be after "to"', path: ['from'] });
