'use strict';
const products = require('../services/product.service');
const variants = require('../services/variant.service');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/apiResponse');

const actor = (req) => req.user;

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await products.list(req.validated.query);
  return success(res, { data: items, meta });
});
exports.summary = asyncHandler(async (_req, res) => success(res, { data: await products.summary() }));
exports.get = asyncHandler(async (req, res) => success(res, { data: await products.getById(req.validated.params.id) }));
exports.create = asyncHandler(async (req, res) => created(res, { message: 'Product created', data: await products.create(req.validated.body, actor(req), req) }));
exports.update = asyncHandler(async (req, res) => success(res, { message: 'Product updated', data: await products.update(req.validated.params.id, req.validated.body, actor(req), req) }));
exports.setStatus = asyncHandler(async (req, res) => success(res, { message: 'Product updated', data: await products.changeStatus(req.validated.params.id, req.validated.body.status, actor(req), req) }));
exports.bulk = asyncHandler(async (req, res) => success(res, { message: 'Bulk action completed', data: await products.bulk(req.validated.body, actor(req), req) }));
exports.createVariant = asyncHandler(async (req, res) => created(res, { message: 'Variant created', data: await variants.create(req.validated.params.id, req.validated.body, actor(req), req) }));
exports.updateVariant = asyncHandler(async (req, res) => success(res, { message: 'Variant updated', data: await variants.update(req.validated.params.id, req.validated.params.variantId, req.validated.body, actor(req), req) }));
