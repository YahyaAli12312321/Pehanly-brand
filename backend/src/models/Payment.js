'use strict';

const mongoose =
  require('mongoose');

const {
  PAYMENT_GATEWAYS,
  PAYMENT_STATUSES,
  PAYMENT_CURRENCIES,
} = require('../constants/Payment');

/*
|--------------------------------------------------------------------------
| Provider Response Snapshot
|--------------------------------------------------------------------------
|
| Only safe provider metadata should be stored here.
|
| Never store:
| - card number
| - CVV
| - PIN
| - passwords
| - secrets
|--------------------------------------------------------------------------
*/

const providerResponseSchema =
  new mongoose.Schema(
    {
      responseCode: {
        type: String,
        trim: true,
        maxlength: 100,
      },

      responseMessage: {
        type: String,
        trim: true,
        maxlength: 500,
      },

      reference: {
        type: String,
        trim: true,
        maxlength: 200,
      },
    },
    {
      _id: false,
    },
  );

/*
|--------------------------------------------------------------------------
| Payment
|--------------------------------------------------------------------------
*/

const paymentSchema =
  new mongoose.Schema(
    {
      /*
      |--------------------------------------------------------------------------
      | Internal Payment Reference
      |--------------------------------------------------------------------------
      */

      paymentNumber: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        uppercase: true,
        trim: true,
        maxlength: 40,
      },

      /*
      |--------------------------------------------------------------------------
      | Order
      |--------------------------------------------------------------------------
      */

      order: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: 'Order',

        required: true,

        immutable: true,

        index: true,
      },

      /*
      |--------------------------------------------------------------------------
      | Customer
      |--------------------------------------------------------------------------
      |
      | null is allowed because guest checkout is supported.
      |--------------------------------------------------------------------------
      */

      user: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: 'User',

        default: null,

        immutable: true,

        index: true,
      },

      /*
      |--------------------------------------------------------------------------
      | Gateway
      |--------------------------------------------------------------------------
      */

      gateway: {
        type: String,

        enum: PAYMENT_GATEWAYS,

        required: true,

        immutable: true,

        index: true,
      },

      /*
      |--------------------------------------------------------------------------
      | Gateway Transaction Reference
      |--------------------------------------------------------------------------
      |
      | JazzCash transaction/reference can be stored here.
      | COD normally keeps this null.
      |--------------------------------------------------------------------------
      */

      transactionId: {
        type: String,
        trim: true,
        maxlength: 200,
        default: null,
      },

      /*
      |--------------------------------------------------------------------------
      | Money
      |--------------------------------------------------------------------------
      */

      amount: {
        type: Number,
        required: true,
        min: 0,
        immutable: true,
      },

      gatewayFee: {
        type: Number,
        min: 0,
        default: 0,
      },

      netAmount: {
        type: Number,
        required: true,
        min: 0,
      },

      currency: {
        type: String,
        enum: PAYMENT_CURRENCIES,
        default: 'PKR',
        required: true,
        immutable: true,
      },

      /*
      |--------------------------------------------------------------------------
      | Payment Status
      |--------------------------------------------------------------------------
      */

      status: {
        type: String,

        enum: PAYMENT_STATUSES,

        default: 'pending',

        required: true,

        index: true,
      },

      /*
      |--------------------------------------------------------------------------
      | Gateway Response
      |--------------------------------------------------------------------------
      */

      providerResponse: {
        type: providerResponseSchema,
        default: undefined,
      },

      failureReason: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: null,
      },

      /*
      |--------------------------------------------------------------------------
      | Important Timestamps
      |--------------------------------------------------------------------------
      */

      // Admin who manually confirmed a COD payment (audit trail).
      confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },

      paidAt: {
        type: Date,
        default: null,
      },

      failedAt: {
        type: Date,
        default: null,
      },

      cancelledAt: {
        type: Date,
        default: null,
      },

      refundedAt: {
        type: Date,
        default: null,
      },
    },
    {
      timestamps: true,
    },
  );

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

/*
 * Payment history for an Order.
 */
paymentSchema.index({
  order: 1,
  createdAt: -1,
});

/*
 * Admin payment ledger.
 */
paymentSchema.index({
  status: 1,
  createdAt: -1,
});

paymentSchema.index({
  gateway: 1,
  createdAt: -1,
});

/*
 * Dashboard/filter combinations.
 */
paymentSchema.index({
  gateway: 1,
  status: 1,
  createdAt: -1,
});

/*
 * Gateway transaction ID should not be duplicated.
 *
 * Partial index allows multiple COD payments where
 * transactionId is null.
 */
paymentSchema.index(
  {
    transactionId: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      transactionId: {
        $type: 'string',
      },
    },
  },
);

/*
|--------------------------------------------------------------------------
| Validation
|--------------------------------------------------------------------------
*/

paymentSchema.pre(
  'validate',
  function validatePayment() {
    if (
      Number.isFinite(this.amount) &&
      Number.isFinite(this.gatewayFee)
    ) {
      this.netAmount =
        Math.max(
          0,
          Math.round(
            (
              this.amount -
              this.gatewayFee +
              Number.EPSILON
            ) * 100,
          ) / 100,
        );
    }

    if (
      this.gateway === 'cod' &&
      this.transactionId
    ) {
      this.transactionId = null;
    }
  },
);

/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports =
  mongoose.model(
    'Payment',
    paymentSchema,
  );