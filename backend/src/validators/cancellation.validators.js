'use strict';

const { z } = require('zod');

const objectId = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    'Invalid id',
  );

exports.orderIdParams = z
  .object({
    id: objectId,
  })
  .strict();

exports.requestCancellationBody = z
  .object({
    reason: z
      .string()
      .trim()
      .min(3)
      .max(500),
  })
  .strict();

exports.cancellationIdParams = z
  .object({
    id: objectId,
  })
  .strict();

exports.reviewCancellationBody = z
  .object({
    action: z.enum([
      'approve',
      'reject',
    ]),

    note: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  })
  .strict();

exports.listCancellationQuery = z
  .object({
    status: z
      .enum([
        'pending',
        'approved',
        'rejected',
      ])
      .optional(),

    page: z.coerce
      .number()
      .int()
      .min(1)
      .default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
  })
  .strict();