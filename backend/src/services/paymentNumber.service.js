'use strict';

const {
  nextSequence,
} = require('./counter.services');

const PAYMENT_COUNTER_KEY = 'payment';
const PAYMENT_PREFIX = 'PAY';
const PAYMENT_NUMBER_LENGTH = 6;

async function generatePaymentNumber(
  options = {},
) {
  const sequence =
    await nextSequence(
      PAYMENT_COUNTER_KEY,
      options,
    );

  return `${PAYMENT_PREFIX}-${String(
    sequence,
  ).padStart(
    PAYMENT_NUMBER_LENGTH,
    '0',
  )}`;
}

module.exports = {
  generatePaymentNumber,
};