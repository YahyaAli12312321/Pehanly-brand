'use strict';

const mongoose = require('mongoose');
const logger = require('../config/logger');

/*
 * Shared "is this still referenced?" checks for permanent deletion.
 *
 * A product that has ever been ordered, quoted, returned or packed is NEVER hard-deleted: orders keep a name and SKU
 * snapshot, but the references would dangle and the admin would lose the link from an order line back to the product.
 * Such a product is blocked with an explanation; the admin deactivates it instead. Only a product nothing points at is
 * removed, together with the records that exist solely to describe it (variants, SKUs, its stock ledger, its reviews).
 *
 * Two rules keep this safe rather than merely convenient:
 *   - models are resolved by direct require, so a module that simply has not been imported yet can never be mistaken
 *     for "no references" (which would have allowed deleting a product that real orders point at);
 *   - if a check cannot be run at all, the record is reported as blocked, never as safe, and the real error is logged
 *     with the model name so the cause is visible in the server log.
 */

/** A model file that is absent from a given deployment yields null rather than crashing the module. */
function loadModel(name, file) {
  try {
    return require(`../models/${file}`);
  } catch (err) {
    if (err?.code !== 'MODULE_NOT_FOUND') throw err;
    logger.warn({ model: name }, 'Delete checks: model not available in this deployment');
    return null;
  }
}

const MODELS = {
  Order: loadModel('Order', 'order.model'),
  Quote: loadModel('Quote', 'Quote'),
  ReturnRefundRequest: loadModel('ReturnRefundRequest', 'ReturnRefundRequest'),
  Wholesale: loadModel('Wholesale', 'Wholesale'),
  Product: loadModel('Product', 'Product'),
  Category: loadModel('Category', 'Category'),
};

/** `{ count, failed }` - `failed` means the question could not be answered, which blocks the delete. */
async function countRefs(name, filter) {
  const Model = MODELS[name];
  if (!Model) return { count: 0, failed: false };

  try {
    return { count: await Model.countDocuments(filter), failed: false };
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack, model: name }, 'Delete check query failed');
    return { count: 0, failed: true };
  }
}

const toId = (value) => new mongoose.Types.ObjectId(String(value));

/** "1 sub-category" / "2 sub-categories" / "3 orders". Done once here so every caller shows the same wording. */
function plural(label, count, pluralLabel) {
  if (count === 1) return `1 ${label}`;
  const word = pluralLabel || (/[^aeiou]y$/.test(label) ? `${label.slice(0, -1)}ies` : `${label}s`);
  return `${count} ${word}`;
}

/** Turns the raw counts into the blocker list the admin sees; a failed check becomes its own blocker. */
function toBlockers(entries) {
  const blockers = entries
    .filter(([, res]) => res.count > 0)
    .map(([meta, res]) => ({ key: meta.key, label: meta.label, count: res.count, text: plural(meta.label, res.count, meta.plural) }));

  const failed = entries.filter(([, res]) => res.failed).map(([meta]) => meta.key);
  if (failed.length) {
    const label = 'reference that could not be checked (see the server log)';
    blockers.push({ key: 'unverified', label, count: failed.length, text: plural(label, failed.length) });
  }

  return blockers;
}

/**
 * What still points at this product. Each entry is `{ key, label, count }`, ready to show to the admin.
 * An empty array means the product can be removed permanently.
 */
async function productBlockers(productId) {
  const id = toId(productId);

  const [orders, returns, quotes, packs] = await Promise.all([
    countRefs('Order', { 'items.product': id }),
    countRefs('ReturnRefundRequest', { 'items.product': id }),
    countRefs('Quote', { 'items.product': id }),
    // Wholesale packs and requests share one collection, discriminated by documentType.
    countRefs('Wholesale', { $or: [{ 'items.product': id }, { colorProduct: id }] }),
  ]);

  return toBlockers([
    [{ key: 'orders', label: 'order' }, orders],
    [{ key: 'returns', label: 'return or refund request' }, returns],
    [{ key: 'quotes', label: 'quote' }, quotes],
    [{ key: 'packs', label: 'wholesale pack or request', plural: 'wholesale packs or requests' }, packs],
  ]);
}

/** What still sits inside this category: its own sub-categories and the products in its subtree. */
async function categoryBlockers(categoryId, subtreeIds) {
  const id = toId(categoryId);
  const ids = (subtreeIds || []).map(toId);

  const [children, products] = await Promise.all([
    countRefs('Category', { parentCategory: id }),
    countRefs('Product', { category: { $in: ids.length ? ids : [id] } }),
  ]);

  return toBlockers([
    [{ key: 'subcategories', label: 'sub-category' }, children],
    [{ key: 'products', label: 'product' }, products],
  ]);
}

/** "2 orders and 1 quote" - the human half of the error message. */
function describe(blockers) {
  const parts = blockers.map((b) => b.text || plural(b.label, b.count, b.plural));
  if (parts.length <= 1) return parts[0] || '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

module.exports = { productBlockers, categoryBlockers, describe, plural, _models: MODELS };
