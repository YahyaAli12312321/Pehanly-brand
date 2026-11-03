'use strict';

const staffService = require('../services/staff.service');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/apiResponse');

exports.catalog = asyncHandler(async (_req, res) =>
  success(res, { data: staffService.catalog() }),
);

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await staffService.list(req.validated.query);
  return success(res, { data: items, meta });
});

exports.create = asyncHandler(async (req, res) => {
  const data = await staffService.create(req.validated.body, req.user, req);
  return created(res, { message: 'Staff member created', data });
});

exports.update = asyncHandler(async (req, res) => {
  const data = await staffService.update(
    req.validated.params.id,
    req.validated.body,
    req.user,
    req,
  );
  return success(res, { message: 'Staff member updated', data });
});

exports.setStatus = asyncHandler(async (req, res) => {
  const data = await staffService.setStatus(
    req.validated.params.id,
    req.validated.body.isActive,
    req.user,
    req,
  );
  return success(res, { message: 'Staff status updated', data });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  await staffService.resetPassword(
    req.validated.params.id,
    req.validated.body.password,
    req.user,
    req,
  );
  return success(res, { message: 'Password reset. Existing sessions were ended.' });
});
