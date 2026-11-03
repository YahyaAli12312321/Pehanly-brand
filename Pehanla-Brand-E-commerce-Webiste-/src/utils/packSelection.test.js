import { describe, expect, it } from 'vitest';
import { cleanSelections, groupPackOptions, isFlexiblePack, packSizeOf, selectionItems, selectionProblems, selectionStatus } from './packSelection';

const opt = (sku, variant, colorName, size, over = {}) => ({ sku, variant, productName: 'Tee', colorName, colorHex: '#000', size, skuCode: `T-${sku}`, inStock: true, maxQuantity: 40, ...over });
const options = [opt('a', 'v1', 'Black', 'S'), opt('b', 'v1', 'Black', 'M'), opt('c', 'v2', 'Red', 'S'), opt('d', 'v2', 'Red', 'M', { inStock: false, maxQuantity: 0 })];

describe('flexible pack selection rules (200-piece pack)', () => {
  it('is complete only at exactly the pack size', () => {
    expect(selectionStatus(200, { a: 100, b: 100 })).toMatchObject({ selected: 200, remaining: 0, complete: true, over: false });
    expect(selectionStatus(200, { a: 100, b: 99 })).toMatchObject({ selected: 199, remaining: 1, complete: false, over: false });
    expect(selectionStatus(200, { a: 100, b: 101 })).toMatchObject({ selected: 201, remaining: -1, complete: false, over: true });
    expect(selectionStatus(200, {})).toMatchObject({ selected: 0, remaining: 200, complete: false });
  });

  it('explains 199, 201 and missing stock in plain words, and is silent when valid', () => {
    expect(selectionProblems(200, { a: 40, b: 40 }, options)).toEqual(['Choose 120 more pieces to reach 200.']);
    expect(selectionProblems(200, { a: 40, b: 40, c: 40 }, options.map((o) => ({ ...o, maxQuantity: 200 })))).toEqual(['Choose 80 more pieces to reach 200.']);
    expect(selectionProblems(2, { a: 2, b: 1 }, options)).toEqual(['You chose 3 pieces. This pack is exactly 2: remove 1.']);
    expect(selectionProblems(200, {}, options)).toEqual(['Choose 200 pieces across the colours and sizes below.']);
    const big = options.map((o) => ({ ...o, maxQuantity: 200 }));
    expect(selectionProblems(200, { a: 100, b: 100 }, big)).toEqual([]);
  });

  it('rejects a quantity above the SKU stock and an out-of-stock SKU', () => {
    const p = selectionProblems(200, { a: 41, d: 1 }, options);
    expect(p).toContain('Black S: only 40 available (you chose 41).');
    expect(p).toContain('Red M is out of stock.');
    expect(selectionProblems(5, { zzz: 5 }, options)).toContain('One of your choices is no longer part of this pack. Remove it.');
  });

  it('cleans zero, negative, fractional and garbage quantities', () => {
    expect(cleanSelections({ a: '12', b: 0, c: -4, d: 'x', e: 3.9 })).toEqual({ a: 12, e: 3 });
  });

  it('groups sizes under their colour and keeps only chosen SKUs as cart items', () => {
    const groups = groupPackOptions(options);
    expect(groups.map((g) => [g.label, g.options.length, g.inStock])).toEqual([['Black', 2, true], ['Red', 2, true]]);
    expect(selectionItems({ b: 7, c: 3, a: 0 }, options)).toEqual([
      { sku: 'b', quantity: 7, productName: 'Tee', colorName: 'Black', size: 'M' },
      { sku: 'c', quantity: 3, productName: 'Tee', colorName: 'Red', size: 'S' },
    ]);
    expect(groupPackOptions([opt('x', 'v9', 'Blue', 'S', { productName: 'Cap' }), ...options]).map((g) => g.label)).toEqual(['Cap · Blue', 'Tee · Black', 'Tee · Red']);
  });

  it('recognises flexible packs and reads the pack size either from the pack or its computed block', () => {
    expect(isFlexiblePack({ selectionMode: 'flexible' })).toBe(true);
    expect(isFlexiblePack({ computed: { selectionMode: 'flexible' } })).toBe(true);
    expect(isFlexiblePack({ items: [] })).toBe(false);
    expect(packSizeOf({ packSize: 200 })).toBe(200);
    expect(packSizeOf({ computed: { packSize: 150 } })).toBe(150);
    expect(packSizeOf({})).toBe(0);
  });
});
