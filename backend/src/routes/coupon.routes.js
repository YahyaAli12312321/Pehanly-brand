'use strict';

const router = require('express').Router();

const controller =
  require('../controllers/coupon.controller');

const validators =
  require('../validators/coupon.validators');

const validate =
  require('../middleware/validate');

const {
  authenticate,
} = require('../middleware/auth');

router.use(authenticate);

/*
|--------------------------------------------------------------------------
| POST /api/v1/coupons/validate
|--------------------------------------------------------------------------
*/

router.post(
  '/validate',

  validate({
    body: validators.validateBody,
  }),

  controller.validate,
);

module.exports = router;