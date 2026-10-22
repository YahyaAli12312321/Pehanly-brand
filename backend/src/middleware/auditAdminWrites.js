'use strict';

const audit = require('../services/audit.service');

/*
 * Request-level audit trail for the back office.
 *
 * Every successful admin/staff WRITE (POST/PUT/PATCH/DELETE answered < 400) and every refused
 * attempt (403) is recorded once the response has finished. This is a safety net that covers every
 * module, including the ones whose services have no detailed audit call; services such as inventory,
 * products and staff additionally record before/after values under their own action names.
 *
 * Privacy: only the FIELD NAMES of the body are stored, never their values, so passwords, tokens
 * and addresses can never leak into the log. Failures here are logged, never thrown.
 */

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const OBJECT_ID = /^[a-f\d]{24}$/i;

/** "/api/v1/admin/orders/64b7.../status?x=1" -> { pattern, entityType, entityId } */
function describePath(originalUrl) {
  const path = String(originalUrl || '').split('?')[0];
  const segments = path.split('/').filter(Boolean);
  const ids = [];

  const pattern = `/${segments
    .map((segment) => {
      if (OBJECT_ID.test(segment)) {
        ids.push(segment);

        return ':id';
      }

      return segment;
    })
    .join('/')}`;

  const adminIndex = segments.indexOf('admin');
  const entityType = (adminIndex >= 0 ? segments[adminIndex + 1] : segments[segments.length - 1]) || 'admin';
  const entityId = ids[0] || segments[segments.length - 1] || entityType;

  return { path, pattern, entityType, entityId };
}

function auditAdminWrites(req, res, next) {
  if (SAFE.has(req.method)) return next();

  res.on('finish', () => {
    const status = res.statusCode;
    const ok = status >= 200 && status < 400;

    if (!req.user || (!ok && status !== 403)) return;

    const { path, pattern, entityType, entityId } = describePath(req.originalUrl);

    // Fire and forget: audit.record never throws.
    audit.record(
      req.user,
      ok ? `http.${req.method.toLowerCase()}` : 'http.denied',
      entityType,
      entityId,
      {
        method: req.method,
        route: pattern,
        path,
        status,
        fields: req.body && typeof req.body === 'object' ? Object.keys(req.body).slice(0, 50) : [],
      },
      req,
    );
  });

  return next();
}

module.exports = auditAdminWrites;
module.exports.describePath = describePath;
