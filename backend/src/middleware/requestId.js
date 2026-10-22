'use strict';
const crypto = require('crypto');

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

module.exports = function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
