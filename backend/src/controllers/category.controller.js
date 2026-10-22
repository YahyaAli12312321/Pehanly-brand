'use strict';
const svc = require('../services/category.service');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/apiResponse');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.list(req.validated.query);
  return success(res, { data: items, meta });
});
exports.summary = asyncHandler(async (_req, res) => success(res, { data: await svc.summary() }));
exports.audiences = asyncHandler(async (_req, res) => success(res, { data: await svc.audiences() }));
exports.get = asyncHandler(async (req, res) => success(res, { data: await svc.getById(req.validated.params.id) }));
exports.create = asyncHandler(async (req, res) => created(res, { message: 'Category created', data: await svc.create(req.validated.body) }));
exports.update = asyncHandler(async (req, res) =>
  success(res, { message: 'Category updated', data: await svc.update(req.validated.params.id, req.validated.body) }));
exports.setStatus = asyncHandler(async (req, res) =>
  success(res, { message: 'Category updated', data: await svc.setStatus(req.validated.params.id, req.validated.body.isActive) }));
