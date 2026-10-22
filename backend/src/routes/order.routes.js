'use strict';

const router =
  require('express').Router();

/*
|--------------------------------------------------------------------------
| Controller
|--------------------------------------------------------------------------
*/

const controller =
  require('../controllers/order.controller');

const cancellationController =
  require('../controllers/cancellation.controller');

/*
|--------------------------------------------------------------------------
| Validators
|--------------------------------------------------------------------------
*/

const validators =
  require('../validators/order.validators');

const cancellationValidators =
  require('../validators/cancellation.validators');

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

const validate =
  require('../middleware/validate');

const optionalAuth =
  require('../middleware/optionalAuth');

const {
  authenticate,
} = require('../middleware/auth');

const {
  createRateLimiter,
} = require('../middleware/rateLimiter');

/*
|--------------------------------------------------------------------------
| Rate Limiters
|--------------------------------------------------------------------------
*/

const checkoutLimiter =
  createRateLimiter({
    windowMs:
      15 * 60 * 1000,

    max:
      20,

    code:
      'CHECKOUT_RATE_LIMITED',

    message:
      'Too many checkout attempts. Please try again later.',
  });

const guestTrackingLimiter =
  createRateLimiter({
    windowMs:
      15 * 60 * 1000,

    max:
      10,

    code:
      'GUEST_TRACKING_RATE_LIMITED',

    message:
      'Too many tracking attempts. Please try again later.',
  });

/*
|--------------------------------------------------------------------------
| Registered Customer - My Orders
|--------------------------------------------------------------------------
|
| GET /api/v1/orders/my
|--------------------------------------------------------------------------
*/

router.get(
  '/my',

  authenticate,

  validate({
    query:
      validators.myOrdersQuery,
  }),

  controller.listMyOrders,
);

/*
|--------------------------------------------------------------------------
| Registered Customer - Cancellation Request
|--------------------------------------------------------------------------
|
| POST /api/v1/orders/my/:id/cancellation
|
| Cancellation remains its own business module.
|--------------------------------------------------------------------------
*/

router.post(
  '/my/:id/cancellation',

  authenticate,

  validate({
    params:
      cancellationValidators
        .orderIdParams,

    body:
      cancellationValidators
        .requestCancellationBody,
  }),

  cancellationController
    .createRequest,
);

/*
|--------------------------------------------------------------------------
| Registered Customer - Single Order
|--------------------------------------------------------------------------
|
| GET /api/v1/orders/my/:id
|--------------------------------------------------------------------------
*/

router.get(
  '/my/:id',

  authenticate,

  validate({
    params:
      validators.orderIdParams,
  }),

  controller.getMyOrder,
);

/*
|--------------------------------------------------------------------------
| Guest Order Tracking
|--------------------------------------------------------------------------
|
| POST /api/v1/orders/guest/track
|
| Requires:
|
| orderNumber + email
| OR
| orderNumber + phone
|--------------------------------------------------------------------------
*/

router.post(
  '/guest/track',

  guestTrackingLimiter,

  validate({
    body:
      validators
        .trackGuestOrderBody,
  }),

  controller.trackGuestOrder,
);

/*
|--------------------------------------------------------------------------
| Retail Checkout
|--------------------------------------------------------------------------
|
| POST /api/v1/orders
|
| Supports:
|
| - guest checkout
| - logged-in checkout
|--------------------------------------------------------------------------
*/

router.post(
  '/',

  checkoutLimiter,

  optionalAuth,

  validate({
    body:
      validators
        .createRetailOrderBody,
  }),

  controller.createRetailOrder,
);

module.exports =
  router;