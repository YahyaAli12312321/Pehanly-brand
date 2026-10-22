'use strict';

const catalogService = require('../services/catalog.service');
const asyncHandler = require('../utils/asyncHandler');
const cache = require('../services/cache.service');
const { success } = require('../utils/apiResponse');

exports.categories = asyncHandler(async (req, res) => {
  const query = req.validated.query;
  const key = `catalog:categories:${query.audience || '-'}:${query.homeOnly ? 'home' : 'all'}`;

  const data = await cache.remember(key, 60, () => catalogService.listCategories(query));
  return success(res, { data });
});

exports.products = asyncHandler(async (req, res) => {
  const { items, meta } = await catalogService.listProducts(req.validated.query);
  return success(res, { data: items, meta });
});

exports.product = asyncHandler(async (req, res) => {
  const data = await catalogService.getProductBySlug(req.validated.params.slug);
  return success(res, { data });
});
