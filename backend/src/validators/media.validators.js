'use strict';

const { z } = require('zod');
const { MEDIA_PURPOSE_NAMES } = require('../constants/Media');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

exports.idParams = z.object({ id: objectId }).strict();

exports.uploadBody = z
  .object({
    purpose: z.enum(MEDIA_PURPOSE_NAMES),
  })
  .strict();

exports.listQuery = z
  .object({
    purpose: z.enum(MEDIA_PURPOSE_NAMES).optional(),
    uploadedBy: objectId.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(24),
  })
  .strict();

exports.cleanupBody = z
  .object({
    olderThanHours: z.coerce.number().int().min(1).max(24 * 365).default(24),
  })
  .strict();
