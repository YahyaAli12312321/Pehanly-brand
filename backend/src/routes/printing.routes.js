'use strict';

const router =
  require('express').Router();

const {
  authenticate,
} = require('../middleware/auth');

const {
  validate,
} = require('../middleware/validate');

const asyncHandler =
  require('../utils/asyncHandler');

const controller =
  require('../controllers/printing.controller');

const {
  createPrintingRequestBody,
  printingIdParams,
  publicPrintingServicesQuery,
  myPrintingRequestsQuery,
} = require(
  '../validators/printing.validators',
);

/*
|--------------------------------------------------------------------------
| Public Services
|--------------------------------------------------------------------------
*/

router.get(
  '/services',
  validate({
    query:
      publicPrintingServicesQuery,
  }),
  asyncHandler(
    controller.listPublicServices,
  ),
);

router.get(
  '/services/:id',
  validate({
    params:
      printingIdParams,
  }),
  asyncHandler(
    controller.getPublicService,
  ),
);

/*
|--------------------------------------------------------------------------
| Customer Requests
|--------------------------------------------------------------------------
*/

router.post(
  '/requests',
  authenticate,
  validate({
    body:
      createPrintingRequestBody,
  }),
  asyncHandler(
    controller.createRequest,
  ),
);

router.get(
  '/my',
  authenticate,
  validate({
    query:
      myPrintingRequestsQuery,
  }),
  asyncHandler(
    controller.listMyRequests,
  ),
);

router.get(
  '/my/:id',
  authenticate,
  validate({
    params:
      printingIdParams,
  }),
  asyncHandler(
    controller.getMyRequest,
  ),
);

module.exports = router;