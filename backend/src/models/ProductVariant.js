'use strict';
const mongoose = require('mongoose');

const image = new mongoose.Schema({ url: { type: String, required: true }, publicId: String, alt: String, sortOrder: { type: Number, default: 0 } }, { _id: false });

// Color-level record. Sizes/SKUs (price + stock) are Sku documents referencing this variant.
const variantSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    color: {
      name: { type: String, required: true, trim: true, maxlength: 60 },
      hexCode: { type: String, trim: true, match: /^#[0-9a-fA-F]{6}$/ },
    },
    variantCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    images: { type: [image], default: [] },
    isEnabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

variantSchema.index({ product: 1, variantCode: 1 }, { unique: true });

module.exports = mongoose.models.ProductVariant || mongoose.model('ProductVariant', variantSchema);
