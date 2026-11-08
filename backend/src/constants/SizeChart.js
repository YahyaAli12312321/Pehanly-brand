'use strict';

/**
 * Size charts shown on the storefront product page.
 *
 * Charts themselves are merchant data (StoreSettings.sizeCharts); only the audience keys and the client's kids
 * age ranges live in code. Product.audience is men|women|unisex, so "kids" comes from the category's audience.
 */
const CHART_AUDIENCES = ['kids', 'men', 'women', 'unisex'];

/** Client-provided kids sizing: size -> recommended age. Single source of truth; do not invent sizes. */
const KIDS_AGE_CHART = [
  ['X-Small', '1-2 years'],
  ['Small', '3-4 years'],
  ['Medium', '5-6 years'],
  ['Large', '7-8 years'],
  ['X-Large', '9-10 years'],
  ['2-XL', '11-12 years'],
];

/** The chart a fresh store starts with. Adult charts start empty: the merchant fills in real measurements. */
const defaultKidsChart = () => ({
  enabled: true,
  note: 'Kids sizes are by age. If your child is between two sizes, choose the larger one.',
  columns: ['Recommended age'],
  rows: KIDS_AGE_CHART.map(([size, age]) => ({ size, values: [age] })),
});

module.exports = { CHART_AUDIENCES, KIDS_AGE_CHART, defaultKidsChart };
