'use strict';

/*
 * Storefront currencies.
 *
 * PKR is the base/legacy currency: every existing document is PKR and stays PKR.
 * USD is a merchant-entered selling price (never an FX conversion of PKR).
 *
 * PAYMENT_METHODS_BY_CURRENCY is the single source of truth for which payment
 * methods may settle an order in a currency. V1 ships COD (PKR). There is NO
 * approved international provider yet, so USD has no payment method and a USD
 * order is refused at checkout (USD_PAYMENT_UNAVAILABLE) instead of being faked
 * or silently converted to PKR.
 */
const CURRENCIES = Object.freeze(['PKR', 'USD']);
const DEFAULT_CURRENCY = 'PKR';

const PAYMENT_METHODS_BY_CURRENCY = Object.freeze({
  PKR: Object.freeze(['cod']),
  USD: Object.freeze([]),
});

/** Field names that hold the USD variant of a PKR money field. */
const USD_FIELDS = Object.freeze({
  price: 'priceUSD',
  compareAtPrice: 'compareAtPriceUSD',
});

function isSupportedCurrency(value) {
  return CURRENCIES.includes(value);
}

function normalizeCurrency(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_CURRENCY;
  const upper = String(value).trim().toUpperCase();
  return isSupportedCurrency(upper) ? upper : null;
}

function paymentMethodsFor(currency) {
  return PAYMENT_METHODS_BY_CURRENCY[currency] || [];
}

/** Round to 2 decimals via integer minor units (avoids 0.1 + 0.2 style float drift). */
function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Sum a list of money numbers in integer minor units. */
function sumMoney(values) {
  return values.reduce((sum, v) => sum + Math.round(Number(v) * 100), 0) / 100;
}

module.exports = {
  CURRENCIES,
  DEFAULT_CURRENCY,
  PAYMENT_METHODS_BY_CURRENCY,
  USD_FIELDS,
  isSupportedCurrency,
  normalizeCurrency,
  paymentMethodsFor,
  roundMoney,
  sumMoney,
};
