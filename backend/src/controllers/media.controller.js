'use strict';

const mediaService = require('../services/media.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { success, created } = require('../utils/apiResponse');

exports.upload = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('No file was uploaded (field name must be "file")', 'FILE_REQUIRED');
  }

  const data = await mediaService.upload({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    purpose: req.validated.body.purpose,
    user: req.user,
    req,
  });

  return created(res, { message: 'File uploaded', data });
});

exports.remove = asyncHandler(async (req, res) => {
  await mediaService.remove({ id: req.validated.params.id, user: req.user, req });
  return success(res, { message: 'File deleted' });
});

exports.listMine = asyncHandler(async (req, res) => {
  const { items, meta } = await mediaService.listMine({ user: req.user, ...req.validated.query });
  return success(res, { data: items, meta });
});

exports.listAll = asyncHandler(async (req, res) => {
  const { items, meta } = await mediaService.listAll(req.validated.query);
  return success(res, { data: items, meta });
});

exports.cleanup = asyncHandler(async (req, res) => {
  const data = await mediaService.cleanupOrphans(req.validated.body);
  return success(res, { message: 'Cleanup finished', data });
});
