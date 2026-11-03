'use strict';

const mongoose = require('mongoose');

const {
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_ENTITY_TYPES,
} = require('../constants/Notification');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    priority: {
      type: String,
      enum: Object.values(NOTIFICATION_PRIORITIES),
      default: NOTIFICATION_PRIORITIES.NORMAL,
      index: true,
    },

    entityType: {
      type: String,
      enum: Object.values(NOTIFICATION_ENTITY_TYPES),
      default: null,
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    /*
     * Safe navigation / UI metadata only.
     *
     * Never place passwords, payment secrets,
     * card data or sensitive provider payloads here.
     */
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    /*
     * Frontend navigation target.
     *
     * Example:
     * /orders/123
     * /quotes/456
     */
    actionUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },

    /*
     * FCM delivery information.
     *
     * Notification remains useful in the dashboard
     * even if push delivery fails.
     */
    push: {
      attempted: {
        type: Boolean,
        default: false,
      },

      sent: {
        type: Boolean,
        default: false,
      },

      sentAt: {
        type: Date,
        default: null,
      },

      successCount: {
        type: Number,
        default: 0,
        min: 0,
      },

      failureCount: {
        type: Number,
        default: 0,
        min: 0,
      },

      lastError: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: null,
      },
    },

    /*
     * Used for event-level duplicate protection.
     *
     * Examples:
     *
     * new_order:<orderId>
     * low_stock:<skuId>:<stateVersion>
     * quote_accepted:<quoteId>
     */
    dedupeKey: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

/*
|--------------------------------------------------------------------------
| Notification Bell
|--------------------------------------------------------------------------
*/

notificationSchema.index({
  recipient: 1,
  isRead: 1,
  createdAt: -1,
});

notificationSchema.index({
  recipient: 1,
  createdAt: -1,
});

/*
|--------------------------------------------------------------------------
| Entity History
|--------------------------------------------------------------------------
*/

notificationSchema.index({
  entityType: 1,
  entityId: 1,
  createdAt: -1,
});

/*
|--------------------------------------------------------------------------
| Per-admin Event Deduplication
|--------------------------------------------------------------------------
|
| Same event cannot create duplicate notification for same admin.
|
| sparse is important because not every notification needs a dedupe key.
|--------------------------------------------------------------------------
*/
notificationSchema.index(
  {
    recipient: 1,
    dedupeKey: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      dedupeKey: {
        $type: 'string',
      },
    },
  },
);

/*
 * Retention: notifications are a convenience feed, not a ledger. MongoDB
 * removes them 90 days after creation (TTL index, runs about once a minute).
 */
notificationSchema.index(
  { createdAt: 1 },
  {
    name: 'notification_retention_ttl',
    expireAfterSeconds: 90 * 24 * 60 * 60,
  },
);

module.exports = mongoose.models.Notification || mongoose.model(
  'Notification',
  notificationSchema,
);