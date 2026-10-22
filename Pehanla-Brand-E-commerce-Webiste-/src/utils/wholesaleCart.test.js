import { describe, expect, it } from 'vitest';
import { allocationStatus, cartErrors, lineReady, manualItems, previewItemsFor, toQty } from './wholesaleCart';

describe('wholesale allocation', () => {
  it('requires the allocation to equal the ordered quantity', () => {
    expect(allocationStatus(12, { a: 5, b: 7 })).toMatchObject({ allocated: 12, valid: true, remaining: 0 });
    expect(allocationStatus(12, { a: 5, b: 6 })).toMatchObject({ valid: false, remaining: 1, over: false });
    expect(allocationStatus(12, { a: 8, b: 6 })).toMatchObject({ valid: false, remaining: -2, over: true });
    expect(allocationStatus(0, {}).valid).toBe(false);
  });
  it('sanitises quantities', () => {
    expect(toQty('3.9')).toBe(3);
    expect(toQty(-4)).toBe(0);
    expect(toQty('abc')).toBe(0);
  });
  it('a line is only ready when valid AND confirmed', () => {
    const base = { type: 'manual', name: 'Polo', ordered: 10, alloc: { a: 10 } };
    expect(lineReady(base)).toBe(false);
    expect(lineReady({ ...base, confirmed: true })).toBe(true);
    expect(lineReady({ ...base, alloc: { a: 9 }, confirmed: true })).toBe(false);
  });
  it('reports blocking messages for checkout', () => {
    expect(cartErrors([{ type: 'manual', name: 'Polo', ordered: 10, alloc: { a: 4 } }])[0]).toMatch(/6 left to allocate/);
    expect(cartErrors([{ type: 'manual', name: 'Polo', ordered: 10, alloc: { a: 10 }, confirmed: false }])[0]).toMatch(/confirm/);
    expect(cartErrors([{ type: 'manual', name: 'Polo', ordered: 10, alloc: { a: 10 }, confirmed: true }])).toEqual([]);
  });
  it('builds backend items and merges duplicate SKUs across a pack and manual line', () => {
    const lines = [
      { type: 'manual', alloc: { s1: 4, s2: 0 } },
      { type: 'pack', items: [{ sku: 's1', quantity: 2 }, { sku: 's3', quantity: 5 }] },
    ];
    expect(manualItems(lines)).toEqual([{ sku: 's1', quantity: 4 }]);
    expect(previewItemsFor(lines)).toEqual([{ sku: 's1', quantity: 6 }, { sku: 's3', quantity: 5 }]);
  });
});
