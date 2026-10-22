'use strict';

const router =
  require('express').Router();

const {
  validate,
} = require('../middleware/validate');

const asyncHandler =
  require('../utils/asyncHandler');

const controller =
  require('../controllers/analytics.controller');

const {
  analyticsQuery,
} = require(
  '../validators/analytics.validators',
);

/*
|--------------------------------------------------------------------------
| Complete Analytics Dashboard
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  validate({
    query:
      analyticsQuery,
  }),
  asyncHandler(
    controller.getAnalyticsDashboard,
  ),
);

module.exports = router;