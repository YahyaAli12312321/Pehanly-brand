'use strict';

const manufacturingService =
  require('../services/manufacturing.service');

const response =
  require('../utils/apiResponse');

async function listCategories(req, res) {
  const result = await manufacturingService.listCategories(
    req.validated.query,
  );

  return response.success(res, {
    data: result.categories,
    meta: result.meta,
    message: 'Manufacturing categories fetched successfully',
  });
}

async function getCategory(req, res) {
  const data = await manufacturingService.getCategoryBySlug(
    req.validated.params.slug,
  );

  return response.success(res, { data });
}

async function listStyles(req, res) {
  const data = await manufacturingService.listStylesByCategory(
    req.validated.params.categoryId,
  );

  return response.success(res, { data });
}

async function getStyle(req, res) {
  const data = await manufacturingService.getStyleBySlug(
    req.validated.params.slug,
  );

  return response.success(res, { data });
}

async function listVariants(req, res) {
  const data = await manufacturingService.listVariantsByStyle(
    req.validated.params.styleId,
  );

  return response.success(res, { data });
}

async function createRequest(req, res) {
  const {
    category,
    style,
    variant,
    ...rest
  } = req.validated.body;

  /*
   * The public API uses category/style/variant; the service works with
   * explicit *Id names.
   */
  const data = await manufacturingService.createRequest({
    userId: req.user?._id || null,
    ...rest,
    categoryId: category,
    styleId: style,
    variantId: variant || null,
  });

  return response.created(res, {
    data,
    message: 'Manufacturing request submitted successfully',
  });
}

async function listMyRequests(req, res) {
  const result = await manufacturingService.listMyRequests({
    userId: req.user._id,
    ...req.validated.query,
  });

  return response.success(res, {
    data: result.requests,
    meta: result.meta,
  });
}

async function getMyRequest(req, res) {
  const data = await manufacturingService.getMyRequest({
    requestId: req.validated.params.id,
    userId: req.user._id,
  });

  return response.success(res, { data });
}

/* ADMIN */

async function createCategory(req, res) {
  const data = await manufacturingService.createCategory(
    req.validated.body,
  );

  return response.created(res, { data });
}

async function updateCategory(req, res) {
  const data = await manufacturingService.updateCategory({
    categoryId: req.validated.params.id,
    data: req.validated.body,
  });

  return response.success(res, { data });
}

async function createStyle(req, res) {
  const data = await manufacturingService.createStyle(
    req.validated.body,
  );

  return response.created(res, { data });
}

async function updateStyle(req, res) {
  const data = await manufacturingService.updateStyle({
    styleId: req.validated.params.id,
    data: req.validated.body,
  });

  return response.success(res, { data });
}

async function createVariant(req, res) {
  const data = await manufacturingService.createVariant(
    req.validated.body,
  );

  return response.created(res, { data });
}

async function updateVariant(req, res) {
  const data = await manufacturingService.updateVariant({
    variantId: req.validated.params.id,
    data: req.validated.body,
  });

  return response.success(res, { data });
}

async function setCatalogStatus(req, res) {
  const data = await manufacturingService.setCatalogStatus({
    documentId: req.validated.params.id,
    documentType: req.validated.params.type,
    isActive: req.validated.body.isActive,
  });

  return response.success(res, { data });
}

async function listAdminCatalog(req, res) {
  const data = await manufacturingService.listAdminCatalog(
    req.validated.params.type,
  );

  return response.success(res, { data });
}

async function listAdminRequests(req, res) {
  const result = await manufacturingService.listAdminRequests(
    req.validated.query,
  );

  return response.success(res, {
    data: result.requests,
    meta: result.meta,
  });
}

async function getAdminRequest(req, res) {
  const data = await manufacturingService.getAdminRequest(
    req.validated.params.id,
  );

  return response.success(res, { data });
}

async function reviewRequest(req, res) {
  const data = await manufacturingService.reviewRequest({
    requestId: req.validated.params.id,
    adminUserId: req.user._id,
    ...req.validated.body,
  });

  return response.success(res, { data });
}

async function approveRequest(req, res) {
  const data = await manufacturingService.approveRequest({
    requestId: req.validated.params.id,
    adminUserId: req.user._id,
    ...req.validated.body,
  });

  return response.success(res, { data });
}

module.exports = {
  listCategories,
  getCategory,
  listStyles,
  getStyle,
  listVariants,

  createRequest,
  listMyRequests,
  getMyRequest,

  createCategory,
  updateCategory,

  createStyle,
  updateStyle,

  createVariant,
  updateVariant,

  setCatalogStatus,
  listAdminCatalog,

  listAdminRequests,
  getAdminRequest,

  reviewRequest,
  approveRequest,
};