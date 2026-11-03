'use strict';

const { nextSequence } = require('./counter.services');

const ORDER_COUNTER_KEY = 'order';
const ORDER_PREFIX = 'PH';
const ORDER_NUMBER_LENGTH = 6;

async function generateOrderNumber(options = {}) {
  const sequence = await nextSequence(
    ORDER_COUNTER_KEY,
    options,
  );

  return `${ORDER_PREFIX}-${String(sequence).padStart(
    ORDER_NUMBER_LENGTH,
    '0',
  )}`;
}

module.exports = {
  generateOrderNumber,
};