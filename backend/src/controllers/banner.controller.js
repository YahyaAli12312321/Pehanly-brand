'use strict';

const bannerService =
  require('../services/banner.service');

const response =
  require('../utils/apiResponse');

/*
|--------------------------------------------------------------------------
| Public
|--------------------------------------------------------------------------
*/

async function listPublicBanners(
  req,
  res,
) {
  const data =
    await bannerService.listPublicBanners(
      req.validated.query,
    );

  return response.success(res, {
    data,
  });
}

async function recordImpression(
  req,
  res,
) {
  const data =
    await bannerService.recordImpression(
      req.validated.params.id,
    );

  return response.success(res, {
    data,
  });
}

async function recordClick(
  req,
  res,
) {
  const data =
    await bannerService.recordClick(
      req.validated.params.id,
    );

  return response.success(res, {
    data,
  });
}

/*
|--------------------------------------------------------------------------
| Admin
|--------------------------------------------------------------------------
*/

async function getStats(
  req,
  res,
) {
  const data =
    await bannerService.getBannerStats();

  return response.success(res, {
    data,
  });
}

async function createBanner(
  req,
  res,
) {
  const data =
    await bannerService.createBanner({
      adminUserId:
        req.user._id,

      data:
        req.validated.body,
    });

  return response.created(res, {
    data,

    message:
      'Banner created successfully',
  });
}

async function listAdminBanners(
  req,
  res,
) {
  const result =
    await bannerService.listAdminBanners(
      req.validated.query,
    );

  return response.success(res, {
    data: result.banners,
    meta: result.meta,
  });
}

async function getAdminBanner(
  req,
  res,
) {
  const data =
    await bannerService.getAdminBanner(
      req.validated.params.id,
    );

  return response.success(res, {
    data,
  });
}

async function updateBanner(
  req,
  res,
) {
  const data =
    await bannerService.updateBanner({
      bannerId:
        req.validated.params.id,

      adminUserId:
        req.user._id,

      data:
        req.validated.body,
    });

  return response.success(res, {
    data,

    message:
      'Banner updated successfully',
  });
}

async function setBannerStatus(
  req,
  res,
) {
  const data =
    await bannerService.setBannerStatus({
      bannerId:
        req.validated.params.id,

      adminUserId:
        req.user._id,

      isActive:
        req.validated.body.isActive,
    });

  return response.success(res, {
    data,

    message:
      'Banner status updated successfully',
  });
}

async function deleteBanner(
  req,
  res,
) {
  const data =
    await bannerService.deleteBanner(
      req.validated.params.id,
    );

  return response.success(res, {
    data,
    message: data.message,
  });
}

module.exports = {
  listPublicBanners,
  recordImpression,
  recordClick,

  getStats,

  createBanner,
  listAdminBanners,
  getAdminBanner,
  updateBanner,
  setBannerStatus,
  deleteBanner,
};