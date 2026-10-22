'use strict';

const mongoose = require('mongoose');

const {
  REVIEW_STATUSES,
} = require('../constants/Review');

/*
|--------------------------------------------------------------------------
| Customer Snapshot
|--------------------------------------------------------------------------
|
| User later apna name change kare tab bhi historical review ka original
| display name preserve rahe.
|--------------------------------------------------------------------------
*/

const customerSnapshotSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },
    },
    {
      _id: false,
    },
  );

/*
|--------------------------------------------------------------------------
| Official Brand Reply
|--------------------------------------------------------------------------
*/

const brandReplySchema =
  new mongoose.Schema(
    {
      message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 3000,
      },

      repliedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },

      repliedAt: {
        type: Date,
        required: true,
        default: Date.now,
      },
    },
    {
      _id: false,
    },
  );

/*
|--------------------------------------------------------------------------
| Review
|--------------------------------------------------------------------------
*/

const reviewSchema =
  new mongoose.Schema(
    {
      /*
      |--------------------------------------------------------------------------
      | Relations
      |--------------------------------------------------------------------------
      */

      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
      },

      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true,
      },

      /*
      |--------------------------------------------------------------------------
      | Verified Purchase Order
      |--------------------------------------------------------------------------
      |
      | This is the delivered order that made the customer eligible to review.
      |--------------------------------------------------------------------------
      */

      order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true,
      },

      customer: {
        type: customerSnapshotSchema,
        required: true,
      },

      /*
      |--------------------------------------------------------------------------
      | Review Content
      |--------------------------------------------------------------------------
      */

      rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,

        validate: {
          validator:
            Number.isInteger,

          message:
            'Rating must be an integer between 1 and 5',
        },
      },

      title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },

      comment: {
        type: String,
        required: true,
        trim: true,
        maxlength: 3000,
      },

      /*
      |--------------------------------------------------------------------------
      | Purchase Verification
      |--------------------------------------------------------------------------
      */

      verifiedPurchase: {
        type: Boolean,
        default: true,
        immutable: true,
      },

      /*
      |--------------------------------------------------------------------------
      | Moderation
      |--------------------------------------------------------------------------
      */

      status: {
        type: String,
        enum: Object.values(
          REVIEW_STATUSES,
        ),
        default:
          REVIEW_STATUSES.PENDING,
        required: true,
        index: true,
      },

      moderatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },

      moderatedAt: {
        type: Date,
        default: null,
      },

      rejectionReason: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: null,
      },

      /*
      |--------------------------------------------------------------------------
      | Official PEHAN LY Reply
      |--------------------------------------------------------------------------
      */

      brandReply: {
        type: brandReplySchema,
        default: undefined,
      },
    },
    {
      timestamps: true,
    },
  );

/*
|--------------------------------------------------------------------------
| One Review Per Customer Per Product
|--------------------------------------------------------------------------
|
| DB-level protection against duplicate/concurrent submissions.
|--------------------------------------------------------------------------
*/

reviewSchema.index(
  {
    user: 1,
    product: 1,
  },
  {
    unique: true,
  },
);

/*
|--------------------------------------------------------------------------
| Public Product Reviews
|--------------------------------------------------------------------------
*/

reviewSchema.index({
  product: 1,
  status: 1,
  createdAt: -1,
});

/*
|--------------------------------------------------------------------------
| Admin Moderation
|--------------------------------------------------------------------------
*/

reviewSchema.index({
  status: 1,
  createdAt: -1,
});

/*
|--------------------------------------------------------------------------
| Customer History
|--------------------------------------------------------------------------
*/

reviewSchema.index({
  user: 1,
  createdAt: -1,
});

module.exports =
  mongoose.models.Review ||
  mongoose.model(
    'Review',
    reviewSchema,
  );