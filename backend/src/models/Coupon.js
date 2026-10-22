'use strict';

const mongoose = require('mongoose');

const {
  COUPON_DISCOUNT_TYPES,
} = require('../constants/Coupon');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 60,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    discountType: {
      type: String,
      enum: COUPON_DISCOUNT_TYPES,
      required: true,
    },

    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },

    minimumOrderAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /*
     * USD terms (optional, merchant-entered; never converted from PKR).
     * A coupon is usable on a USD order only when it carries the USD terms it
     * needs: a fixed coupon needs discountValueUSD; a coupon with a PKR minimum
     * needs minimumOrderAmountUSD; one with a PKR cap needs maximumDiscountAmountUSD.
     */
    discountValueUSD: {
      type: Number,
      min: 0,
    },

    minimumOrderAmountUSD: {
      type: Number,
      min: 0,
    },

    maximumDiscountAmountUSD: {
      type: Number,
      min: 0,
    },

    maximumDiscountAmount: {
      type: Number,
      default: null,
      min: 0,
    },

    startsAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    /*
     * null = unlimited globally
     */
    usageLimit: {
      type: Number,
      default: null,
      min: 1,
    },

    /*
     * null = unlimited per customer
     */
    usageLimitPerCustomer: {
      type: Number,
      default: 1,
      min: 1,
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

couponSchema.index({
  isActive: 1,
  startsAt: 1,
  expiresAt: 1,
});

module.exports =
  mongoose.models.Coupon ||
  mongoose.model('Coupon', couponSchema);