'use strict';

const dashboardService = require('../services/dashboard.service');
const cache = require('../services/cache.service');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');

exports.summary = asyncHandler(async (_req, res) =>
  success(res, {
    // 30s cache: the dashboard is polled; the numbers are not transactional.
    data: await cache.remember('dashboard:summary', 30, () => dashboardService.getSummary()),
  }),
);
