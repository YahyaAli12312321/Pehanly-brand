'use strict';
const router = require('express').Router();
const c = require('../controllers/auth.controller');
const v = require('../validators/auth.validators');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimiter');

const TOO_MANY = 'Too many attempts. Try again later.';

// Separate buckets: failed logins must not block registration, and vice versa.
const registerLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, code: 'AUTH_RATE_LIMITED', message: TOO_MANY });

// Only failed attempts count, so staff sharing one office IP are not locked out by successful logins.
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, code: 'AUTH_RATE_LIMITED', message: TOO_MANY, skipSuccessfulRequests: true });

const resetLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10, code: 'AUTH_RATE_LIMITED', message: TOO_MANY });

router.post('/register', registerLimiter, validate({ body: v.registerBody }), c.register);
router.post('/login', loginLimiter, validate({ body: v.loginBody }), c.login);
router.post('/logout', c.logout);
router.get('/me', authenticate, c.me);
router.post('/forgot-password', resetLimiter, validate({ body: v.forgotBody }), c.forgotPassword);
router.post('/reset-password', resetLimiter, validate({ body: v.resetBody }), c.resetPassword);

module.exports = router;
