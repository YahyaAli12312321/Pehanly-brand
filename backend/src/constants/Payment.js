'use strict';

const { enumList } = require('../utils/enumList');

const {
  PAYMENT_STATUSES,
} = require('./Order');

/*
 * COD is the live V1 method. JazzCash is listed for the data model only;
 * the gateway itself is deferred (checkout validators accept COD only).
 */
const PAYMENT_GATEWAYS = enumList({
  COD: 'cod',
  JAZZCASH: 'jazzcash',
});

const PAYMENT_CURRENCIES = Object.freeze([
  'PKR',
]);

const PAYMENT_GATEWAY_LABELS =
  Object.freeze({
    cod: 'COD Cash',
    jazzcash: 'JazzCash',
  });

module.exports = {
  PAYMENT_GATEWAYS,
  PAYMENT_STATUSES,
  PAYMENT_CURRENCIES,
  PAYMENT_GATEWAY_LABELS,
};
