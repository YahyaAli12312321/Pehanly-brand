'use strict';

const StoreSettings = require('../models/StoreSettings');
const audit = require('./audit.service');
const cache = require('./cache.service');
const {
  CURRENCIES,
  DEFAULT_CURRENCY,
  PAYMENT_METHODS_BY_CURRENCY,
} = require('../constants/Currency');

const KEY = 'store';

/** Flatten { a: { b: 1 } } into { 'a.b': 1 } so a PATCH only touches the fields it sends. */
function flatten(object, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined) continue;

    const path = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      flatten(value, path, out);
    } else {
      out[path] = value;
    }
  }

  return out;
}

async function getSettings() {
  // upsert + $setOnInsert is race-safe: two first requests cannot create two documents
  // (the unique key index also guards it).
  try {
    return await StoreSettings.findOneAndUpdate(
      { key: KEY },
      { $setOnInsert: { key: KEY } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  } catch (error) {
    if (error?.code === 11000) {
      return StoreSettings.findOne({ key: KEY }).lean();
    }
    throw error;
  }
}

/** Safe subset for the public storefront. No internal ids or audit fields. */
async function getPublicSettings() {
  return cache.remember('settings:public', 60, buildPublicSettings);
}

async function buildPublicSettings() {
  const s = await getSettings();

  return {
    storeName: s.storeName,
    tagline: s.tagline,
    currency: s.currency,
    // Storefront currencies. paymentMethods is what checkout can really settle
    // per currency (USD is empty until an international provider is approved).
    currencies: {
      base: s.currency || DEFAULT_CURRENCY,
      supported: CURRENCIES,
      paymentMethods: PAYMENT_METHODS_BY_CURRENCY,
    },
    contact: s.contact || {},
    social: s.social || {},
    checkout: {
      guestCheckoutEnabled: s.checkout?.guestCheckoutEnabled !== false,
      codEnabled: s.checkout?.codEnabled !== false,
      jazzcashEnabled: Boolean(s.checkout?.jazzcashEnabled),
    },
    returns: {
      enabled: s.returns?.enabled !== false,
      windowDays: s.returns?.windowDays ?? 7,
    },
    announcement: s.announcement?.enabled
      ? { text: s.announcement.text, link: s.announcement.link }
      : null,
  };
}

async function updateSettings(patch, actor, req) {
  await getSettings();

  const set = flatten(patch);
  set.updatedBy = actor.id || actor._id;

  const updated = await StoreSettings.findOneAndUpdate(
    { key: KEY },
    { $set: set },
    { new: true, runValidators: true },
  ).lean();

  await cache.invalidate('settings:public');

  await audit.record(actor, 'settings.updated', 'StoreSettings', updated._id, {
    fields: Object.keys(set).filter((field) => field !== 'updatedBy'),
  }, req);

  return updated;
}

module.exports = {
  getSettings,
  getPublicSettings,
  updateSettings,
};
