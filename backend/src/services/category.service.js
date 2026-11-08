'use strict';
const mongoose = require('mongoose');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const { slugify, escapeRegex } = require('../utils/slugify');
const audit = require('./audit.service');
const deletion = require('./deletion.service');

/** Product counts per category. Product model arrives in the catalog module; until then every count is 0. */
async function productCounts(ids) {
  const counts = new Map();
  if (!ids.length || !mongoose.modelNames().includes('Product')) return counts;
  const rows = await mongoose.model('Product').aggregate([
    { $match: { category: { $in: ids } } },
    { $group: { _id: '$category', n: { $sum: 1 } } },
  ]);
  rows.forEach((r) => counts.set(String(r._id), r.n));
  return counts;
}

async function uniqueSlug(base, excludeId) {
  const root = slugify(base) || 'category';
  let slug = root;
  for (let i = 2; i < 200; i += 1) {
    const taken = await Category.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
    if (!taken) return slug;
    slug = `${root}-${i}`;
  }
  throw ApiError.conflict('Could not generate a unique slug', 'SLUG_CONFLICT');
}

async function assertValidParent(parentId, selfId) {
  if (!parentId) return;
  if (selfId && String(parentId) === String(selfId)) {
    throw ApiError.badRequest('A category cannot be its own parent', 'INVALID_PARENT');
  }
  let cursor = await Category.findById(parentId).select('parentCategory');
  if (!cursor) throw ApiError.badRequest('Parent category not found', 'INVALID_PARENT');
  for (let depth = 0; cursor && depth < 25; depth += 1) {
    if (selfId && String(cursor._id) === String(selfId)) {
      throw ApiError.badRequest('A category cannot be moved under its own child', 'INVALID_PARENT');
    }
    cursor = cursor.parentCategory ? await Category.findById(cursor.parentCategory).select('parentCategory') : null;
  }
}

/** All category ids in the subtree rooted at `id` (inclusive). */
async function subtreeIds(id) {
  const ids = [String(id)];
  let frontier = [new mongoose.Types.ObjectId(String(id))];
  for (let depth = 0; frontier.length && depth < 25; depth += 1) {
    const children = await Category.find({ parentCategory: { $in: frontier } }).select('_id').lean();
    frontier = children.map((c) => c._id);
    ids.push(...frontier.map(String));
  }
  return ids;
}

/** True when the category or any ancestor is retail-only (e.g. Ladies Shoes). */
async function isRetailOnly(categoryId) {
  let cursor = await Category.findById(categoryId).select('retailOnly parentCategory').lean();
  for (let depth = 0; cursor && depth < 25; depth += 1) {
    if (cursor.retailOnly) return true;
    cursor = cursor.parentCategory ? await Category.findById(cursor.parentCategory).select('retailOnly parentCategory').lean() : null;
  }
  return false;
}

/** Ids of every category inside a dedicated section (the flagged top-level category and all of its descendants). */
async function dedicatedSectionIds() {
  const roots = await Category.find({ dedicatedSection: true }).select('_id').lean();
  const ids = new Set();
  for (const r of roots) (await subtreeIds(r._id)).forEach((i) => ids.add(i));
  return [...ids];
}

/** New products may only be put in an ACTIVE category whose ancestors are all active. */
async function assertAssignable(categoryId) {
  let cursor = await Category.findById(categoryId).select('isActive parentCategory name').lean();
  if (!cursor) throw ApiError.badRequest('Category not found', 'INVALID_CATEGORY');
  for (let depth = 0; cursor && depth < 25; depth += 1) {
    if (cursor.isActive === false) throw ApiError.badRequest(`Category "${cursor.name}" is inactive: activate it before adding products`, 'CATEGORY_INACTIVE');
    cursor = cursor.parentCategory ? await Category.findById(cursor.parentCategory).select('isActive parentCategory name').lean() : null;
  }
}

/** Same name (case-insensitive) under the same parent is a duplicate. */
async function assertUniqueName(name, parentCategory, selfId) {
  if (!name) return;
  const clash = await Category.exists({
    name: new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i'),
    parentCategory: parentCategory || null,
    ...(selfId ? { _id: { $ne: selfId } } : {}),
  });
  if (clash) throw ApiError.conflict('A category with this name already exists here', 'NAME_CONFLICT');
}

async function assertSectionFlag(input, parentCategory) {
  if (input.dedicatedSection === true && parentCategory) {
    throw ApiError.badRequest('Only a top-level category can be a dedicated section; its sub-categories inherit it', 'INVALID_SECTION');
  }
}

async function list(q) {
  const filter = {};
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ name: re }, { slug: re }];
  }
  if (q.status) filter.isActive = q.status === 'active';
  if (q.audience) filter.audience = q.audience;
  if (q.showOnHome !== undefined) filter.showOnHome = q.showOnHome;
  if (q.parent === 'root') filter.parentCategory = null;
  else if (q.parent) filter.parentCategory = new mongoose.Types.ObjectId(q.parent);

  const dir = q.sortDir === 'desc' ? -1 : 1;
  const sort = { [q.sortBy]: dir, ...(q.sortBy === 'name' ? {} : { name: 1 }) };

  const [total, docs] = await Promise.all([
    Category.countDocuments(filter),
    Category.find(filter).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit).populate('parentCategory', 'name slug').lean(),
  ]);
  const counts = await productCounts(docs.map((d) => d._id));
  const items = docs.map((d) => ({ ...d, productsCount: counts.get(String(d._id)) ?? 0 }));
  return { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

async function summary() {
  const [total, active, showOnHome, topLevel] = await Promise.all([
    Category.countDocuments({}),
    Category.countDocuments({ isActive: true }),
    Category.countDocuments({ showOnHome: true }),
    Category.countDocuments({ parentCategory: null }),
  ]);
  return { total, active, inactive: total - active, showOnHome, topLevel };
}

async function audiences() {
  return (await Category.distinct('audience')).filter(Boolean).sort();
}

async function getById(id) {
  const doc = await Category.findById(id).populate('parentCategory', 'name slug').lean();
  if (!doc) throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');
  const counts = await productCounts([doc._id]);
  return { ...doc, productsCount: counts.get(String(doc._id)) ?? 0 };
}

async function create(input) {
  await assertValidParent(input.parentCategory, null);
  await assertUniqueName(input.name, input.parentCategory, null);
  await assertSectionFlag(input, input.parentCategory);
  const slug = input.slug
    ? input.slug
    : await uniqueSlug(input.name);
  if (input.slug && (await Category.exists({ slug }))) throw ApiError.conflict('This slug is already used', 'SLUG_CONFLICT');
  const doc = await Category.create({ ...input, slug });
  return getById(doc._id);
}

async function update(id, input) {
  const doc = await Category.findById(id);
  if (!doc) throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');
  if ('parentCategory' in input) await assertValidParent(input.parentCategory, id);
  const nextParent = 'parentCategory' in input ? input.parentCategory : doc.parentCategory;
  if (input.name !== undefined && (input.name !== doc.name || 'parentCategory' in input)) await assertUniqueName(input.name, nextParent, id);
  await assertSectionFlag({ dedicatedSection: input.dedicatedSection ?? doc.dedicatedSection }, nextParent);
  if (input.slug && input.slug !== doc.slug && (await Category.exists({ slug: input.slug, _id: { $ne: id } }))) {
    throw ApiError.conflict('This slug is already used', 'SLUG_CONFLICT');
  }
  // Explicit allow-list is enforced by the zod schema (strict); apply field by field.
  if (input.retailOnly === true && !doc.retailOnly && mongoose.modelNames().includes('Product')) {
    const ids = await subtreeIds(id);
    if (await mongoose.model('Product').exists({ category: { $in: ids }, 'wholesale.isEnabled': true })) {
      throw ApiError.conflict('Disable wholesale on products in this category first', 'RETAIL_ONLY_CONFLICT');
    }
  }
  Object.entries(input).forEach(([k, v]) => doc.set(k, v));
  await doc.save();
  return getById(id);
}

async function setStatus(id, isActive) {
  const doc = await Category.findByIdAndUpdate(id, { $set: { isActive } }, { new: true });
  if (!doc) throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');
  return getById(id);
}

/** What a permanent delete would remove, and what is stopping it (sub-categories or products anywhere beneath it). */
async function deletePreview(id) {
  const doc = await Category.findById(id).select('name slug isActive').lean();
  if (!doc) throw ApiError.notFound('Category not found', 'CATEGORY_NOT_FOUND');

  const blockers = await deletion.categoryBlockers(id, await subtreeIds(id));
  return { id: String(doc._id), name: doc.name, slug: doc.slug, blockers, canDelete: blockers.length === 0 };
}

/**
 * Permanently removes an empty category. Refused while it still has sub-categories or products anywhere beneath it,
 * so no product is ever left pointing at a category that no longer exists.
 */
async function remove(id, actor, req) {
  const preview = await deletePreview(id);

  if (!preview.canDelete) {
    throw ApiError.conflict(
      `This category still has ${deletion.describe(preview.blockers)}. Move or delete them first, or deactivate the category instead.`,
      'CATEGORY_NOT_EMPTY',
    );
  }

  await Category.deleteOne({ _id: id });
  await audit.record(actor, 'category.delete', 'Category', id, { name: preview.name, slug: preview.slug }, req);
  return { id: String(id), name: preview.name };
}

module.exports = { list, summary, audiences, getById, create, update, setStatus, deletePreview, remove, subtreeIds, isRetailOnly, dedicatedSectionIds, assertAssignable };
