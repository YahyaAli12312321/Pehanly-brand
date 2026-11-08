import { describe, expect, it } from 'vitest';
import { pickChart, resolveChartKey } from './SizeChart';

const kidsChart = { columns: ['Recommended age'], rows: [{ size: 'Small', values: ['3-4 years'] }], note: 'By age.' };
const menChart = { columns: ['Chest (in)'], rows: [{ size: 'M', values: ['38-40'] }] };
const unisexChart = { columns: ['Chest (in)'], rows: [{ size: 'L', values: ['42'] }] };
const withSizes = (...sizes) => ({ variants: [{ sizes: sizes.map((s) => ({ size: s })) }] });

describe('which chart a product shows', () => {
  it("uses the product's own audience first", () => {
    expect(resolveChartKey({ audience: 'women', categoryAudience: 'men' })).toBe('women');
    expect(resolveChartKey({ audience: 'UNISEX' })).toBe('unisex');
  });

  it("falls back to the category audience, which is where kids lives", () => {
    expect(resolveChartKey({ audience: null, categoryAudience: 'kids' })).toBe('kids');
    expect(resolveChartKey({ categoryAudience: 'men' })).toBe('men');
  });

  it('infers kids from kids size names when no audience is set anywhere', () => {
    expect(resolveChartKey(withSizes('Small', 'Medium', 'Large'))).toBe('kids');
    expect(resolveChartKey(withSizes('X-Small', '2-XL'))).toBe('kids');
    expect(resolveChartKey(withSizes('S', 'M', 'L'))).toBeNull();     // adult codes are not kids
    expect(resolveChartKey(withSizes('Small', 'XL'))).toBeNull();     // mixed: do not guess
    expect(resolveChartKey({})).toBeNull();
  });

  it('ignores an unknown category audience', () => {
    expect(resolveChartKey({ categoryAudience: 'winter' })).toBeNull();
  });
});

describe('picking the chart to render', () => {
  const charts = { kids: kidsChart, men: menChart, unisex: unisexChart };

  it('returns the audience chart with its key', () => {
    expect(pickChart(charts, { categoryAudience: 'kids' })).toMatchObject({ key: 'kids', note: 'By age.' });
    expect(pickChart(charts, { audience: 'men' }).key).toBe('men');
  });

  it('falls back to unisex when the audience has no chart', () => {
    expect(pickChart(charts, { audience: 'women' }).key).toBe('unisex');
    expect(pickChart(charts, {}).key).toBe('unisex');
  });

  it('renders nothing when no chart has rows - never an empty table', () => {
    expect(pickChart({ men: { columns: ['Chest'], rows: [] } }, { audience: 'men' })).toBeNull();
    expect(pickChart({}, { audience: 'men' })).toBeNull();
    expect(pickChart(undefined, { audience: 'men' })).toBeNull();
  });

  it('does not fall back for an audience that has its own chart', () => {
    expect(pickChart({ men: menChart, unisex: unisexChart }, { audience: 'men' }).rows).toEqual(menChart.rows);
  });
});
