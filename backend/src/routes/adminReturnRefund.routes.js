'use strict';

const router = require('express').Router();

const validate =
  require('../middleware/validate');

const controller =
  require('../controllers/returnRefund.controller');

const validators =
  require('../validators/returnRefund.validators');

router.get(
  '/',
  validate({
    query: validators.listAdminReturnsQuery,
  }),
  controller.listAdminReturns,
);

router.get(
  '/:id',
  validate({
    params: validators.requestIdParams,
  }),
  controller.getAdminReturn,
);

router.patch(
  '/:id/review',
  validate({
    params: validators.requestIdParams,
    body: validators.reviewReturnBody,
  }),
  controller.reviewReturn,
);

router.patch(
  '/:id/receive',
  validate({
    params: validators.requestIdParams,
    body: validators.receiveReturnBody,
  }),
  controller.markReceived,
);

router.patch(
  '/:id/inspect',
  validate({
    params: validators.requestIdParams,
    body: validators.inspectReturnBody,
  }),
  controller.inspectReturn,
);

router.patch(
  '/:id/refund',
  validate({
    params: validators.requestIdParams,
    body: validators.prepareRefundBody,
  }),
  controller.prepareRefund,
);

router.patch(
  '/:id/refund/complete-cod',
  validate({
    params: validators.requestIdParams,
  }),
  controller.completeCodRefund,
);

module.exports = router;