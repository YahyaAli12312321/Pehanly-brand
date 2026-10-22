'use strict';

const mongoose = require('mongoose');

const {
  CURRENCIES,
  DEFAULT_CURRENCY,
} = require('../constants/Currency');

const {
  SHIPPING_RULE_TYPES,
} = require('../constants/ShippingRule');

const cityRateSchema = new mongoose.Schema(
  {
    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    rate: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: true,
  },
);

const shippingRuleSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },

      type: {
        type: String,
        enum: SHIPPING_RULE_TYPES,
        required: true,
        index: true,
      },

      /*
       * Flat shipping rate.
       *
       * Used only when:
       * type = flat
       */
      flatRate: {
        type: Number,
        min: 0,
        default: null,
      },

      /*
       * City-specific shipping rates.
       *
       * Used only when:
       * type = city_based
       */
      cityRates: {
        type: [cityRateSchema],
        default: [],
      },

      /*
       * Minimum subtotal required
       * for free shipping.
       *
       * Used only when:
       * type = free_shipping
       */
      minimumOrderAmount: {
        type: Number,
        min: 0,
        default: null,
      },

      /*
       * Country scope.
       *
       * V1 is primarily Pakistan,
       * but keeping country here avoids
       * hardcoding it in calculation logic.
       */
      country: {
        type: String,
        trim: true,
        maxlength: 80,
        default: 'Pakistan',
        index: true,
      },

      /*
       * Currency every amount on this rule is expressed in (flatRate,
       * cityRates[].rate, minimumOrderAmount). Rules created before
       * multi-currency have no value stored and are PKR. A rule only ever
       * applies to orders in its own currency: amounts are never converted.
       */
      currency: {
        type: String,
        enum: CURRENCIES,
        default: DEFAULT_CURRENCY,
      },

      isActive: {
        type: Boolean,
        default: true,
        index: true,
      },

      /*
       * Lower number = higher priority
       * inside the same rule type.
       */
      priority: {
        type: Number,
        default: 100,
        min: 0,
      },
    },
    {
      timestamps: true,
    },
  );

shippingRuleSchema.index({
  isActive: 1,
  country: 1,
  type: 1,
  priority: 1,
});

module.exports =
  mongoose.models.ShippingRule ||
  mongoose.model(
    'ShippingRule',
    shippingRuleSchema,
  );