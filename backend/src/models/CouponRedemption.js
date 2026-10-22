'use strict';

const mongoose = require('mongoose');

const couponRedemptionSchema = new mongoose.Schema(
  {
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

couponRedemptionSchema.index(
  {
    coupon: 1,
    user: 1,
  },
  {
    unique: true,
  },
);

module.exports =
  mongoose.models.CouponRedemption ||
  mongoose.model(
    'CouponRedemption',
    couponRedemptionSchema,
  );