'use strict';

const { z } = require('zod');

/*
|--------------------------------------------------------------------------
| Guest Order Tracking
|--------------------------------------------------------------------------
|
| Guest order ko sirf order number se access nahi kiya ja sakta.
|
| Required:
|
| PH-000001 + email
| OR
| PH-000001 + phone
|--------------------------------------------------------------------------
*/

exports.trackGuestOrderBody = z
  .object({
    orderNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^PH-\d{6}$/,
        'Invalid order number format',
      ),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(160)
      .optional(),

    phone: z
      .string()
      .trim()
      .min(7)
      .max(20)
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      !data.email &&
      !data.phone
    ) {
      ctx.addIssue({
        code:
          z.ZodIssueCode.custom,

        message:
          'Email or phone number is required',

        path: ['email'],
      });
    }
  });