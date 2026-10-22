'use strict';

const {
  nextSequence,
} = require(
  './counter.services',
);

const CUSTOMER_COUNTER_KEY =
  'customer';

const CUSTOMER_PREFIX =
  'CUST';

const CUSTOMER_NUMBER_LENGTH =
  6;

async function generateCustomerNumber(
  options = {},
) {
  const sequence =
    await nextSequence(
      CUSTOMER_COUNTER_KEY,
      options,
    );

  return `${CUSTOMER_PREFIX}-${String(
    sequence,
  ).padStart(
    CUSTOMER_NUMBER_LENGTH,
    '0',
  )}`;
}

module.exports = {
  generateCustomerNumber,
};