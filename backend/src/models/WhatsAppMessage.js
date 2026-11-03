'use strict';

const mongoose = require('mongoose');
const { WHATSAPP_STATUSES, WHATSAPP_EVENTS, WHATSAPP_AUDIENCES } = require('../constants/WhatsApp');

/*
 * One row per WhatsApp message the system decided to send (or deliberately skipped). Separate from the in-app / push
 * `Notification` model, whose recipient is always an admin user and whose lifecycle is read/unread.
 * Never stores credentials; `variables` holds only the template values that were rendered into the message.
 */
const whatsAppMessageSchema = new mongoose.Schema(
  {
    event: { type: String, enum: Object.values(WHATSAPP_EVENTS), required: true, index: true },
    recipientType: { type: String, enum: Object.values(WHATSAPP_AUDIENCES), required: true, index: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    recipientName: { type: String, trim: true, maxlength: 160, default: '' },
    phone: { type: String, trim: true, maxlength: 24, default: '' }, // normalised E.164, '' when missing
    entityType: { type: String, trim: true, maxlength: 40, default: null },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    reference: { type: String, trim: true, maxlength: 80, default: '' }, // human reference: order / quote / request number, SKU
    template: { type: String, required: true, trim: true, maxlength: 80 },
    variables: { type: mongoose.Schema.Types.Mixed, default: {} },
    body: { type: String, required: true, maxlength: 4096 },
    provider: { type: String, required: true, trim: true, maxlength: 20 },
    simulated: { type: Boolean, default: false }, // true => nothing left this server (mock provider)
    providerMessageId: { type: String, trim: true, maxlength: 120, default: null },
    status: { type: String, enum: Object.values(WHATSAPP_STATUSES), default: WHATSAPP_STATUSES.PENDING, index: true },
    error: { code: { type: String, default: null }, message: { type: String, default: null }, retryable: { type: Boolean, default: false } },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 3, min: 1 },
    nextAttemptAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 240 },
  },
  { timestamps: true },
);

whatsAppMessageSchema.index({ idempotencyKey: 1 }, { unique: true });
whatsAppMessageSchema.index({ createdAt: -1 });
whatsAppMessageSchema.index({ status: 1, nextAttemptAt: 1 });
whatsAppMessageSchema.index({ event: 1, entityId: 1, recipientType: 1, createdAt: -1 });

module.exports = mongoose.models.WhatsAppMessage || mongoose.model('WhatsAppMessage', whatsAppMessageSchema);
