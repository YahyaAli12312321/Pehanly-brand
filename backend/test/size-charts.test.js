'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { sizeChartsView } = require('../src/services/settings.service');
const { updateBody } = require('../src/validators/settings.validators');
const { KIDS_AGE_CHART, defaultKidsChart } = require('../src/constants/SizeChart');
require('../src/models/StoreSettings'); // the schema must still load with the shared default

const chart = (rows, extra = {}) => ({ enabled: true, columns: ['Chest (in)'], rows, ...extra });

test('kids chart ships with the client age ranges', () => {
  assert.deepEqual(KIDS_AGE_CHART.map(([s]) => s), ['X-Small', 'Small', 'Medium', 'Large', 'X-Large', '2-XL']);
  assert.deepEqual(KIDS_AGE_CHART.map(([, a]) => a), ['1-2 years', '3-4 years', '5-6 years', '7-8 years', '9-10 years', '11-12 years']);

  const d = defaultKidsChart();
  assert.equal(d.enabled, true);
  assert.deepEqual(d.columns, ['Recommended age']);
  assert.deepEqual(d.rows[1], { size: 'Small', values: ['3-4 years'] });
});

test('public view ships only charts that are enabled and have rows', () => {
  const view = sizeChartsView({
    kids: defaultKidsChart(),
    men: chart([{ size: 'M', values: ['38-40'] }]),
    women: chart([]),                                   // never filled in
    unisex: chart([{ size: 'L', values: ['42'] }], { enabled: false }), // switched off
  });

  assert.deepEqual(Object.keys(view), ['kids', 'men']);
  assert.equal(view.kids.rows.length, 6);
  assert.deepEqual(view.men, { note: '', columns: ['Chest (in)'], rows: [{ size: 'M', values: ['38-40'] }] });
});

test('public view drops rows without a size and never invents values', () => {
  const view = sizeChartsView({ men: chart([{ size: 'S' }, { size: '', values: ['x'] }]) });
  assert.deepEqual(view.men.rows, [{ size: 'S', values: [] }]);
  assert.deepEqual(sizeChartsView({}), {});
  assert.deepEqual(sizeChartsView(undefined), {});
});

test('a chart can be any kind of chart: age range, body or garment measurements', () => {
  const body = { enabled: true, columns: ['Chest (in)', 'Waist (in)', 'Hips (in)'], rows: [{ size: 'M', values: ['38-40', '32-34', '39-41'] }] };
  assert.deepEqual(sizeChartsView({ women: body }).women.columns, ['Chest (in)', 'Waist (in)', 'Hips (in)']);
  assert.deepEqual(sizeChartsView({ kids: defaultKidsChart() }).kids.columns, ['Recommended age']);
});

test('validator accepts a full chart patch for every audience', () => {
  const parsed = updateBody.parse({
    sizeCharts: {
      kids: { columns: ['Recommended age'], rows: [{ size: 'Small', values: ['3-4 years'] }] },
      men: { enabled: true, note: 'Measured flat.', columns: ['Chest (in)'], rows: [{ size: 'L', values: ['40-42'] }] },
      women: { rows: [] },
      unisex: { enabled: false },
    },
  });

  assert.equal(parsed.sizeCharts.men.rows[0].size, 'L');
  assert.deepEqual(parsed.sizeCharts.women.rows, []);
  assert.equal(parsed.sizeCharts.unisex.enabled, false);
});

test('validator trims, defaults values and rejects malformed charts', () => {
  const parsed = updateBody.parse({ sizeCharts: { men: { rows: [{ size: '  L  ' }] } } });
  assert.deepEqual(parsed.sizeCharts.men.rows[0], { size: 'L', values: [] });

  assert.throws(() => updateBody.parse({ sizeCharts: { men: { rows: [{ size: '' }] } } }));
  assert.throws(() => updateBody.parse({ sizeCharts: { kids: { rows: [{ size: 'S', values: ['a'], extra: 1 }] } } }));
  assert.throws(() => updateBody.parse({ sizeCharts: { toddlers: { rows: [] } } }));
  // a row cannot carry more values than the chart has columns
  assert.throws(() => updateBody.parse({ sizeCharts: { men: { columns: ['Chest'], rows: [{ size: 'L', values: ['40', '42'] }] } } }));
});

test('settings patch without sizeCharts is unaffected', () => {
  const parsed = updateBody.parse({ storeName: 'PEHANLY' });
  assert.equal(parsed.sizeCharts, undefined);
});
