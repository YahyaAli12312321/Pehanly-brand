'use strict';
const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');

/**
 * Records an admin action. Never throws: an audit write failure must not roll back the business change,
   * but it is logged loudly. Never pass secrets in `metadata`.
 */
async function record(actor, action, entityType, entityId, metadata, req) {
  try {
    await AuditLog.create({
      admin: actor.id || actor._id,
      action,
      entityType,
      entityId: String(entityId),
      metadata,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent']?.slice(0, 200),
    });
  } catch (err) {
    logger.error({ err: err.message, action, entityType, entityId: String(entityId) }, 'Audit log write failed');
  }
}

module.exports = { record };
