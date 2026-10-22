'use strict';
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { hasPermission } = require('../constants/Permissions');

/** Requires a valid session cookie for an active user. Sets req.user (plain object, no secrets). */
const authenticate = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[config.auth.cookieName];
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, config.auth.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw ApiError.unauthorized('Session expired', 'SESSION_EXPIRED');
  }

  const user = await User.findById(payload.sub).select('+tokenVersion');

  // tokenVersion is normalized on both sides so legacy users without the field keep working.
  if (!user || !user.isActive || (user.tokenVersion ?? 0) !== (payload.tv ?? 0)) {
    throw ApiError.unauthorized('Session expired', 'SESSION_EXPIRED');
  }

  req.user = user.toJSON();
  req.user.id = String(user._id);
  return next();
});

authenticate.__guard = { type: 'authenticate' };

/** Must run after authenticate. 401 when nobody is logged in, 403 when the role is not allowed. */
const requireRole = (...roles) => {
  const middleware = (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    return roles.includes(req.user.role) ? next() : next(ApiError.forbidden());
  };

  middleware.__guard = { type: 'role', roles }; // introspection only
  return middleware;
};

const requireAdmin = requireRole('admin');

/** Any back-office user: the owner (admin) or a staff member. Permissions are checked per module. */
const requireStaff = requireRole('admin', 'staff');

/**
 * Must run after authenticate. Admin always passes; staff need EVERY listed permission.
 * (`manage` implies `read` for the same module.)
 */
const requirePermission = (...permissions) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role === 'admin') return next();
  if (req.user.role !== 'staff') return next(ApiError.forbidden());

  const granted = req.user.permissions || [];
  const ok = permissions.every((permission) => hasPermission(granted, permission));

  return ok
    ? next()
    : next(ApiError.forbidden('You do not have permission to do this', 'PERMISSION_DENIED'));
};

/**
 * Method-aware module guard: GET/HEAD/OPTIONS need "<module>.read", everything else "<module>.manage".
 */
const requireModule = (moduleName) => {
  const middleware = (req, res, next) => {
    const level = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? 'read' : 'manage';
    return requirePermission(`${moduleName}.${level}`)(req, res, next);
  };

  middleware.__guard = { type: 'module', module: moduleName }; // introspection only
  return middleware;
};

module.exports = {
  authenticate,
  requireRole,
  requireAdmin,
  requireStaff,
  requirePermission,
  requireModule,
};
