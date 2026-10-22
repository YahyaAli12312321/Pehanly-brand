'use strict';

const router =
  require('express').Router();

const controller =
  require('../controllers/shippingRule.controller');

const validators =
  require('../validators/shippingRule.validators');

const validate =
  require('../middleware/validate');

/*
|--------------------------------------------------------------------------
| Public Shipping Estimate
|--------------------------------------------------------------------------
|
| POST /api/v1/shipping/calculate
|--------------------------------------------------------------------------
*/

router.post(
  '/calculate',

  validate({
    body:
      validators.calculateBody,
  }),

  controller.calculate,
);

/*
|--------------------------------------------------------------------------
| Public Free-Shipping Info
|--------------------------------------------------------------------------
|
| GET /api/v1/shipping/free-shipping
|--------------------------------------------------------------------------
*/

router.get(
  '/free-shipping',
  validate({
    query:
      validators.freeShippingQuery,
  }),
  controller.freeShippingInfo,
);

module.exports =
  router;