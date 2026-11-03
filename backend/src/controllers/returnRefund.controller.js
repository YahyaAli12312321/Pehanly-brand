'use strict';

const asyncHandler = require('../utils/asyncHandler');
const response = require('../utils/apiResponse');

const returnRefundService =
  require('../services/returnRefund.service');

const createCustomerReturn = asyncHandler(
  async (req, res) => {
    const request =
      await returnRefundService.createCustomerReturn({
        orderId: req.validated.params.id,
        userId: req.user.id,

        items: req.validated.body.items,
        reason: req.validated.body.reason,
        images: req.validated.body.images,
        customerNote:
          req.validated.body.customerNote,
      });

    return response.created(res, {
      data: request,
      message:
        'Return request created successfully',
    });
  },
);

const getMyReturns = asyncHandler(
  async (req, res) => {
    const result =
      await returnRefundService.getCustomerReturns({
        userId: req.user.id,
        ...req.validated.query,
      });

    return response.success(res, {
      data: result.requests,
      message:
        'Return requests fetched successfully',
      meta: result.meta,
    });
  },
);

const getMyReturn = asyncHandler(
  async (req, res) => {
    const request =
      await returnRefundService.getCustomerReturn({
        requestId: req.validated.params.id,
        userId: req.user.id,
      });

    return response.success(res, {
      data: request,
      message:
        'Return request fetched successfully',
    });
  },
);

const listAdminReturns = asyncHandler(
  async (req, res) => {
    const result =
      await returnRefundService.listAdminReturns(
        req.validated.query,
      );

    return response.success(res, {
      data: result.requests,
      message:
        'Return requests fetched successfully',
      meta: result.meta,
    });
  },
);

const getAdminReturn = asyncHandler(
  async (req, res) => {
    const request =
      await returnRefundService.getAdminReturn(
        req.validated.params.id,
      );

    return response.success(res, {
      data: request,
      message:
        'Return request fetched successfully',
    });
  },
);

const reviewReturn = asyncHandler(
  async (req, res) => {
    const request =
      await returnRefundService.reviewReturn({
        requestId: req.validated.params.id,
        action: req.validated.body.action,
        note: req.validated.body.note,
        adminUserId: req.user.id,
      });

    return response.success(res, {
      data: request,
      message:
        req.validated.body.action === 'approve'
          ? 'Return request approved successfully'
          : 'Return request rejected successfully',
    });
  },
);

const markReceived = asyncHandler(
  async (req, res) => {
    const request =
      await returnRefundService.markReceived({
        requestId: req.validated.params.id,
        adminUserId: req.user.id,
        note: req.validated.body.note,
      });

    return response.success(res, {
      data: request,
      message:
        'Return marked as received successfully',
    });
  },
);

const inspectReturn = asyncHandler(
  async (req, res) => {
    const request =
      await returnRefundService.inspectReturn({
        requestId: req.validated.params.id,
        adminUserId: req.user.id,
        items: req.validated.body.items,
        note: req.validated.body.note,
      });

    return response.success(res, {
      data: request,
      message:
        'Return inspection completed successfully',
    });
  },
);

const prepareRefund = asyncHandler(
  async (req, res) => {
    const request =
      await returnRefundService.prepareRefund({
        requestId: req.validated.params.id,
        paymentId:
          req.validated.body.paymentId,
        amount: req.validated.body.amount,
        adminUserId: req.user.id,
      });

    return response.success(res, {
      data: request,
      message:
        'Refund prepared successfully',
    });
  },
);

const completeCodRefund = asyncHandler(
  async (req, res) => {
    const request =
      await returnRefundService.completeCodRefund({
        requestId: req.validated.params.id,
        adminUserId: req.user.id,
      });

    return response.success(res, {
      data: request,
      message:
        'COD refund completed successfully',
    });
  },
);

module.exports = {
  createCustomerReturn,
  getMyReturns,
  getMyReturn,

  listAdminReturns,
  getAdminReturn,

  reviewReturn,
  markReceived,
  inspectReturn,

  prepareRefund,
  completeCodRefund,
};