'use strict';

const router =
  require('express').Router();

const controller =
  require('../controllers/cancellation.controller');

const validators =
  require('../validators/cancellation.validators');

const validate =
  require('../middleware/validate');

/**
 * GET
 * /api/v1/admin/cancellations
 */
router.get(
  '/',
  validate({
    query:
      validators.listCancellationQuery,
  }),
  controller.listRequests,
);

/**
 * PATCH
 * /api/v1/admin/cancellations/:id/review
 */
router.patch(
  '/:id/review',
  validate({
    params:
      validators.cancellationIdParams,

    body:
      validators.reviewCancellationBody,
  }),
  controller.reviewRequest,
);

module.exports = router;