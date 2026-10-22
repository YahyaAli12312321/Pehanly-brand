'use strict';
const rateLimit = require('express-rate-limit');
const { config } = require('../config/env');
const { getCacheClient } = require('../config/redis');
const { RedisRateLimitStore } = require('./redisRateLimitStore');

let limiterCount = 0;

/**
 * Factory so routes can create stricter per-route limiters
 * (login, register, forgot/reset password, guest tracking, checkout, ...).
 *
 * skipSuccessfulRequests: when true, responses with status < 400 are not counted,
 * so only failed attempts consume the budget (used for login).
 */
function createRateLimiter({
  windowMs = config.limits.rateWindowMs,
  max = config.limits.rateMax,
  code = 'RATE_LIMITED',
  message = 'Too many requests, please try again later',
  skipSuccessfulRequests = false,
} = {}) {
  // Shared counters when CACHE_URL is set (several API instances); otherwise per-process memory.
  const client = config.isTest ? null : getCacheClient();
  limiterCount += 1;

  return rateLimit({
    ...(client ? { store: new RedisRateLimitStore({ client, prefix: `rl:${code}:${limiterCount}:` }) } : {}),
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests,
    skip: () => config.isTest,
    handler: (_req, res) => res.status(429).json({ success: false, message, code }),
  });
}

module.exports = { createRateLimiter, globalLimiter: createRateLimiter() };
