'use strict';

/**
 * Product audience (who a product is designed for).
 *
 *  - Product.audience is optional: men | women | unisex.
 *  - A product WITHOUT its own audience inherits the audience of its category (categories already carry a
 *    free-form `audience`). That is the safe default for existing data: nothing is reclassified as unisex.
 *  - Shopping "Men" returns men + unisex; "Women" returns women + unisex; explicit "unisex" returns unisex only.
 *    Men-only never appears under Women and the other way round.
 */
const mongoose = require('mongoose');
const Category = require('../models/Category');

const AUDIENCES = ['men', 'women', 'unisex'];

/** Audiences a shopper browsing `audience` should see. */
const visibleAudiences = (audience) => (audience === 'unisex' ? ['unisex'] : [audience, 'unisex']);

/**
 * Mongo condition for Product matching `audience`, honouring the category fallback for products that have
 * no audience of their own. Returns null when no (valid) audience was requested.
 */
async function audienceCondition(audience, categoryService) {
  if (!AUDIENCES.includes(audience)) return null;
  const set = visibleAudiences(audience);
  const roots = await Category.find({ audience: { $in: set } }).select('_id').lean();
  const ids = new Set();
  for (const r of roots) {
    const subtree = categoryService ? await categoryService.subtreeIds(r._id) : [String(r._id)];
    subtree.forEach((i) => ids.add(String(i)));
  }
  const inherited = [...ids].map((i) => new mongoose.Types.ObjectId(i));
  return {
    $or: [
      { audience: { $in: set } },
      ...(inherited.length ? [{ audience: { $in: [null] }, category: { $in: inherited } }] : []),
    ],
  };
}

module.exports = { AUDIENCES, visibleAudiences, audienceCondition };
