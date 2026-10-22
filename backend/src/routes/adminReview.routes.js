'use strict';

const router =
  require('express').Router();

const {
  validate,
} = require('../middleware/validate');

const asyncHandler =
  require('../utils/asyncHandler');

const controller =
  require('../controllers/review.controller');

const {
  reviewIdParams,
  adminReviewsQuery,
  rejectReviewBody,
  replyReviewBody,
} = require(
  '../validators/review.validators',
);

/*
|--------------------------------------------------------------------------
| Reviews List
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  validate({
    query:
      adminReviewsQuery,
  }),
  asyncHandler(
    controller.listAdminReviews,
  ),
);

/*
|--------------------------------------------------------------------------
| Review Detail
|--------------------------------------------------------------------------
*/

router.get(
  '/:id',
  validate({
    params:
      reviewIdParams,
  }),
  asyncHandler(
    controller.getAdminReview,
  ),
);

/*
|--------------------------------------------------------------------------
| Approve
|--------------------------------------------------------------------------
*/

router.patch(
  '/:id/approve',
  validate({
    params:
      reviewIdParams,
  }),
  asyncHandler(
    controller.approveReview,
  ),
);

/*
|--------------------------------------------------------------------------
| Reject
|--------------------------------------------------------------------------
*/

router.patch(
  '/:id/reject',
  validate({
    params:
      reviewIdParams,

    body:
      rejectReviewBody,
  }),
  asyncHandler(
    controller.rejectReview,
  ),
);

/*
|--------------------------------------------------------------------------
| Official Brand Reply
|--------------------------------------------------------------------------
|
| Same endpoint handles both:
| Publish Reply
| Edit Reply
|--------------------------------------------------------------------------
*/

router.put(
  '/:id/reply',
  validate({
    params:
      reviewIdParams,

    body:
      replyReviewBody,
  }),
  asyncHandler(
    controller.upsertBrandReply,
  ),
);

module.exports = router;