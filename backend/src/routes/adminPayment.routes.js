'use strict';

const router = require('express').Router();

const paymentController = require('../controllers/payment.controller');
const paymentValidators = require('../validators/payment.validators');

const validate = require('../middleware/validate');

router.get(
  '/',
  validate({
    query: paymentValidators.listPaymentsQuery,
  }),
  paymentController.listPayments,
);

/* GET /api/v1/admin/payments/summary (must stay above '/:id') */
router.get('/summary', paymentController.getPaymentSummary);

router.get(
  '/:id',
  validate({
    params: paymentValidators.paymentIdParams,
  }),
  paymentController.getPayment,
);

router.post(
  '/orders/:orderId/cod',
  validate({
    params: paymentValidators.orderIdParams,
  }),
  paymentController.createCodPayment,
);

router.patch(
  '/:id/cod/confirm',
  validate({
    params: paymentValidators.paymentIdParams,
  }),
  paymentController.confirmCodPayment,
);

module.exports = router;