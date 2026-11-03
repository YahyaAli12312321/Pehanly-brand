'use strict';

const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { config } = require('../config/env');

/**
 * Guest-friendly authentication (used by retail checkout).
 *
 * - No cookie, invalid/expired token, suspended user or stale session
 *   => req.user = null (guest checkout continues).
 * - Valid session => req.user has exactly the same shape as authenticate():
 *   user.toJSON() (no secrets) plus a string `id`.
 *
 * Config keys and the session claim (`tv`) match authenticate() and
 * auth.service.signSession().
 */
async function optionalAuth(req, _res, next) {
  req.user = null;

  try {
    const token = req.cookies?.[config.auth.cookieName];

    if (!token) {
      return next();
    }

    let payload;

    try {
      payload = jwt.verify(token, config.auth.jwtSecret, {
        algorithms: ['HS256'],
      });
    } catch {
      return next();
    }

    const user = await User.findById(payload.sub).select('+tokenVersion');

    if (
      !user ||
      !user.isActive ||
      (user.tokenVersion ?? 0) !== (payload.tv ?? 0)
    ) {
      return next();
    }

    req.user = user.toJSON();
    req.user.id = String(user._id);

    return next();
  } catch (error) {
    return next(error);
  }
}

optionalAuth.__guard = { type: 'optional' };

module.exports = optionalAuth;
