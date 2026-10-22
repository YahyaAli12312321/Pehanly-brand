'use strict';
const mongoose = require('mongoose');

const media = new mongoose.Schema({ url: String, publicId: String, alt: String, type: { type: String, default: 'image' }, sortOrder: { type: Number, default: 0 } }, { _id: false });

// NOTE: no authoritative price or stock here. Both live on Sku documents.
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    shortDescription: { type: String, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 10000 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    generalImages: { type: [media], default: [] },
    status: { type: String, enum: ['draft', 'active', 'inactive'], default: 'draft', index: true },
    isFeatured: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    wholesale: {
      isEnabled: { type: Boolean, default: false },
      moq: { type: Number, min: 1 }, // total quantity across mixed colors/sizes
      // Volume tiers: once the combined product quantity reaches minQuantity, discountPercent is
      // taken off each SKU's wholesalePrice, OR unitPrice (flat per-piece) replaces it, OR quoteOnly marks quantities that need a custom quote. Merchant-configured; none = no volume discount.
      tiers: {
        type: [new mongoose.Schema({ minQuantity: { type: Number, required: true, min: 2, validate: Number.isInteger }, discountPercent: { type: Number, min: 0.01, max: 90 }, unitPrice: { type: Number, min: 0.01 }, quoteOnly: { type: Boolean, default: undefined } }, { _id: false })],
        default: [],
      },
    },
    seo: {
      title: { type: String, trim: true, maxlength: 120 },
      description: { type: String, trim: true, maxlength: 320 },
      socialImage: { type: media, default: undefined },
      canonicalUrl: { type: String, trim: true, maxlength: 300 },
      index: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

productSchema.index({ createdAt: -1 });
productSchema.index({ status: 1, isFeatured: 1 });

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
