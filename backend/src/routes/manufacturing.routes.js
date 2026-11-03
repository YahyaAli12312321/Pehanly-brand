'use strict';

const router = require('express').Router();

const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');

const controller =
  require('../controllers/manufacturing.controller');

const {
  slugParams,
  categoryIdParams,
  styleIdParams,
  createRequestBody,
  listPublicQuery,
  listMyRequestsQuery,
  idParams,
} = require('../validators/manufacturing.validators');

/* Public Catalog */

router.get(
  '/categories',
  validate({ query: listPublicQuery }),
  asyncHandler(controller.listCategories),
);

router.get(
  '/categories/:slug',
  validate({ params: slugParams }),
  asyncHandler(controller.getCategory),
);

router.get(
  '/categories/:categoryId/styles',
  validate({ params: categoryIdParams }),
  asyncHandler(controller.listStyles),
);

router.get(
  '/styles/:slug',
  validate({ params: slugParams }),
  asyncHandler(controller.getStyle),
);

router.get(
  '/styles/:styleId/variants',
  validate({ params: styleIdParams }),
  asyncHandler(controller.listVariants),
);

/* Authenticated Customer */

router.post(
  '/requests',
  authenticate,
  validate({ body: createRequestBody }),
  asyncHandler(controller.createRequest),
);

router.get(
  '/my',
  authenticate,
  validate({ query: listMyRequestsQuery }),
  asyncHandler(controller.listMyRequests),
);

router.get(
  '/my/:id',
  authenticate,
  validate({ params: idParams }),
  asyncHandler(controller.getMyRequest),
);

module.exports = router;