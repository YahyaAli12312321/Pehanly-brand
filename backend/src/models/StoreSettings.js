'use strict';

const mongoose = require('mongoose');

/*
 * Single-document store configuration (key "store").
 *
 * Deliberately NOT stored here:
 *   - shipping prices        -> ShippingRule is the source of truth
 *   - payment gateway secrets -> environment variables only
 *   - staff / team data      -> User (role + permissions)
 */
const storeSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, default: 'store', immutable: true },

    storeName: { type: String, trim: true, maxlength: 120, default: 'PEHAN LY' },
    tagline: { type: String, trim: true, maxlength: 200, default: 'Wear Your Identity' },
    currency: { type: String, enum: ['PKR'], default: 'PKR' },

    contact: {
      email: { type: String, trim: true, lowercase: true, maxlength: 160 },
      phone: { type: String, trim: true, maxlength: 30 },
      whatsapp: { type: String, trim: true, maxlength: 30 },
      address: { type: String, trim: true, maxlength: 300 },
    },

    social: {
      facebook: { type: String, trim: true, maxlength: 300 },
      instagram: { type: String, trim: true, maxlength: 300 },
      tiktok: { type: String, trim: true, maxlength: 300 },
      youtube: { type: String, trim: true, maxlength: 300 },
    },

    // Wholesale commercial charges (merchant-configured). Absent = "quoted by the team", never guessed.
    wholesale: {
      freightFlat: { type: Number, min: 0 },
      taxPercent: { type: Number, min: 0, max: 100 },
    },

    checkout: {
      guestCheckoutEnabled: { type: Boolean, default: true },
      codEnabled: { type: Boolean, default: true },
      // Only takes effect once JazzCash credentials are configured AND verified live.
      jazzcashEnabled: { type: Boolean, default: false },
      // Temporary manual JazzCash wallet payment. Customer-facing, NON-secret details only
      // (never merchant ids, salts or API credentials: those stay in environment variables).
      jazzcashManual: {
        enabled: { type: Boolean, default: false },
        accountTitle: { type: String, trim: true, maxlength: 120 },
        walletNumber: { type: String, trim: true, maxlength: 30 },
        instructions: { type: String, trim: true, maxlength: 600 },
      },
    },

    returns: {
      enabled: { type: Boolean, default: true },
      windowDays: { type: Number, min: 0, max: 365, default: 7, validate: Number.isInteger },
    },

    announcement: {
      enabled: { type: Boolean, default: false },
      text: { type: String, trim: true, maxlength: 240 },
      link: { type: String, trim: true, maxlength: 300 },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

storeSettingsSchema.index({ key: 1 }, { name: 'unique_store_settings_key', unique: true });

module.exports =
  mongoose.models.StoreSettings || mongoose.model('StoreSettings', storeSettingsSchema);
