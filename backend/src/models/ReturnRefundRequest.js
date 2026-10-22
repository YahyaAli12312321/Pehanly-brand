'use strict';

const mongoose = require('mongoose');

const {
  RETURN_STATUSES,
  RETURN_ITEM_CONDITIONS,
  REFUND_STATUSES,
  REFUND_TYPES,
} = require('../constants/ReturnRefund');

const mediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    publicId: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    alt: {
      type: String,
      trim: true,
      maxlength: 160,
    },
  },
  { _id: false },
);

const returnItemSchema = new mongoose.Schema(
  {
    // _id of the embedded item inside Order.items
    orderItem: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },

    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductVariant',
      default: null,
    },

    sku: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sku',
      default: null,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    colorName: {
      type: String,
      trim: true,
      maxlength: 60,
    },

    size: {
      type: String,
      trim: true,
      maxlength: 40,
    },

    skuCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Return quantity must be an integer',
      },
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    lineAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    condition: {
      type: String,
      enum: Object.values(RETURN_ITEM_CONDITIONS),
      default: RETURN_ITEM_CONDITIONS.PENDING_INSPECTION,
    },

    restockedQuantity: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Restocked quantity must be an integer',
      },
    },
  },
  { _id: true },
);

const refundSchema = new mongoose.Schema(
  {
    required: {
      type: Boolean,
      default: false,
    },

    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },

    type: {
      type: String,
      enum: Object.values(REFUND_TYPES),
    },

    amount: {
      type: Number,
      min: 0,
      default: 0,
    },

    status: {
      type: String,
      enum: Object.values(REFUND_STATUSES),
      default: REFUND_STATUSES.NOT_REQUIRED,
    },

    providerRefundId: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    providerReference: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    failureCode: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    failureMessage: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const returnRefundRequestSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    requestedBy: {
      type: String,
      enum: ['customer', 'admin'],
      required: true,
    },

    items: {
      type: [returnItemSchema],
      required: true,
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: 'Return request must contain at least one item',
      },
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    images: {
      type: [mediaSchema],
      default: [],
    },

    customerNote: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    adminNote: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    returnStatus: {
      type: String,
      enum: Object.values(RETURN_STATUSES),
      default: RETURN_STATUSES.PENDING,
      required: true,
      index: true,
    },

    refund: {
      type: refundSchema,
      default: () => ({
        required: false,
        amount: 0,
        status: REFUND_STATUSES.NOT_REQUIRED,
      }),
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    receivedAt: {
      type: Date,
      default: null,
    },

    inspectedAt: {
      type: Date,
      default: null,
    },

    restockedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Common admin/customer queries
returnRefundRequestSchema.index({
  order: 1,
  createdAt: -1,
});

returnRefundRequestSchema.index({
  user: 1,
  createdAt: -1,
});

returnRefundRequestSchema.index({
  returnStatus: 1,
  createdAt: -1,
});

returnRefundRequestSchema.index({
  'refund.status': 1,
  createdAt: -1,
});

returnRefundRequestSchema.index({
  'refund.payment': 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  'ReturnRefundRequest',
  returnRefundRequestSchema,
);