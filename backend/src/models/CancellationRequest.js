'use strict';

const mongoose = require('mongoose');

const cancellationRequestSchema =
  new mongoose.Schema(
    {
      order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
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

      reason: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500,
      },

      status: {
        type: String,
        enum: [
          'pending',
          'approved',
          'rejected',
        ],
        default: 'pending',
      },

      adminNote: {
        type: String,
        trim: true,
        maxlength: 1000,
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
    },
    {
      timestamps: true,
    },
  );

/**
 * Only one active (pending) cancellation request per order.
 *
 * The explicit name matters: without it MongoDB would call this index
 * "order_1", the same name a plain { order: 1 } index would get.
 */
cancellationRequestSchema.index(
  { order: 1 },
  {
    name: 'unique_pending_cancellation_per_order',
    unique: true,
    partialFilterExpression: {
      status: 'pending',
    },
  },
);

/**
 * Cancellation history of one order.
 */
cancellationRequestSchema.index(
  { order: 1, createdAt: -1 },
  { name: 'order_createdAt' },
);

/**
 * Admin list: filter by status, newest first.
 * Also serves plain status filters (status is the prefix).
 */
cancellationRequestSchema.index(
  { status: 1, createdAt: -1 },
  { name: 'status_createdAt' },
);

module.exports =
  mongoose.models.CancellationRequest ||
  mongoose.model(
    'CancellationRequest',
    cancellationRequestSchema,
  );
