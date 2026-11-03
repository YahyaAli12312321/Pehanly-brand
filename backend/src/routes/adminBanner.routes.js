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
  createBannerBody,
  updateBannerBody,
  bannerStatusBody,

  bannerIdParams,
  adminBannersQuery,
} = require(
  '../validators/banner.validators',
);

/*
|--------------------------------------------------------------------------
| Stats
|--------------------------------------------------------------------------
|
| MUST remain before /:id.
|--------------------------------------------------------------------------
*/

router.get(
  '/stats',
  asyncHandler(
    controller.getStats,
  ),
);

/*
|--------------------------------------------------------------------------
| CRUD
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  validate({
    query:
      adminBannersQuery,
  }),
  asyncHandler(
    controller.listAdminBanners,
  ),
);

router.post(
  '/',
  validate({
    body:
      createBannerBody,
  }),
  asyncHandler(
    controller.createBanner,
  ),
);

router.get(
  '/:id',
  validate({
    params:
      bannerIdParams,
  }),
  asyncHandler(
    controller.getAdminBanner,
  ),
);

router.patch(
  '/:id',
  validate({
    params:
      bannerIdParams,

    body:
      updateBannerBody,
  }),
  asyncHandler(
    controller.updateBanner,
  ),
);

router.patch(
  '/:id/status',
  validate({
    params:
      bannerIdParams,

    body:
      bannerStatusBody,
  }),
  asyncHandler(
    controller.setBannerStatus,
  ),
);

router.delete(
  '/:id',
  validate({
    params:
      bannerIdParams,
  }),
  asyncHandler(
    controller.deleteBanner,
  ),
);

module.exports = router;