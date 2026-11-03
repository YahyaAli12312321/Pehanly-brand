'use strict';

const settingsService = require('../services/settings.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');

exports.getPublic = asyncHandler(async (_req, res) =>
  success(res, { data: await settingsService.getPublicSettings() }),
);

exports.getAdmin = asyncHandler(async (_req, res) =>
  success(res, { data: await settingsService.getSettings() }),
);

exports.update = asyncHandler(async (req, res) => {
  const data = await settingsService.updateSettings(req.validated.body, req.user, req);
  return success(res, { message: 'Settings updated', data });
});
