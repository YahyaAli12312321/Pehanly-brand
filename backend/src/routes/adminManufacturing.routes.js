'use strict';

const router = require('express').Router();

const { validate } = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');

const controller =
  require('../controllers/manufacturing.controller');

const {
  idParams,
  catalogTypeParams,

  createCategoryBody,
  updateCategoryBody,

  createStyleBody,
  updateStyleBody,

  createVariantBody,
  updateVariantBody,

  catalogStatusBody,

  listAdminRequestsQuery,
  reviewRequestBody,
  approveRequestBody,
} = require('../validators/manufacturing.validators');

/*
 * Parent /admin router already applies:
 * authenticate + requireAdmin
 */

/* Requests */

router.get(
  '/requests',
  validate({ query: listAdminRequestsQuery }),
  asyncHandler(controller.listAdminRequests),
);

router.get(
  '/requests/:id',
  validate({ params: idParams }),
  asyncHandler(controller.getAdminRequest),
);

router.patch(
  '/requests/:id/review',
  validate({
    params: idParams,
    body: reviewRequestBody,
  }),
  asyncHandler(controller.reviewRequest),
);

router.patch(
  '/requests/:id/approve',
  validate({
    params: idParams,
    body: approveRequestBody,
  }),
  asyncHandler(controller.approveRequest),
);

/* Category */

router.post(
  '/categories',
  validate({ body: createCategoryBody }),
  asyncHandler(controller.createCategory),
);

router.patch(
  '/categories/:id',
  validate({
    params: idParams,
    body: updateCategoryBody,
  }),
  asyncHandler(controller.updateCategory),
);

/* Style */

router.post(
  '/styles',
  validate({ body: createStyleBody }),
  asyncHandler(controller.createStyle),
);

router.patch(
  '/styles/:id',
  validate({
    params: idParams,
    body: updateStyleBody,
  }),
  asyncHandler(controller.updateStyle),
);

/* Variant */

router.post(
  '/variants',
  validate({ body: createVariantBody }),
  asyncHandler(controller.createVariant),
);

router.patch(
  '/variants/:id',
  validate({
    params: idParams,
    body: updateVariantBody,
  }),
  asyncHandler(controller.updateVariant),
);

/* Generic Admin Catalog */

router.get(
  '/catalog/:type',
  validate({ params: catalogTypeParams }),
  asyncHandler(controller.listAdminCatalog),
);

router.patch(
  '/catalog/:type/:id/status',
  validate({
    params: catalogTypeParams.extend({
      id: idParams.shape.id,
    }),
    body: catalogStatusBody,
  }),
  asyncHandler(controller.setCatalogStatus),
);

module.exports = router;