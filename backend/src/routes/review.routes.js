'use strict';

const router =
  require('express').Router();

const {
  authenticate,
} = require('../middleware/auth');

const {
  validate,
} = require('../middleware/validate');

const asyncHandler =
  require('../utils/asyncHandler');

const controller =
  require('../controllers/review.controller');

const {
  productIdParams,
  createReviewBody,
  publicReviewsQuery,
  myReviewsQuery,
} = require(
  '../validators/review.validators',
);

/*
|--------------------------------------------------------------------------
| Customer - My Reviews
|--------------------------------------------------------------------------
|
| /my must remain before /products/:productId routes only for clarity.
|--------------------------------------------------------------------------
*/

router.get(
  '/my',
  authenticate,
  validate({
    query:
      myReviewsQuery,
  }),
  asyncHandler(
    controller.listMyReviews,
  ),
);

/*
|--------------------------------------------------------------------------
| Public Product Reviews
|--------------------------------------------------------------------------
*/

router.get(
  '/products/:productId',
  validate({
    params:
      productIdParams,

    query:
      publicReviewsQuery,
  }),
  asyncHandler(
    controller.listProductReviews,
  ),
);

/*
|--------------------------------------------------------------------------
| Public Rating Summary
|--------------------------------------------------------------------------
*/

router.get(
  '/products/:productId/summary',
  validate({
    params:
      productIdParams,
  }),
  asyncHandler(
    controller.getProductRatingSummary,
  ),
);

/*
|--------------------------------------------------------------------------
| Customer Review Eligibility
|--------------------------------------------------------------------------
*/

router.get(
  '/products/:productId/eligibility',
  authenticate,
  validate({
    params:
      productIdParams,
  }),
  asyncHandler(
    controller.getReviewEligibility,
  ),
);

/*
|--------------------------------------------------------------------------
| Submit Review
|--------------------------------------------------------------------------
*/

router.post(
  '/products/:productId',
  authenticate,
  validate({
    params:
      productIdParams,

    body:
      createReviewBody,
  }),
  asyncHandler(
    controller.createReview,
  ),
);

module.exports = router;