'use strict';

const express = require('express');

const controller = require('../controllers/payment.controller');
const validators = require('../validators/payment.validators');
const validate = require('../middleware/validate');

const {
  authenticate,
} = require('../middleware/auth');

const optionalAuth = require('../middleware/optionalAuth');

const { createRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Customer Payment Routes
|--------------------------------------------------------------------------
|
| Base URL:
| /api/v1/payments
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| Create COD Payment
|--------------------------------------------------------------------------
|
| Registered customer only.
|
| Guest COD payment will later be created securely
| inside the checkout flow.
|--------------------------------------------------------------------------
*/

router.post(
  '/orders/:orderId/cod',

  authenticate,

  validate({
    params: validators.orderIdParams,
  }),

  controller.createCodPayment,
);

/*
|--------------------------------------------------------------------------
| Get Customer Payment Status
|--------------------------------------------------------------------------
|
| Customer can only access their own payment.
|--------------------------------------------------------------------------
*/

router.get(
  '/:id/status',

  authenticate,

  validate({
    params: validators.paymentIdParams,
  }),

  controller.getPaymentStatus,
);

/*
|--------------------------------------------------------------------------
| JazzCash (sandbox-ready; see jazzcash.service for verification status)
|--------------------------------------------------------------------------
|
| Initiate: signed-in customer, or the guest who placed the order.
| Return:   called by JazzCash through the customer's browser; protected by
|           the HMAC secure hash (exempt from the cookie-CSRF origin check).
|--------------------------------------------------------------------------
*/

const jazzcashLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  code: 'PAYMENT_RATE_LIMITED',
});

router.post(
  '/orders/:orderId/jazzcash',

  jazzcashLimiter,

  optionalAuth,

  validate({
    params: validators.orderIdParams,
  }),

  controller.initiateJazzcash,
);

router.post(
  '/jazzcash/return',

  jazzcashLimiter,

  controller.jazzcashReturn,
);

module.exports = router;