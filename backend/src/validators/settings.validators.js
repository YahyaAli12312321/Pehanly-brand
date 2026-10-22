'use strict';

const { z } = require('zod');

const { httpUrl, safeLink } = require('./common');

const optionalText = (max) => z.string().trim().max(max).optional();

const optionalUrl = httpUrl(300).optional().or(z.literal('').transform(() => undefined));

exports.updateBody = z
  .object({
    storeName: z.string().trim().min(1).max(120).optional(),
    tagline: optionalText(200),

    contact: z
      .object({
        email: z.string().trim().toLowerCase().email().max(160).optional(),
        phone: optionalText(30),
        whatsapp: optionalText(30),
        address: optionalText(300),
      })
      .strict()
      .optional(),

    social: z
      .object({
        facebook: optionalUrl,
        instagram: optionalUrl,
        tiktok: optionalUrl,
        youtube: optionalUrl,
      })
      .strict()
      .optional(),

    checkout: z
      .object({
        guestCheckoutEnabled: z.boolean().optional(),
        codEnabled: z.boolean().optional(),
        jazzcashEnabled: z.boolean().optional(),
      })
      .strict()
      .optional(),

    returns: z
      .object({
        enabled: z.boolean().optional(),
        windowDays: z.coerce.number().int().min(0).max(365).optional(),
      })
      .strict()
      .optional(),

    announcement: z
      .object({
        enabled: z.boolean().optional(),
        text: optionalText(240),
        link: safeLink(300).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' });
