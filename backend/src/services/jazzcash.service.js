'use strict';

/*
|--------------------------------------------------------------------------
| JazzCash - Hosted Page Redirection (SANDBOX-READY, NOT LIVE-VERIFIED)
|--------------------------------------------------------------------------
|
| Implements the publicly documented "Page Redirection" flow:
|
|   1. server builds a signed form payload  (buildCheckout)
|   2. browser POSTs it to JazzCash          (frontend auto-submits a form)
|   3. JazzCash POSTs the result to our return URL (handleReturn)
|
| STATUS
|   - The signing / verification logic is covered by unit tests, but those
|     tests prove internal consistency only.
|   - It has NOT been run against the JazzCash sandbox or production. Field
|     names, the hash recipe and the response codes must be confirmed against
|     the integration manual and sandbox credentials issued to YOUR merchant
|     account before any live use.
|   - No card data ever reaches this server: the customer enters wallet/card
|     details on JazzCash's own page.
|
| SECRETS
|   Merchant ID, password and integrity salt come ONLY from environment
|   variables. They are never stored in MongoDB, logged or returned.
|--------------------------------------------------------------------------
*/

const crypto = require('crypto');
const mongoose = require('mongoose');

const { config } = require('../config/env');
const logger = require('../config/logger');
const Payment = require('../models/Payment');
const Order = require('../models/order.model');
const ApiError = require('../utils/ApiError');
const { generatePaymentNumber } = require('./paymentNumber.service');
const settingsService = require('./settings.service');
const adminNotificationEvents = require('./adminNotificationEvents.service');

const SANDBOX_CHECKOUT_URL =
  'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';

const API_VERSION = '1.1';
const SUCCESS_CODE = '000';
const PAKISTAN_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;
const EXPIRY_MINUTES = 60;

function assertConfigured() {
  if (!config.jazzcash.configured) {
    throw new ApiError(503, 'JazzCash is not configured', 'JAZZCASH_NOT_CONFIGURED');
  }
}

function checkoutUrl() {
  return config.jazzcash.env === 'live'
    ? config.jazzcash.checkoutUrl
    : config.jazzcash.checkoutUrl || SANDBOX_CHECKOUT_URL;
}

/** yyyyMMddHHmmss in Pakistan time. */
function formatPakistanTime(date) {
  const shifted = new Date(date.getTime() + PAKISTAN_UTC_OFFSET_MS);
  return shifted.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/** Transaction reference: max 20 chars, unique per attempt. */
function newTxnRef(date) {
  // 'T' + 14 digit timestamp + 5 random digits = 20 characters (gateway maximum).
  const random = crypto.randomInt(0, 100_000).toString().padStart(5, '0');
  return `T${formatPakistanTime(date)}${random}`;
}

/** Amount in the smallest unit (paisa), integer string. */
function toPaisa(amount) {
  return String(Math.round(Number(amount) * 100));
}

/**
 * HMAC-SHA256 over:  salt & value1 & value2 ...
 * where the values are those of every non-empty `pp_*` field (except
 * pp_SecureHash) ordered alphabetically by field name. Upper-case hex.
 */
function computeSecureHash(fields, salt) {
  const keys = Object.keys(fields)
    .filter((key) => key.startsWith('pp') && key !== 'pp_SecureHash')
    .filter((key) => fields[key] !== undefined && fields[key] !== null && String(fields[key]) !== '')
    .sort();

  const message = [salt, ...keys.map((key) => String(fields[key]))].join('&');

  return crypto.createHmac('sha256', salt).update(message).digest('hex').toUpperCase();
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyResponseHash(body, salt = config.jazzcash.integritySalt) {
  if (!body || !body.pp_SecureHash) return false;

  return safeEqual(computeSecureHash(body, salt).toLowerCase(), String(body.pp_SecureHash).toLowerCase());
}

function buildCheckoutFields({ payment, order, txnRef, now = new Date() }) {
  const expiry = new Date(now.getTime() + EXPIRY_MINUTES * 60 * 1000);

  const fields = {
    pp_Version: API_VERSION,
    pp_TxnType: '',
    pp_Language: 'EN',
    pp_MerchantID: config.jazzcash.merchantId,
    pp_SubMerchantID: '',
    pp_Password: config.jazzcash.password,
    pp_BankID: '',
    pp_ProductID: '',
    pp_TxnRefNo: txnRef,
    pp_Amount: toPaisa(payment.amount),
    pp_TxnCurrency: 'PKR',
    pp_TxnDateTime: formatPakistanTime(now),
    pp_BillReference: String(order.orderNumber).replace(/[^A-Za-z0-9]/g, ''),
    pp_Description: `Order ${order.orderNumber}`.slice(0, 200),
    pp_TxnExpiryDateTime: formatPakistanTime(expiry),
    pp_ReturnURL: config.jazzcash.returnUrl,
    ppmpf_1: '',
    ppmpf_2: '',
    ppmpf_3: '',
    ppmpf_4: '',
    ppmpf_5: '',
  };

  fields.pp_SecureHash = computeSecureHash(fields, config.jazzcash.integritySalt);

  return fields;
}

function assertOwnership(order, actor) {
  if (actor?.role === 'admin') return;

  const actorId = actor?.id || actor?._id;

  if (!actorId) {
    if (order.user) throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
    return;
  }

  if (!order.user || String(order.user) !== String(actorId)) {
    throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
  }
}

/**
 * Creates a processing JazzCash payment attempt and returns the signed form
 * the browser must POST to JazzCash. The amount ALWAYS comes from the order.
 */
async function initiate({ orderId, actor = null, now = new Date() }) {
  assertConfigured();

  const settings = await settingsService.getSettings();

  if (!settings.checkout?.jazzcashEnabled) {
    throw ApiError.conflict('JazzCash payments are not enabled', 'JAZZCASH_DISABLED');
  }

  const session = await mongoose.startSession();

  try {
    let payment;
    let order;
    let txnRef;

    await session.withTransaction(async () => {
      order = await Order.findById(orderId).session(session);

      if (!order) {
        throw ApiError.notFound('Order not found', 'ORDER_NOT_FOUND');
      }

      assertOwnership(order, actor);

      if (order.orderStatus === 'cancelled') {
        throw ApiError.conflict('Cancelled order cannot be paid', 'ORDER_CANCELLED');
      }

      if (order.paymentStatus === 'paid') {
        throw ApiError.conflict('Order is already paid', 'ORDER_ALREADY_PAID');
      }

      const amount = Number(order.pricing?.total);

      if (!Number.isFinite(amount) || amount <= 0) {
        throw ApiError.conflict('Order has an invalid payable amount', 'INVALID_ORDER_PAYMENT_AMOUNT');
      }

      // Replace any earlier unfinished online attempt; keep one open attempt per order.
      await Payment.updateMany(
        { order: order._id, gateway: 'jazzcash', status: { $in: ['pending', 'processing'] } },
        { $set: { status: 'cancelled', cancelledAt: new Date() } },
        { session },
      );

      // COD placeholder created at checkout is superseded by the online attempt.
      await Payment.updateMany(
        { order: order._id, gateway: 'cod', status: { $in: ['pending', 'processing'] } },
        { $set: { status: 'cancelled', cancelledAt: new Date() } },
        { session },
      );

      txnRef = newTxnRef(now);

      const paymentNumber = await generatePaymentNumber({ session });

      [payment] = await Payment.create(
        [
          {
            paymentNumber,
            order: order._id,
            user: order.user || null,
            gateway: 'jazzcash',
            transactionId: txnRef,
            amount,
            gatewayFee: 0,
            netAmount: amount,
            currency: 'PKR',
            status: 'processing',
          },
        ],
        { session },
      );

      order.paymentStatus = 'processing';
      await order.save({ session });
    });

    return {
      paymentId: String(payment._id),
      paymentNumber: payment.paymentNumber,
      environment: config.jazzcash.env,
      url: checkoutUrl(),
      method: 'POST',
      fields: buildCheckoutFields({ payment, order, txnRef, now }),
    };
  } finally {
    await session.endSession();
  }
}

/**
 * Processes JazzCash's POST to our return URL.
 *
 *  - signature must verify, otherwise the payload is ignored (400)
 *  - the amount must equal the payment we created (no partial / altered pay)
 *  - idempotent: a repeated callback never changes a finished payment
 *
 * Returns { outcome: 'paid' | 'failed' | 'ignored', orderId }.
 */
async function handleReturn(body) {
  assertConfigured();

  if (!verifyResponseHash(body)) {
    logger.warn({ txn: body?.pp_TxnRefNo }, 'JazzCash return rejected: invalid secure hash');
    throw ApiError.badRequest('Invalid payment response', 'JAZZCASH_INVALID_SIGNATURE');
  }

  const txnRef = String(body.pp_TxnRefNo || '');
  const code = String(body.pp_ResponseCode || '');
  const message = String(body.pp_ResponseMessage || '').slice(0, 500);

  const session = await mongoose.startSession();
  let outcome = 'ignored';
  let orderId = null;
  let notifyPaid = null;
  let notifyFailed = null;

  try {
    await session.withTransaction(async () => {
      outcome = 'ignored';
      notifyPaid = null;
      notifyFailed = null;

      const payment = await Payment.findOne({ gateway: 'jazzcash', transactionId: txnRef }).session(session);

      if (!payment) {
        throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
      }

      orderId = payment.order;

      if (toPaisa(payment.amount) !== String(body.pp_Amount)) {
        throw ApiError.badRequest('Payment amount mismatch', 'JAZZCASH_AMOUNT_MISMATCH');
      }

      if (!['pending', 'processing'].includes(payment.status)) {
        return; // already finished: idempotent no-op
      }

      const order = await Order.findById(payment.order).session(session);

      payment.providerResponse = {
        responseCode: code,
        responseMessage: message,
        reference: String(body.pp_RetreivalReferenceNo || body.pp_TxnRefNo || '').slice(0, 200),
      };

      if (code === SUCCESS_CODE) {
        payment.status = 'paid';
        payment.paidAt = new Date();
        payment.failedAt = null;
        outcome = 'paid';

        if (order && order.orderStatus !== 'cancelled') {
          order.paymentStatus = 'paid';
          await order.save({ session });
        }

        notifyPaid = payment.toObject();
      } else {
        payment.status = 'failed';
        payment.failedAt = new Date();
        payment.failureReason = message || `JazzCash response ${code}`;
        outcome = 'failed';

        if (order && order.paymentStatus !== 'paid' && order.orderStatus !== 'cancelled') {
          order.paymentStatus = 'failed';
          await order.save({ session });
        }

        notifyFailed = payment.toObject();
      }

      await payment.save({ session });
    });
  } finally {
    await session.endSession();
  }

  // Post-commit, best effort.
  try {
    if (notifyPaid) await adminNotificationEvents.paymentSuccess(notifyPaid);
    if (notifyFailed) await adminNotificationEvents.paymentFailed(notifyFailed);
  } catch (error) {
    logger.error({ err: error?.message }, 'Payment notification failed (ignored)');
  }

  return { outcome, orderId: orderId ? String(orderId) : null };
}

module.exports = {
  initiate,
  handleReturn,
  // exported for tests
  computeSecureHash,
  verifyResponseHash,
  buildCheckoutFields,
  toPaisa,
  formatPakistanTime,
  newTxnRef,
};
