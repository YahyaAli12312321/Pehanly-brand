'use strict';
const { z } = require('zod');

const { ROLES } = require('../constants/Permissions');

const password = z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters');

// Roles a public registration may request. "staff" is deliberately not one of them: staff accounts and their
// permissions are created by an authenticated admin. Omitted = customer (backwards compatible).
const REGISTRABLE_ROLES = [ROLES.CUSTOMER, ROLES.ADMIN];

exports.registerBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().trim().min(7).max(20),
  password,
  role: z.enum(REGISTRABLE_ROLES, { errorMap: () => ({ message: `Role must be one of: ${REGISTRABLE_ROLES.join(', ')}` }) }).optional(),
}).strict();

exports.loginBody = z.object({
  identifier: z.string().trim().min(3).max(160),
  password: z.string().min(1).max(72),
  // Optional. true = long-lived session, false = browser-session cookie, omitted = default (unchanged).
  rememberMe: z.boolean().optional(),
}).strict();

exports.forgotBody = z.object({ identifier: z.string().trim().min(3).max(160) }).strict();

exports.resetBody = z.object({ token: z.string().min(32).max(128), password }).strict();
