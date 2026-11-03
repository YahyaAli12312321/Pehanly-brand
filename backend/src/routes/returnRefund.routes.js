'use strict';

const router = require('express').Router();

const {
  authenticate,
} = require('../middleware/auth');

const validate =
  require('../middleware/validate');

const controller =
  require('../controllers/returnRefund.controller');

const validators =
  require('../validators/returnRefund.validators');

router.use(authenticate);

router.get('/my', validate({
    query: validators.listMyReturnsQuery,
  }),
  controller.getMyReturns,
);

router.get(
  '/my/:id',
  validate({
    params: validators.requestIdParams,
  }),
  controller.getMyReturn,
);

router.post(
  '/orders/:id',
  validate({
    params: validators.orderIdParams,
    body: validators.createReturnBody,
  }),
  controller.createCustomerReturn,
);

module.exports = router;