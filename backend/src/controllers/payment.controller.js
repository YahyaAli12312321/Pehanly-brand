'use strict';

const asyncHandler =
  require('../utils/asyncHandler');

const {
  success,
  created,
} = require('../utils/apiResponse');

const paymentService =
  require('../services/payment.service');

const jazzcashService =
  require('../services/jazzcash.service');

const { config } = require('../config/env');
const logger = require('../config/logger');

/*
|--------------------------------------------------------------------------
| Customer - Create COD Payment
|--------------------------------------------------------------------------
*/

exports.createCodPayment =
  asyncHandler(async (req, res) => {
    const payment =
      await paymentService.createCodPayment({
        orderId:
          req.validated.params.orderId,

        actor:
          req.user || null,
      });

    return created(res, {
      data: payment,
      message:
        'COD payment created successfully',
    });
  });

/*
|--------------------------------------------------------------------------
| Customer - Get Own Payment Status
|--------------------------------------------------------------------------
*/

exports.getPaymentStatus =
  asyncHandler(async (req, res) => {
    const payment =
      await paymentService
        .getCustomerPaymentStatus({
          paymentId:
            req.validated.params.id,

          actor:
            req.user,
        });

    return success(res, {
      data: payment,
      message:
        'Payment status fetched successfully',
    });
  });

/*
|--------------------------------------------------------------------------
| Admin - Confirm COD Payment
|--------------------------------------------------------------------------
*/

exports.confirmCodPayment =
  asyncHandler(async (req, res) => {
    const payment =
      await paymentService
        .confirmCodPayment({
          paymentId:
            req.validated.params.id,

          actor:
            req.user,
        });

    return success(res, {
      data: payment,
      message:
        'COD payment confirmed successfully',
    });
  });

/*
|--------------------------------------------------------------------------
| Admin - Payment Detail
|--------------------------------------------------------------------------
*/

exports.getPayment =
  asyncHandler(async (req, res) => {
    const payment =
      await paymentService
        .getPaymentById(
          req.validated.params.id,
        );

    return success(res, {
      data: payment,
      message:
        'Payment fetched successfully',
    });
  });

/*
|--------------------------------------------------------------------------
| Admin - Payment Ledger
|--------------------------------------------------------------------------
*/

exports.listPayments =
  asyncHandler(async (req, res) => {
    const {
      items,
      meta,
    } =
      await paymentService
        .listPayments(
          req.validated.query,
        );

    return success(res, {
      data: items,
      meta,
      message:
        'Payments fetched successfully',
    });
  });

/*
|--------------------------------------------------------------------------
| Admin - Summary
|--------------------------------------------------------------------------
*/

exports.getPaymentSummary =
  asyncHandler(async (_req, res) => {
    const summary =
      await paymentService
        .getPaymentSummary();

    return success(res, {
      data: summary,
      message:
        'Payment summary fetched successfully',
    });
  });

/*
|--------------------------------------------------------------------------
| JazzCash - Initiate (sandbox-ready, not live-verified)
|--------------------------------------------------------------------------
|
| Returns the signed form the browser must POST to JazzCash.
|--------------------------------------------------------------------------
*/

exports.initiateJazzcash =
  asyncHandler(async (req, res) => {
    const data = await jazzcashService.initiate({
      orderId: req.validated.params.orderId,
      actor: req.user || null,
    });

    return created(res, {
      data,
      message: 'JazzCash checkout prepared',
    });
  });

/*
|--------------------------------------------------------------------------
| JazzCash - Return URL (called by the customer's browser, POSTed by JazzCash)
|--------------------------------------------------------------------------
|
| Authenticated by the HMAC secure hash, not by a cookie. Always ends in a
| redirect to the storefront result page so the customer never sees raw JSON.
|--------------------------------------------------------------------------
*/

exports.jazzcashReturn =
  asyncHandler(async (req, res) => {
    const resultUrl = (status, orderId) => {
      const url = new URL('/payment/result', config.clientUrl);
      url.searchParams.set('status', status);
      if (orderId) url.searchParams.set('order', orderId);
      return url.toString();
    };

    try {
      const { outcome, orderId } =
        await jazzcashService.handleReturn(req.body || {});

      return res.redirect(303, resultUrl(outcome, orderId));
    } catch (error) {
      logger.warn(
        { code: error?.code },
        'JazzCash return could not be processed',
      );

      return res.redirect(303, resultUrl('error'));
    }
  });
