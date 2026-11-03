'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/apiResponse');

const cancellationService = require('../services/cancellation.service');

/**
 * POST /api/v1/orders/my/:id/cancellation
 */
exports.createRequest = asyncHandler(async (req, res) => {
  const request = await cancellationService.createCustomerRequest(
    req.user.id,
    req.validated.params.id,
    req.validated.body,
  );

  return created(res, {
    data: request,
    message: 'Cancellation request submitted successfully',
  });
});

/**
 * GET /api/v1/admin/cancellations
 */
exports.listRequests = asyncHandler(async (req, res) => {
  const result = await cancellationService.listRequests(req.validated.query);

  return success(res, {
    data: result.requests,
    meta: result.meta,
    message: 'Cancellation requests fetched successfully',
  });
});

/**
 * PATCH /api/v1/admin/cancellations/:id/review
 */
exports.reviewRequest = asyncHandler(async (req, res) => {
  const request = await cancellationService.reviewRequest(
    req.validated.params.id,
    req.validated.body,
    req.user,
  );

  return success(res, {
    data: request,
    message:
      req.validated.body.action === 'approve'
        ? 'Cancellation approved successfully'
        : 'Cancellation rejected successfully',
  });
});
