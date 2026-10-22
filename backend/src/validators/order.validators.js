'use strict';

const { z } = require('zod');
const { httpUrl } = require('./common');

/*
|--------------------------------------------------------------------------
| Common
|--------------------------------------------------------------------------
*/

const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id');

/*
|--------------------------------------------------------------------------
| Order Constants
|--------------------------------------------------------------------------
*/

const orderStatus = z.enum([
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
]);

const orderType = z.enum([
  'retail',
  'wholesale',
  'manufacturing',
  'printing',
]);

const paymentStatus = z.enum([
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded',
]);

// ADD THIS HERE
// V1: COD only. JazzCash is deferred and must not be accepted until that gateway is implemented.
const paymentMethod = z.enum([
  'cod',
]);

/*
|--------------------------------------------------------------------------
| Checkout Item
|--------------------------------------------------------------------------
*/

const checkoutItem = z
  .object({
    sku: objectId,

    quantity: z
      .number()
      .int()
      .min(1)
      .max(1000),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Customer Snapshot
|--------------------------------------------------------------------------
*/

const customer = z
  .object({
    name: z
      .string()
      .trim()
      .min(2)
      .max(120),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(160),

    phone: z
      .string()
      .trim()
      .min(7)
      .max(20),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Shipping Address
|--------------------------------------------------------------------------
*/

const shippingAddress = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2)
      .max(120),

    phone: z
      .string()
      .trim()
      .min(7)
      .max(20),

    addressLine1: z
      .string()
      .trim()
      .min(5)
      .max(250),

    addressLine2: z
      .string()
      .trim()
      .max(250)
      .optional(),

    city: z
      .string()
      .trim()
      .min(2)
      .max(100),

    province: z
      .string()
      .trim()
      .max(100)
      .optional(),

    postalCode: z
      .string()
      .trim()
      .max(30)
      .optional(),

    country: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .default('Pakistan'),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Create Retail Order
|--------------------------------------------------------------------------
|
| Frontend is intentionally NOT allowed to send:
|
| - product
| - variant
| - price
| - subtotal
| - discount
| - shipping fee
| - total
|
| Server derives all commercial data from SKU.
|
| couponCode:
| - Optional
| - Frontend only sends the code
| - Backend validates coupon
| - Backend calculates actual discount
| - Guest customer cannot redeem a coupon
|--------------------------------------------------------------------------
*/

exports.createRetailOrderBody = z
  .object({
    items: z
      .array(checkoutItem)
      .min(1)
      .max(100),

    customer,

    shippingAddress,

    paymentMethod,

    /*
     * Optional. Omitted = PKR (backward compatible). USD is accepted by the
     * schema so the backend can answer with the explicit USD_PAYMENT_UNAVAILABLE
     * error instead of a generic validation failure.
     */
    currency: z
      .enum(['PKR', 'USD'])
      .optional(),

    couponCode: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .transform((value) =>
        value.toUpperCase(),
      )
      .optional(),

    customerNotes: z
      .string()
      .trim()
      .max(2000)
      .optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const seen = new Set();

    body.items.forEach(
      (item, index) => {
        const key =
          item.sku.toLowerCase();

        if (seen.has(key)) {
          ctx.addIssue({
            code: 'custom',

            path: [
              'items',
              index,
              'sku',
            ],

            message:
              'Each SKU may appear only once',
          });
        }

        seen.add(key);
      },
    );
  });

/*
|--------------------------------------------------------------------------
| Order ID Params
|--------------------------------------------------------------------------
|
| Used by:
|
| GET    /orders/:id
| GET    /admin/orders/:id
| PATCH  /admin/orders/:id/status
| PATCH  /admin/orders/:id/shipment
| PATCH  /admin/orders/:id/notes
|--------------------------------------------------------------------------
*/

exports.orderIdParams = z
  .object({
    id: objectId,
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Customer - My Orders Query
|--------------------------------------------------------------------------
*/

exports.myOrdersQuery = z
  .object({
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

    status:
      orderStatus.optional(),

    type:
      orderType.optional(),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Guest Tracking
|--------------------------------------------------------------------------
|
| V1 verification:
|
| orderNumber + email
| OR
| orderNumber + phone
|
| We deliberately do not allow
| orderNumber-only tracking.
|--------------------------------------------------------------------------
*/

exports.trackGuestOrderBody = z
  .object({
    orderNumber: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .transform((value) =>
        value.toUpperCase(),
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
  .superRefine((body, ctx) => {
    if (
      !body.email &&
      !body.phone
    ) {
      ctx.addIssue({
        code: 'custom',

        path: ['email'],

        message:
          'Email or phone is required to verify the order',
      });
    }
  });

/*
|--------------------------------------------------------------------------
| Admin - Orders List Query
|--------------------------------------------------------------------------
|
| Filters:
|
| search
| status
| paymentStatus
| type
| from
| to
| page
| limit
|--------------------------------------------------------------------------
*/

exports.adminOrdersQuery = z
  .object({
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

    search: z
      .string()
      .trim()
      .max(160)
      .optional(),

    status:
      orderStatus.optional(),

    paymentStatus:
      paymentStatus.optional(),

    type:
      orderType.optional(),

    from: z.coerce
      .date()
      .optional(),

    to: z.coerce
      .date()
      .optional(),
  })
  .strict()
  .superRefine((query, ctx) => {
    if (
      query.from &&
      query.to &&
      query.from > query.to
    ) {
      ctx.addIssue({
        code: 'custom',

        path: ['to'],

        message:
          '"to" date must be after or equal to "from" date',
      });
    }
  });

/*
|--------------------------------------------------------------------------
| Admin - Update Order Status
|--------------------------------------------------------------------------
|
| Validator only checks whether
| the requested status exists.
|
| Service owns transition rules:
|
| pending
|   -> confirmed
|   -> cancelled
|
| confirmed
|   -> processing
|   -> cancelled
|
| processing
|   -> shipped
|
| shipped
|   -> delivered
|--------------------------------------------------------------------------
*/

exports.updateOrderStatusBody = z
  .object({
    status: orderStatus,

    note: z
      .string()
      .trim()
      .max(1000)
      .optional(),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Admin - Shipment Update
|--------------------------------------------------------------------------
|
| Shipment can be prepared before
| moving the Order into "shipped".
|--------------------------------------------------------------------------
*/

exports.updateShipmentBody = z
  .object({
    courierName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional(),

    trackingNumber: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional(),

    trackingUrl: httpUrl(500).optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.courierName !==
        undefined ||
      body.trackingNumber !==
        undefined ||
      body.trackingUrl !==
        undefined,
    {
      message:
        'At least one shipment field is required',
    },
  );

/*
|--------------------------------------------------------------------------
| Admin - Notes
|--------------------------------------------------------------------------
*/

exports.updateAdminNotesBody = z
  .object({
    adminNotes: z
      .string()
      .trim()
      .max(5000),
  })
  .strict();

/*
|--------------------------------------------------------------------------
| Optional Reusable Schemas
|--------------------------------------------------------------------------
*/

exports.schemas = {
  objectId,
  checkoutItem,
  customer,
  shippingAddress,
  orderStatus,
  orderType,
  paymentStatus,
  paymentMethod,
};