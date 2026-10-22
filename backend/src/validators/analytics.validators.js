'use strict';

const { z } = require('zod');

const ANALYTICS_RANGES = Object.freeze([
  '7d',
  '30d',
  '90d',
  '6m',
  '1y',
]);

const analyticsQuery = z
  .object({
    range: z
      .enum(ANALYTICS_RANGES)
      .default('30d'),
  })
  .strict();

module.exports = {
  ANALYTICS_RANGES,
  analyticsQuery,
};