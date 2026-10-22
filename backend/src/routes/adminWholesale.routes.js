'use strict';

const router = require('express').Router();

const {
  validate,
} = require('../middleware/validate');

const asyncHandler =
  require('../utils/asyncHandler');

const wholesaleController =
  require('../controllers/wholesale.controller');

const {
  wholesaleIdParams,
  createPackBody,
  updatePackBody,
  packStatusBody,
  listAdminRequestsQuery,
  listPacksQuery,
  reviewRequestBody,
  approveRequestBody,
} = require(
  '../validators/wholesale.validators',
);

/*
|--------------------------------------------------------------------------
| Dashboard Stats
|--------------------------------------------------------------------------
*/

router.get(
  '/stats',
  asyncHandler(
    wholesaleController.getAdminStats,
  ),
);

/*
|--------------------------------------------------------------------------
| Wholesale Requests
|--------------------------------------------------------------------------
*/

router.get(
  '/requests',
  validate({
    query: listAdminRequestsQuery,
  }),
  asyncHandler(
    wholesaleController.listAdminRequests,
  ),
);

router.get(
  '/requests/:id',
  validate({
    params: wholesaleIdParams,
  }),
  asyncHandler(
    wholesaleController.getAdminRequest,
  ),
);

router.patch(
  '/requests/:id/review',
  validate({
    params: wholesaleIdParams,
    body: reviewRequestBody,
  }),
  asyncHandler(
    wholesaleController.reviewRequest,
  ),
);

router.patch(
  '/requests/:id/approve',
  validate({
    params: wholesaleIdParams,
    body: approveRequestBody,
  }),
  asyncHandler(
    wholesaleController.approveRequest,
  ),
);

/*
|--------------------------------------------------------------------------
| Ready Packs
|--------------------------------------------------------------------------
*/

router.get(
  '/packs',
  validate({
    query: listPacksQuery,
  }),
  asyncHandler(
    wholesaleController.listAdminPacks,
  ),
);

router.post(
  '/packs',
  validate({
    body: createPackBody,
  }),
  asyncHandler(
    wholesaleController.createPack,
  ),
);

router.get(
  '/packs/:id',
  validate({
    params: wholesaleIdParams,
  }),
  asyncHandler(
    wholesaleController.getAdminPack,
  ),
);

router.patch(
  '/packs/:id',
  validate({
    params: wholesaleIdParams,
    body: updatePackBody,
  }),
  asyncHandler(
    wholesaleController.updatePack,
  ),
);

router.patch(
  '/packs/:id/status',
  validate({
    params: wholesaleIdParams,
    body: packStatusBody,
  }),
  asyncHandler(
    wholesaleController.setPackStatus,
  ),
);

module.exports = router;