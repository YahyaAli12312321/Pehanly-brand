'use strict';

const AuditLog = require('../models/AuditLog');

/** Newest first. Read-only; entries are never edited or deleted through the API. */
async function list({ page, limit, action, entityType, entityId, admin, from, to }) {
  const filter = {};

  if (action) filter.action = action;
  if (entityType) filter.entityType = entityType;
  if (entityId) filter.entityId = entityId;
  if (admin) filter.admin = admin;

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('admin', 'name email role')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items: items.map((row) => ({
      id: String(row._id),
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actor: row.admin
        ? { id: String(row.admin._id), name: row.admin.name, email: row.admin.email, role: row.admin.role }
        : null,
      metadata: row.metadata ?? null,
      ip: row.ip ?? null,
      createdAt: row.createdAt,
    })),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

module.exports = { list };
