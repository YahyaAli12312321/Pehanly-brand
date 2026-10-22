'use strict';
const mongoose = require('mongoose');
const { ROLES, PERMISSIONS } = require('../constants/Permissions');

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 40 },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true },
    addressLine1: { type: String, required: true, trim: true, maxlength: 200 },
    addressLine2: { type: String, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    province: { type: String, trim: true, maxlength: 80 },
    postalCode: { type: String, trim: true, maxlength: 20 },
    country: { type: String, trim: true, default: 'Pakistan', maxlength: 80 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.CUSTOMER, index: true },
    // Only meaningful for role "staff". Admins implicitly hold every permission.
    permissions: { type: [{ type: String, enum: PERMISSIONS }], default: [] },
    // Customer-facing fields written at registration and read by customer management.
    customerNumber: { type: String, trim: true, uppercase: true },
    accountTier: { type: String, enum: ['retail', 'wholesale', 'vip'], default: 'retail', index: true },
    avatar: { url: String, publicId: String, alt: String },
    addresses: { type: [addressSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    // Incremented on password reset so older sessions stop working.
    tokenVersion: { type: Number, default: 0, select: false },
    passwordResetToken: { type: String, select: false }, // sha256 hash of the emailed token
    passwordResetExpires: { type: Date, select: false },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.index(
  { customerNumber: 1 },
  {
    name: 'unique_customer_number',
    unique: true,
    partialFilterExpression: { customerNumber: { $type: 'string' } },
  },
);

// At most ONE admin in the whole database, enforced by MongoDB itself (race-safe, unlike a pre-check).
// Partial: only documents with role "admin" are indexed, so customers and staff are never limited.
// autoIndex is off in production: build it with `npm run ensure-admin-index` (checks existing admins first).
userSchema.index(
  { role: 1 },
  {
    name: 'unique_single_admin',
    unique: true,
    partialFilterExpression: { role: 'admin' },
  },
);

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.passwordResetToken;
    delete ret.passwordResetExpires;
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
