'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { config } = require('../config/env');
const logger = require('../config/logger');
const User = require('../models/User');
const { ROLES } = require('../constants/Permissions');
const ApiError = require('../utils/ApiError');
const { normalizeEmail, isEmail, normalizePhone } = require('../utils/identity');
const { generateCustomerNumber} = require('./customerNumber.service');
const emailService = require('./email.service');


const GENERIC_LOGIN_ERROR = 'Invalid email/phone or password';
// Compared against when no user is found so response time does not reveal account existence.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', config.auth.bcryptRounds);

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

/*
 * Session lifetime.
 *   remember undefined -> unchanged legacy behaviour (SESSION_DAYS, persistent cookie)
 *   remember true      -> REMEMBER_ME_DAYS, persistent cookie
 *   remember false     -> browser-session cookie, token valid 1 day at most
 * The JWT `exp` is what the server enforces; the cookie maxAge only mirrors it.
 */
function sessionLifetime(remember) {
  if (remember === true) return { jwt: `${config.auth.rememberDays}d`, maxAgeMs: config.auth.rememberDays * 24 * 60 * 60 * 1000 };
  if (remember === false) return { jwt: '1d', maxAgeMs: undefined };
  return { jwt: `${config.auth.sessionDays}d`, maxAgeMs: config.auth.sessionDays * 24 * 60 * 60 * 1000 };
}

function signSession(user, remember) {
  return jwt.sign({ sub: String(user._id), tv: user.tokenVersion ?? 0 }, config.auth.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: sessionLifetime(remember).jwt,
  });
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
    domain: config.auth.cookieDomain,
    path: '/',
  };
}

const sessionCookie = (user, remember) => {
  const { maxAgeMs } = sessionLifetime(remember);
  return {
    name: config.auth.cookieName,
    value: signSession(user, remember),
    options: { ...cookieOptions(), ...(maxAgeMs ? { maxAge: maxAgeMs } : {}) },
  };
};
const clearCookie = () => ({ name: config.auth.cookieName, options: cookieOptions() });

const ADMIN_EXISTS_MESSAGE = 'An admin account already exists. Additional admin registration is not allowed.';
const adminExists = () => ApiError.conflict(ADMIN_EXISTS_MESSAGE, 'ADMIN_ALREADY_EXISTS');

/** Maps a MongoDB duplicate-key error on user creation to the right 409 (race between pre-check and insert). */
function duplicateKeyToConflict(err, { email, phone }) {
  if (err?.code !== 11000) return null;
  const pattern = err.keyPattern || {};
  const text = `${err.message || ''} ${JSON.stringify(err.keyValue || {})}`;
  if (pattern.role || /unique_single_admin/.test(text)) return adminExists();
  if (pattern.phone || /phone/.test(text)) return ApiError.conflict('An account with this phone number already exists', 'ACCOUNT_EXISTS');
  if (pattern.email || /email/.test(text)) return ApiError.conflict('An account with this email already exists', 'ACCOUNT_EXISTS');
  return null;
}

async function register({ name, email, phone, password, role = ROLES.CUSTOMER }) {
  // Defence in depth: the validator already limits this, the service must not trust its caller either.
  if (role !== ROLES.CUSTOMER && role !== ROLES.ADMIN) {
    throw ApiError.validation([{ field: 'role', message: 'Unsupported role' }]);
  }
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) throw ApiError.validation([{ field: 'phone', message: 'Enter a valid phone number' }]);

  // Maximum one admin. This pre-check gives the clear message; the unique partial index (unique_single_admin)
  // is what makes it race-safe, see the create() handler below.
  if (role === ROLES.ADMIN && (await User.exists({ role: ROLES.ADMIN }))) throw adminExists();

  const clash = await User.findOne({ $or: [{ email: normalizedEmail }, { phone: normalizedPhone }] }).select('email phone');
  if (clash) {
    throw ApiError.conflict(
      clash.email === normalizedEmail ? 'An account with this email already exists' : 'An account with this phone number already exists',
      'ACCOUNT_EXISTS',
    );
  }
  const passwordHash =
  await bcrypt.hash(
    password,
    config.auth.bcryptRounds,
  );

  // Customer-only data: an admin is not a customer, so it gets no customer number.
  const customerNumber = role === ROLES.CUSTOMER ? await generateCustomerNumber() : undefined;

  try {
    return await User.create({
      name,
      email: normalizedEmail,
      phone: normalizedPhone,
      passwordHash,
      role,
      ...(customerNumber ? { customerNumber } : {}),
      accountTier: 'retail',
    });
  } catch (err) {
    throw duplicateKeyToConflict(err, { email: normalizedEmail, phone: normalizedPhone }) || err;
  }
}

async function login({ identifier, password }) {
  const id = String(identifier).trim();
  const query = isEmail(id) ? { email: normalizeEmail(id) } : { phone: normalizePhone(id) };
  const user = query.phone === null ? null : await User.findOne(query).select('+passwordHash +tokenVersion');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.isActive) throw ApiError.unauthorized(GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS');
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

/** Always resolves the same way (no account enumeration). The reset link is e-mailed; it is never returned to the client. */
async function forgotPassword({ identifier }) {
  const id = String(identifier).trim();
  const query = isEmail(id) ? { email: normalizeEmail(id) } : { phone: normalizePhone(id) };
  if (query.phone === null) return;
  const user = await User.findOne(query);
  if (!user || !user.isActive) return;
  const token = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = hashToken(token);
  user.passwordResetExpires = new Date(Date.now() + config.auth.resetMinutes * 60 * 1000);
  await user.save();
  // Delivery errors are logged inside the service and never change the response.
  await emailService.sendPasswordReset({ to: user.email, name: user.name, token, backOffice: user.role !== 'customer' });
}

async function resetPassword({ token, password }) {
  const user = await User.findOne({
    passwordResetToken: hashToken(token),
    passwordResetExpires: { $gt: new Date() },
  }).select('+tokenVersion +passwordResetToken +passwordResetExpires');
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired', 'INVALID_RESET_TOKEN');
  user.passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // invalidates existing sessions
  await user.save();
  await emailService.sendPasswordChanged({ to: user.email, name: user.name });
}

module.exports = { register, login, forgotPassword, resetPassword, sessionCookie, clearCookie };
