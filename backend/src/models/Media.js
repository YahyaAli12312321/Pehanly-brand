'use strict';

const mongoose = require('mongoose');

/*
 * Metadata for every file stored in Cloudinary. Other documents (products,
 * banners, orders, ...) keep their own { url, publicId, alt } snapshot; this
 * collection is the registry used for ownership, reference-safe deletion and
 * orphan cleanup.
 */
const mediaSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, trim: true, maxlength: 250 },
    resourceType: { type: String, enum: ['image', 'raw'], required: true },
    url: { type: String, required: true, trim: true, maxlength: 600 },
    purpose: { type: String, required: true, trim: true, maxlength: 60 },
    folder: { type: String, required: true, trim: true, maxlength: 200 },
    format: { type: String, trim: true, maxlength: 20 },
    mimeType: { type: String, trim: true, maxlength: 80 },
    bytes: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    originalName: { type: String, trim: true, maxlength: 120 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedByRole: { type: String, enum: ['customer', 'staff', 'admin'], required: true },
  },
  { timestamps: true },
);

mediaSchema.index({ publicId: 1 }, { name: 'unique_media_public_id', unique: true });
mediaSchema.index({ uploadedBy: 1, createdAt: -1 });
mediaSchema.index({ purpose: 1, createdAt: -1 });
mediaSchema.index({ createdAt: 1 });

module.exports = mongoose.models.Media || mongoose.model('Media', mediaSchema);
