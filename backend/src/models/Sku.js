'use strict';
const mongoose = require('mongoose');

/**
 * One sellable size of a color variant. Stored as its own document so every stock change is a
 * single-document conditional $inc (atomic in MongoDB) and `sku` has a true global unique index.
 *   available = stock - reservedStock   (maintained by the same $inc operations)
 */
const skuSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    variant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true, index: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
    size: { type: String, required: true, trim: true, maxlength: 20 }, // free-form: S, M, XL, 38, ...
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    // Merchant-entered USD selling price (NOT an FX conversion). Absent = not sold in USD.
    priceUSD: { type: Number, min: 0 },
    compareAtPriceUSD: { type: Number, min: 0 },
    wholesalePrice: { type: Number, min: 0 },
    stock: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    reservedStock: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    available: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    lowStockThreshold: { type: Number, min: 0 },
    stockStatus: { type: String, enum: ['ok', 'low', 'out'], default: 'out', index: true },
    isEnabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

skuSchema.index({ variant: 1, size: 1 }, { unique: true });

module.exports = mongoose.models.Sku || mongoose.model('Sku', skuSchema);
