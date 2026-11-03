'use strict';

/*
 * Delivery + payment-eligibility policy (single source of truth).
 *
 * Two SEPARATE questions, deliberately never conflated:
 *
 *   1. DELIVERY  - do we deliver to this address?   Anywhere in Pakistan: YES.
 *   2. PAYMENT   - which payment methods may settle an order for this address?
 *                    - Cash on Delivery ........ Karachi, Sindh ONLY (current temporary policy)
 *                    - JazzCash wallet (manual) . anywhere in Pakistan, once the store has enabled it
 *                                                 and filled in its (non-secret) wallet details
 *                    - JazzCash online gateway . NOT available (not verified/approved; never offered here)
 *                    - USD ..................... no approved payment method (unchanged)
 *
 * "COD unavailable" therefore never means "delivery unavailable".
 * Shipping CHARGES are not decided here: ShippingRule owns them.
 * Used by: POST /shipping/options (what the checkout shows) AND createRetailOrder (what the API enforces),
 * so a hand-made API request cannot get COD for an ineligible location.
 */

const { paymentMethodsFor } = require('../constants/Currency');

const norm = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const PAKISTAN_NAMES = new Set(['pakistan', 'pk', 'pak', 'islamic republic of pakistan']);
const SINDH_NAMES = new Set(['sindh', 'sind']);

function isPakistan(country) {
  // The API default for a missing country is Pakistan (existing contract).
  if (country === undefined || country === null || String(country).trim() === '') return true;
  return PAKISTAN_NAMES.has(norm(country));
}

/** "Karachi", "karachi city", "Karachi East" ... are Karachi. Province, when given, must be Sindh. */
function isKarachi({ city, province } = {}) {
  const c = norm(city);
  if (!(c === 'karachi' || c.startsWith('karachi '))) return false;
  const p = norm(province);
  return p === '' || SINDH_NAMES.has(p);
}

const RIDER_PHONE = /^[+0-9][0-9 ()-]{6,19}$/;
const DELIVERY_METHODS = ['local_rider', 'courier'];

/**
 * Fulfilment method for an order's shipping address.
 * Karachi -> local rider / bike delivery (no courier waybill or tracking URL needed).
 * Everywhere else in Pakistan -> courier (logistics partner + waybill; tracking URL optional).
 */
function assessShipment({ address, shipment } = {}) {
  const karachi = isKarachi(address || {});
  const sh = shipment || {};
  const method = sh.deliveryMethod || (karachi ? 'local_rider' : 'courier');
  if (!DELIVERY_METHODS.includes(method)) return { method, karachi, missing: [], code: 'INVALID_DELIVERY_METHOD' };
  if (method === 'local_rider' && !karachi) return { method, karachi, missing: [], code: 'LOCAL_RIDER_KARACHI_ONLY' };
  const missing = [];
  if (method === 'local_rider') {
    if (!String(sh.riderName || '').trim()) missing.push('rider name');
    if (!RIDER_PHONE.test(String(sh.riderPhone || '').trim())) missing.push('rider phone number');
  } else {
    if (!String(sh.courierName || '').trim()) missing.push('logistics partner');
    if (!String(sh.trackingNumber || '').trim()) missing.push('tracking waybill / consignment number');
  }
  return { method, karachi, missing, code: null };
}

/** Customer-facing, non-secret manual-wallet details from Store Settings (never gateway secrets). */
function manualWalletConfig(settings) {
  const cfg = settings?.checkout?.jazzcashManual || {};
  const walletNumber = String(cfg.walletNumber || '').trim();
  return {
    enabled: cfg.enabled === true && walletNumber.length > 0,
    accountTitle: String(cfg.accountTitle || '').trim(),
    walletNumber,
    instructions: String(cfg.instructions || '').trim(),
  };
}

function assessDelivery({ country, city } = {}) {
  const pakistan = isPakistan(country);
  const cityOk = norm(city).length >= 2;
  return {
    deliverable: pakistan && cityOk,
    country: pakistan ? 'Pakistan' : String(country).trim(),
    reason: !pakistan
      ? 'We currently deliver within Pakistan only.'
      : !cityOk
        ? 'Enter your delivery city.'
        : null,
  };
}

/**
 * What may settle an order for this address / currency. Pure: settings are passed in.
 * Returns { deliverable, methods[], cod{available,reason}, jazzcashManual{available,reason} }.
 */
function paymentOptions({ currency = 'PKR', country, city, province, settings } = {}) {
  const delivery = assessDelivery({ country, city });
  const currencyMethods = paymentMethodsFor(currency);
  const wallet = manualWalletConfig(settings);

  const cod = { available: false, reason: null };
  const jazzcashManual = { available: false, reason: null };

  if (!currencyMethods.length) {
    const reason = currency === 'USD'
      ? 'USD checkout is not available yet: no international payment method is enabled.'
      : 'No payment method is available for this currency.';
    cod.reason = reason;
    jazzcashManual.reason = reason;
  } else if (!delivery.deliverable) {
    cod.reason = delivery.reason;
    jazzcashManual.reason = delivery.reason;
  } else {
    if (!currencyMethods.includes('cod')) cod.reason = 'Cash on Delivery is not available for this currency.';
    else if (settings?.checkout?.codEnabled === false) cod.reason = 'Cash on Delivery is currently switched off.';
    else if (!isKarachi({ city, province })) cod.reason = 'Cash on Delivery is currently available in Karachi only.';
    else cod.available = true;

    if (!currencyMethods.includes('jazzcash_manual')) jazzcashManual.reason = 'JazzCash wallet payment is not available for this currency.';
    else if (!wallet.enabled) jazzcashManual.reason = 'JazzCash wallet payment has not been set up by the store yet.';
    else jazzcashManual.available = true;
  }

  const methods = [];
  if (cod.available) methods.push('cod');
  if (jazzcashManual.available) methods.push('jazzcash_manual');

  return { deliverable: delivery.deliverable, deliveryReason: delivery.reason, methods, cod, jazzcashManual };
}

module.exports = {
  assessShipment,
  DELIVERY_METHODS,
  RIDER_PHONE, isPakistan, isKarachi, manualWalletConfig, assessDelivery, paymentOptions };
