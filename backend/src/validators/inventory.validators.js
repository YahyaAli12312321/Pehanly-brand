'use strict';

const { z } = require('zod');

/*
|--------------------------------------------------------------------------
| Common
|--------------------------------------------------------------------------
*/

const objectId = z
  .string()
  .regex(
    /^[a-f\d]{24}$/i,
    'Invalid id',
  );

/*
|--------------------------------------------------------------------------
| Inventory List
|--------------------------------------------------------------------------
|
| UI filters:
|
| all      -> all inventory
| out      -> out of stock
| critical -> available stock below 5
| low      -> SKU threshold based low stock
|
|--------------------------------------------------------------------------
*/

exports.listQuery = z.object({
  search: z
    .string()
    .trim()
    .max(100)
    .optional(),

  filter: z
    .enum([
      'all',
      'out',
      'critical',
      'low',
    ])
    .default('all'),

  category:
    objectId.optional(),

  product:
    objectId.optional(),

  sortBy: z
    .enum([
      'sku',
      'available',
      'stock',
      'reservedStock',
      'updatedAt',
    ])
    .default('sku'),

  sortDir: z
    .enum([
      'asc',
      'desc',
    ])
    .default('asc'),

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
});

/*
|--------------------------------------------------------------------------
| SKU Params
|--------------------------------------------------------------------------
*/

exports.skuParams = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9][A-Z0-9._-]{1,39}$/,
      'Invalid SKU',
    ),
});

/*
|--------------------------------------------------------------------------
| Inventory History
|--------------------------------------------------------------------------
*/

exports.historyQuery = z.object({
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
});

/*
|--------------------------------------------------------------------------
| Adjustment Reasons
|--------------------------------------------------------------------------
|
| These values map directly to the
| Inventory adjustment UI.
|
|--------------------------------------------------------------------------
*/

const adjustmentReason = z.enum([
  'factory_inward_batch_received',
  'physical_cycle_count_discrepancy',
  'fabric_qc_defect_damaged_return',
  'sample_pull_institutional_client',
  'direct_sales_counter_allocation',
]);

/*
|--------------------------------------------------------------------------
| Adjust Stock
|--------------------------------------------------------------------------
|
| stock_in:
|   Used for warehouse/factory inward stock.
|   Can only ADD.
|
| manual_adjustment:
|   Used for reconciliation.
|   Can ADD or REMOVE.
|
|--------------------------------------------------------------------------
*/

exports.adjustBody = z
  .object({
    mode: z
      .enum([
        'stock_in',
        'manual_adjustment',
      ])
      .optional(),

    direction: z.enum([
      'add',
      'remove',
    ]),

    quantity: z
      .number()
      .int()
      .min(1)
      .max(10_000_000),

    reason:
      adjustmentReason,

    notes: z
      .string()
      .trim()
      .max(1000)
      .optional(),

    reference: z
      .string()
      .trim()
      .max(100)
      .optional(),
  })
  .strict()
  .superRefine(
    (body, ctx) => {
      /*
       * Stock In can never deduct.
       */
      if (
        body.mode ===
          'stock_in' &&
        body.direction ===
          'remove'
      ) {
        ctx.addIssue({
          code: 'custom',

          path: [
            'direction',
          ],

          message:
            'Stock in can only add stock',
        });
      }

      /*
       * Factory inward is naturally
       * a stock-in operation.
       */
      if (
        body.reason ===
          'factory_inward_batch_received' &&
        body.direction !==
          'add'
      ) {
        ctx.addIssue({
          code: 'custom',

          path: [
            'direction',
          ],

          message:
            'Factory inward stock can only be added',
        });
      }
    },
  );