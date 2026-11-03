'use strict';

const { z } = require('zod');
const { WHATSAPP_STATUSES, WHATSAPP_EVENTS, WHATSAPP_AUDIENCES, WHATSAPP_PROVIDERS } = require('../constants/WhatsApp');
const { normalizePhone } = require('../utils/identity');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const date = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date').transform((v) => new Date(v));

exports.whatsappIdParams = z.object({ id: objectId }).strict();

exports.whatsappListQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(Object.values(WHATSAPP_STATUSES)).optional(),
    event: z.enum(Object.values(WHATSAPP_EVENTS)).optional(),
    recipientType: z.enum(Object.values(WHATSAPP_AUDIENCES)).optional(),
    provider: z.enum([WHATSAPP_PROVIDERS.MOCK, WHATSAPP_PROVIDERS.META]).optional(),
    search: z.string().trim().min(1).max(80).optional(),
    from: date.optional(),
    to: date.optional(),
  })
  .strict();

/** `to` is normalised here (03001234567 -> +923001234567) and rejected when it is not a plausible phone number. */
exports.whatsappTestBody = z
  .object({
    to: z.string().trim().min(7).max(24).transform((v, ctx) => {
      const phone = normalizePhone(v);
      if (!phone) ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number' });
      return phone;
    }),
    simulate: z.enum(['success', 'failure', 'temporary_failure']).default('success'),
  })
  .strict();
