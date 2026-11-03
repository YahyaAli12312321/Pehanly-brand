'use strict';

const { z } = require('zod');
const { PERMISSIONS } = require('../constants/Permissions');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters');

const permissionList = z
  .array(z.enum(PERMISSIONS))
  .max(PERMISSIONS.length)
  .transform((list) => [...new Set(list)]);

exports.idParams = z.object({ id: objectId }).strict();

exports.listQuery = z
  .object({
    search: z.string().trim().max(120).optional(),
    status: z.enum(['all', 'active', 'inactive']).default('all'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

exports.createBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(160),
    phone: z.string().trim().min(7).max(20),
    password,
    permissions: permissionList.default([]),
  })
  .strict();

exports.updateBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    permissions: permissionList.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Nothing to update',
  });

exports.statusBody = z
  .object({ isActive: z.boolean() })
  .strict();

exports.passwordBody = z.object({ password }).strict();
