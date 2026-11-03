'use strict';

const router =
  require('express').Router();

const {
  validate,
} = require('../middleware/validate');

const asyncHandler =
  require('../utils/asyncHandler');

const controller =
  require('../controllers/banner.controller');

const {
  bannerIdParams,
  publicBannersQuery,
} = require(
  '../validators/banner.validators',
);

/*
|--------------------------------------------------------------------------
| Public Active Banners
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  validate({
    query:
      publicBannersQuery,
  }),
  asyncHandler(
    controller.listPublicBanners,
  ),
);

/*
|--------------------------------------------------------------------------
| Tracking
|--------------------------------------------------------------------------
*/

router.post(
  '/:id/impression',
  validate({
    params:
      bannerIdParams,
  }),
  asyncHandler(
    controller.recordImpression,
  ),
);

router.post(
  '/:id/click',
  validate({
    params:
      bannerIdParams,
  }),
  asyncHandler(
    controller.recordClick,
  ),
);

module.exports = router;