'use strict';

const router = require('express').Router();

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
  validate({
    query: listPacksQuery,
  }),
  asyncHandler(
    wholesaleController.listPacks,
  ),
);

router.get(
  '/packs/:slug',
  validate({
    params: packSlugParams,
  }),
  asyncHandler(
    wholesaleController.getPack,
  ),
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