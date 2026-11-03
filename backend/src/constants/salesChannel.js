'use strict';
/**
 * Where a product is sold.
 *   retail     - storefront only (not available to wholesale)
 *   wholesale  - wholesale only: never appears in retail listings, search, product pages or retail checkout
 *   both       - retail storefront AND wholesale
 *
 * `Product.salesChannel` is optional on purpose, so every product that existed before this field keeps working with
 * no data migration: a missing value is derived from the old `wholesale.isEnabled` flag (enabled -> both, else retail).
 */
const SALES_CHANNELS = Object.freeze({ RETAIL: 'retail', WHOLESALE: 'wholesale', BOTH: 'both' });
const SALES_CHANNEL_VALUES = Object.freeze(Object.values(SALES_CHANNELS));

/** The effective channel of a product (lean object or document). */
function effectiveChannel(product) {
  const explicit = product?.salesChannel;
  if (SALES_CHANNEL_VALUES.includes(explicit)) return explicit;
  return product?.wholesale?.isEnabled ? SALES_CHANNELS.BOTH : SALES_CHANNELS.RETAIL;
}

const isRetailVisible = (product) => effectiveChannel(product) !== SALES_CHANNELS.WHOLESALE;
const isWholesaleSellable = (product) => effectiveChannel(product) !== SALES_CHANNELS.RETAIL && Boolean(product?.wholesale?.isEnabled);

/** Mongo condition that every RETAIL query (listing, search, detail, checkout lookups) must include. Matches legacy products with no field. */
const RETAIL_VISIBLE_FILTER = Object.freeze({ salesChannel: { $ne: SALES_CHANNELS.WHOLESALE } });

/** Mongo condition for an admin "channel" filter, equivalent to effectiveChannel(). */
function channelFilter(channel) {
  if (channel === SALES_CHANNELS.WHOLESALE) return { salesChannel: SALES_CHANNELS.WHOLESALE };
  if (channel === SALES_CHANNELS.BOTH) return { $or: [{ salesChannel: SALES_CHANNELS.BOTH }, { salesChannel: { $exists: false }, 'wholesale.isEnabled': true }] };
  if (channel === SALES_CHANNELS.RETAIL) return { $or: [{ salesChannel: SALES_CHANNELS.RETAIL }, { salesChannel: { $exists: false }, 'wholesale.isEnabled': { $ne: true } }] };
  return {};
}

module.exports = { SALES_CHANNELS, SALES_CHANNEL_VALUES, effectiveChannel, isRetailVisible, isWholesaleSellable, RETAIL_VISIBLE_FILTER, channelFilter };
