'use strict';
const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/apiResponse');
const audit = require('../services/audit.service');

const setSession = (res, user, remember) => {
  const c = authService.sessionCookie(user, remember);
  res.cookie(c.name, c.value, c.options);
};

exports.register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.validated.body);
  setSession(res, user);
  return created(res, { message: 'Account created', data: { user: user.toJSON() } });
});

exports.login = asyncHandler(async (req, res) => {
  const { rememberMe, ...credentials } = req.validated.body;
  const user = await authService.login(credentials);
  setSession(res, user, rememberMe);

  // Back-office sign-ins are part of the audit trail (customers are not).
  if (user.role !== 'customer') await audit.record(user, 'auth.login', 'User', user._id, { role: user.role }, req);

  return success(res, { message: 'Signed in', data: { user: user.toJSON() } });
});

exports.logout = (_req, res) => {
  const c = authService.clearCookie();
  res.clearCookie(c.name, c.options);
  return success(res, { message: 'Signed out' });
};

exports.me = (req, res) => success(res, { data: { user: req.user } });

exports.forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.validated.body);
  return success(res, { message: 'If an account exists, a reset link has been sent' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.validated.body);
  return success(res, { message: 'Password updated. Please sign in.' });
});
