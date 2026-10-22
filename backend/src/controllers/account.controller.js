'use strict';

const accountService = require('../services/account.service');
const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/apiResponse');

const refreshSession = (res, user) => {
  const cookie = authService.sessionCookie(user);

  res.cookie(cookie.name, cookie.value, cookie.options);
};

exports.getProfile = asyncHandler(async (req, res) =>
  success(res, { data: { user: await accountService.getProfile(req.user.id) } }));

exports.updateProfile = asyncHandler(async (req, res) =>
  success(res, {
    message: 'Profile updated',
    data: { user: await accountService.updateProfile(req.user.id, req.validated.body) },
  }));

exports.changePassword = asyncHandler(async (req, res) => {
  const user = await accountService.changePassword(req.user.id, req.validated.body);

  // Other devices are signed out; this one gets a fresh cookie.
  refreshSession(res, user);

  return success(res, { message: 'Password changed. Other devices were signed out.' });
});

exports.logoutOtherSessions = asyncHandler(async (req, res) => {
  const user = await accountService.logoutOtherSessions(req.user.id);

  refreshSession(res, user);

  return success(res, { message: 'Signed out of all other devices' });
});

exports.listAddresses = asyncHandler(async (req, res) =>
  success(res, { data: await accountService.listAddresses(req.user.id) }));

exports.addAddress = asyncHandler(async (req, res) =>
  created(res, { message: 'Address saved', data: await accountService.addAddress(req.user.id, req.validated.body) }));

exports.updateAddress = asyncHandler(async (req, res) =>
  success(res, {
    message: 'Address updated',
    data: await accountService.updateAddress(req.user.id, req.validated.params.addressId, req.validated.body),
  }));

exports.deleteAddress = asyncHandler(async (req, res) =>
  success(res, {
    message: 'Address removed',
    data: await accountService.deleteAddress(req.user.id, req.validated.params.addressId),
  }));

exports.setAvatar = asyncHandler(async (req, res) =>
  success(res, {
    message: 'Avatar updated',
    data: { user: await accountService.setAvatar(req.user.id, req.validated.body.mediaId) },
  }));

exports.removeAvatar = asyncHandler(async (req, res) =>
  success(res, { message: 'Avatar removed', data: { user: await accountService.removeAvatar(req.user.id) } }));
