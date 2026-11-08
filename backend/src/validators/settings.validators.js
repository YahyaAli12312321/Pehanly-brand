'use strict';

const { z } = require('zod');

const { httpUrl, safeLink } = require('./common');

const optionalText = (max) => z.string().trim().max(max).optional();

const optionalUrl = httpUrl(300).optional().or(z.literal('').transform(() => undefined));

/*
 * One size chart. `columns` are the headings, every row carries one value per column (short, free text such as
 * "3-4 years" or "36-38"), so the merchant decides what the chart measures. Rows are replaced as a whole on PATCH.
 */
const sizeChart = z
  .object({
    enabled: z.boolean().optional(),
    note: optionalText(400),
    columns: z.array(z.string().trim().max(60)).max(8).optional(),
    rows: z
      .array(
        z.object({
          size: z.string().trim().min(1).max(40),
          values: z.array(z.string().trim().max(60)).max(8).default([]),
        }).strict(),
      )
      .max(40)
      .optional(),
  })
  .strict()
  .refine((c) => !c.rows || !c.columns || c.rows.every((r) => r.values.length <= c.columns.length), {
    message: 'A row cannot have more values than the chart has columns',
  });

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
        linkedin: optionalUrl,
        tiktok: optionalUrl,
        youtube: optionalUrl,
      })
      .strict()
      .optional(),

    wholesale: z
      .object({
        freightFlat: z.number().min(0).max(100_000_000).optional(),
        taxPercent: z.number().min(0).max(100).optional(),
      })
      .strict()
      .optional(),

    checkout: z
      .object({
        guestCheckoutEnabled: z.boolean().optional(),
        codEnabled: z.boolean().optional(),
        jazzcashEnabled: z.boolean().optional(),
        jazzcashManual: z
          .object({
            enabled: z.boolean().optional(),
            accountTitle: optionalText(120),
            walletNumber: optionalText(30),
            instructions: optionalText(600),
          })
          .strict()
          .optional(),
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

    sizeCharts: z
      .object({ kids: sizeChart.optional(), men: sizeChart.optional(), women: sizeChart.optional(), unisex: sizeChart.optional() })
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
