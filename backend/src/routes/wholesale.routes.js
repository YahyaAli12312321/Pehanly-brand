'use strict';

const router = require('express').Router();
const optionalAuth = require('../middleware/optionalAuth');

const {
  authenticate,
} = require('../middleware/auth');

const {
  validate,
} = require('../middleware/validate');

const asyncHandler =
  require('../utils/asyncHandler');

const wholesaleController =
  require('../controllers/wholesale.controller');

const {
  wholesaleIdParams,
  packSlugParams,
  createCustomRequestBody,
  createPackRequestBody,
  previewBody,
  listMyRequestsQuery,
  listPacksQuery,
} = require(
  '../validators/wholesale.validators',
);

/*
|--------------------------------------------------------------------------
| Public Ready Wholesale Packs
|--------------------------------------------------------------------------
*/

router.get(
  '/packs',
  optionalAuth,
  validate({
    query: listPacksQuery,
  }),
  asyncHandler(
    wholesaleController.listPacks,
  ),
);

router.get(
  '/packs/:slug',
  optionalAuth,
  validate({
    params: packSlugParams,
  }),
  asyncHandler(
    wholesaleController.getPack,
  ),
);

/*
| Wholesale catalog + authoritative preview (authenticated: wholesale prices are not public)
*/

router.get(
  '/catalog',
  authenticate,
  asyncHandler(wholesaleController.catalog),
);

router.post(
  '/preview',
  authenticate,
  validate({ body: previewBody }),
  asyncHandler(wholesaleController.preview),
);

/*
|--------------------------------------------------------------------------
| Create Wholesale Requests
|--------------------------------------------------------------------------
| Authenticated customers only.
|--------------------------------------------------------------------------
*/

router.post(
  '/requests/custom',
  authenticate,
  validate({
    body: createCustomRequestBody,
  }),
  asyncHandler(
    wholesaleController
      .createCustomRequest,
  ),
);

router.post(
  '/packs/:id/request',
  authenticate,
  validate({
    params: wholesaleIdParams,
    body: createPackRequestBody,
  }),
  asyncHandler(
    wholesaleController
      .createPackRequest,
  ),
);

/*
|--------------------------------------------------------------------------
| Customer Wholesale Requests
|--------------------------------------------------------------------------
*/

router.get(
  '/my',
  authenticate,
  validate({
    query: listMyRequestsQuery,
  }),
  asyncHandler(
    wholesaleController
      .listMyRequests,
  ),
);

router.get(
  '/my/:id',
  authenticate,
  validate({
    params: wholesaleIdParams,
  }),
  asyncHandler(
    wholesaleController
      .getMyRequest,
  ),
);

module.exports = router;