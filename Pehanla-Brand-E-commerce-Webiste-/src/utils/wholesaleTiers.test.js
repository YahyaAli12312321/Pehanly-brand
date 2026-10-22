import { describe, expect, it } from 'vitest';
import { activeTierIndex, buildTierRows, estimateUnit } from './wholesaleTiers';

const product = { moq: 10, basePrice: 1000, tiers: [{ minQuantity: 25, unitPrice: 900 }, { minQuantity: 50, unitPrice: 850 }, { minQuantity: 100, unitPrice: null, quoteOnly: true }] };

describe('wholesale tier matrix', () => {
  const rows = buildTierRows(product);
  it('lays tiers out as ranges starting at the MOQ', () => {
    expect(rows.map((r) => r.label)).toEqual(['10–24 pcs', '25–49 pcs', '50–99 pcs', '100+ pcs']);
    expect(rows[3].quoteOnly).toBe(true);
  });
  it('selects the active tier from the quantity', () => {
    expect(activeTierIndex(rows, 9)).toBe(-1);
    expect(activeTierIndex(rows, 10)).toBe(0);
    expect(activeTierIndex(rows, 24)).toBe(0);
    expect(activeTierIndex(rows, 25)).toBe(1);
    expect(activeTierIndex(rows, 99)).toBe(2);
    expect(activeTierIndex(rows, 500)).toBe(3);
  });
  it('estimates the unit price and flags quote-only quantities without inventing a price', () => {
    expect(estimateUnit(rows, 30)).toEqual({ unitPrice: 900, quote: false });
    expect(estimateUnit(rows, 120)).toEqual({ unitPrice: 850, quote: true });
  });
  it('works with no tiers', () => {
    const r = buildTierRows({ moq: 5, basePrice: 700, tiers: [] });
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe('5+ pcs');
  });
});
