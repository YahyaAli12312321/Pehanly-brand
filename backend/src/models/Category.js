'use strict';
const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({ url: String, publicId: String, alt: String }, { _id: false });

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 1000 },
    image: { type: mediaSchema, default: undefined },
    parentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    // Free-form on purpose (men, women, kids, couples, unisex, ...). Not an enum.
    audience: { type: String, trim: true, lowercase: true, maxlength: 40, index: true },
    isActive: { type: Boolean, default: true, index: true },
    showOnHome: { type: Boolean, default: false },
    // Retail-only (e.g. Ladies Shoes): products here can never be wholesale-enabled. Inherited by sub-categories.
    retailOnly: { type: Boolean, default: false },
    /*
     * Dedicated section (e.g. Under Garments): its products live behind their own storefront page. The category, all of its
     * sub-categories and all of their products are left out of the general Shop catalog (listing, search, category list,
     * filters) and are only returned when the section is requested explicitly. Set on a top-level category; children inherit.
     */
    dedicatedSection: { type: Boolean, default: false, index: true },
    sortOrder: { type: Number, default: 0 },
    seo: {
      title: { type: String, trim: true, maxlength: 120 },
      description: { type: String, trim: true, maxlength: 320 },
      socialImage: { type: mediaSchema, default: undefined },
      canonicalUrl: { type: String, trim: true, maxlength: 300 },
      index: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

categorySchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);
