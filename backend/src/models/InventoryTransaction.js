'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', required: true },
    sku: { type: String, required: true, index: true },
    type: { type: String, enum: ['stock_in', 'sale', 'cancellation', 'return', 'manual_adjustment'], required: true },
    quantity: { type: Number, required: true }, // signed change to physical stock
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    reason: { type: String, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 1000 },
    reference: { type: String, trim: true, maxlength: 100 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.index({ sku: 1, createdAt: -1 });

module.exports = mongoose.models.InventoryTransaction || mongoose.model('InventoryTransaction', schema);
