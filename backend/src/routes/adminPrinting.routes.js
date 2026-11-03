'use strict';

const router =
  require('express').Router();

const {
  validate,
} = require('../middleware/validate');

const asyncHandler =
  require('../utils/asyncHandler');

const controller =
  require('../controllers/printing.controller');

const {
  createPrintingServiceBody,
  updatePrintingServiceBody,

  reviewPrintingRequestBody,
  approvePrintingRequestBody,
  rejectPrintingRequestBody,

  printingIdParams,

  adminPrintingServicesQuery,
  adminPrintingRequestsQuery,
} = require(
  '../validators/printing.validators',
);

/*
|--------------------------------------------------------------------------
| Services
|--------------------------------------------------------------------------
*/

router.post(
  '/services',
  validate({
    body:
      createPrintingServiceBody,
  }),
  asyncHandler(
    controller.createService,
  ),
);

router.get(
  '/services',
  validate({
    query:
      adminPrintingServicesQuery,
  }),
  asyncHandler(
    controller.listAdminServices,
  ),
);

router.get(
  '/services/:id',
  validate({
    params:
      printingIdParams,
  }),
  asyncHandler(
    controller.getAdminService,
  ),
);

router.patch(
  '/services/:id',
  validate({
    params:
      printingIdParams,

    body:
      updatePrintingServiceBody,
  }),
  asyncHandler(
    controller.updateService,
  ),
);

router.delete(
  '/services/:id',
  validate({
    params:
      printingIdParams,
  }),
  asyncHandler(
    controller.deleteService,
  ),
);

/*
|--------------------------------------------------------------------------
| Requests
|--------------------------------------------------------------------------
*/

router.get(
  '/requests',
  validate({
    query:
      adminPrintingRequestsQuery,
  }),
  asyncHandler(
    controller.listAdminRequests,
  ),
);

router.get(
  '/requests/:id',
  validate({
    params:
      printingIdParams,
  }),
  asyncHandler(
    controller.getAdminRequest,
  ),
);

router.patch(
  '/requests/:id/review',
  validate({
    params:
      printingIdParams,

    body:
      reviewPrintingRequestBody,
  }),
  asyncHandler(
    controller.reviewRequest,
  ),
);

router.patch(
  '/requests/:id/approve',
  validate({
    params:
      printingIdParams,

    body:
      approvePrintingRequestBody,
  }),
  asyncHandler(
    controller.approveRequest,
  ),
);

router.patch(
  '/requests/:id/reject',
  validate({
    params:
      printingIdParams,

    body:
      rejectPrintingRequestBody,
  }),
  asyncHandler(
    controller.rejectRequest,
  ),
);

module.exports = router;