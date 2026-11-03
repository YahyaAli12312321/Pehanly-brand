'use strict';

const reviewService =
  require('../services/review.service');

const response =
  require('../utils/apiResponse');

/*
|--------------------------------------------------------------------------
| Public
|--------------------------------------------------------------------------
*/

async function listProductReviews(
  req,
  res,
) {
  const result =
    await reviewService.listProductReviews({
      productId:
        req.validated.params.productId,

      ...req.validated.query,
    });

  return response.success(res, {
    data:
      result.reviews,

    meta:
      result.meta,
  });
}

async function getProductRatingSummary(
  req,
  res,
) {
  const data =
    await reviewService.getProductRatingSummary(
      req.validated.params.productId,
    );

  return response.success(res, {
    data,
  });
}

/*
|--------------------------------------------------------------------------
| Customer
|--------------------------------------------------------------------------
*/

async function getReviewEligibility(
  req,
  res,
) {
  const data =
    await reviewService.getReviewEligibility({
      userId:
        req.user._id,

      productId:
        req.validated.params.productId,
    });

  return response.success(res, {
    data,
  });
}

async function createReview(
  req,
  res,
) {
  const data =
    await reviewService.createReview({
      user:
        req.user,

      productId:
        req.validated.params.productId,

      data:
        req.validated.body,
    });

  return response.created(res, {
    data,

    message:
      'Review submitted successfully and is pending approval',
  });
}

async function listMyReviews(
  req,
  res,
) {
  const result =
    await reviewService.listMyReviews({
      userId:
        req.user._id,

      ...req.validated.query,
    });

  return response.success(res, {
    data:
      result.reviews,

    meta:
      result.meta,
  });
}

/*
|--------------------------------------------------------------------------
| Admin
|--------------------------------------------------------------------------
*/

async function listAdminReviews(
  req,
  res,
) {
  const result =
    await reviewService.listAdminReviews(
      req.validated.query,
    );

  return response.success(res, {
    data:
      result.reviews,

    meta:
      result.meta,
  });
}

async function getAdminReview(
  req,
  res,
) {
  const data =
    await reviewService.getAdminReview(
      req.validated.params.id,
    );

  return response.success(res, {
    data,
  });
}

async function approveReview(
  req,
  res,
) {
  const data =
    await reviewService.approveReview({
      reviewId:
        req.validated.params.id,

      adminUserId:
        req.user._id,
    });

  return response.success(res, {
    data,

    message:
      'Review approved successfully',
  });
}

async function rejectReview(
  req,
  res,
) {
  const data =
    await reviewService.rejectReview({
      reviewId:
        req.validated.params.id,

      adminUserId:
        req.user._id,

      reason:
        req.validated.body.reason,
    });

  return response.success(res, {
    data,

    message:
      'Review rejected successfully',
  });
}

async function upsertBrandReply(
  req,
  res,
) {
  const data =
    await reviewService.upsertBrandReply({
      reviewId:
        req.validated.params.id,

      adminUserId:
        req.user._id,

      message:
        req.validated.body.message,
    });

  return response.success(res, {
    data,

    message:
      'Official brand reply saved successfully',
  });
}

module.exports = {
  listProductReviews,
  getProductRatingSummary,

  getReviewEligibility,
  createReview,
  listMyReviews,

  listAdminReviews,
  getAdminReview,

  approveReview,
  rejectReview,

  upsertBrandReply,
};