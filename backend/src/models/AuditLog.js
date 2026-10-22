'use strict';
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

schema.index({ entityType: 1, entityId: 1, createdAt: -1 });
schema.index({ createdAt: -1 });
schema.index({ admin: 1, createdAt: -1 });
schema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', schema);
