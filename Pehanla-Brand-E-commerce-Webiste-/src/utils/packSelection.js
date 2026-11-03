/**
 * Pure helpers for FLEXIBLE ready packs: the buyer spreads exactly `packSize` pieces over the SKUs the pack offers.
 * Nothing here knows a price. The backend re-checks every rule (pool, quantity, stock, pricing) on preview and on request;
 * these helpers only give instant feedback and decide when the buyer may continue.
 *
 * option: { sku, variant, productName, colorName, colorHex, image, size, skuCode, inStock, maxQuantity }
 * selections: { [skuId]: quantity }
 */
import { sumValues, toQty } from './wholesaleCart';

export const isFlexiblePack = (pack) => pack?.selectionMode === 'flexible' || pack?.computed?.selectionMode === 'flexible';
export const packSizeOf = (pack) => Number(pack?.packSize ?? pack?.computed?.packSize) || 0;

/** Colours of a flexible pack: one group per colour variant, each with its sizes. */
export function groupPackOptions(options = []) {
  const groups = new Map();
  for (const o of options) {
    const key = String(o.variant || `${o.productName}|${o.colorName}`);
    if (!groups.has(key)) groups.set(key, { key, colorName: o.colorName || 'Colour', colorHex: o.colorHex, image: o.image, productName: o.productName, options: [] });
    groups.get(key).options.push(o);
  }
  const list = [...groups.values()];
  const multiProduct = new Set(list.map((g) => g.productName)).size > 1;
  return list.map((g) => ({
    ...g,
    label: multiProduct ? `${g.productName} · ${g.colorName}` : g.colorName,
    inStock: g.options.some((o) => o.inStock && o.maxQuantity > 0),
  }));
}

/** Selected / remaining against the pack size. */
export function selectionStatus(packSize, selections) {
  const selected = sumValues(selections);
  return { packSize, selected, remaining: packSize - selected, over: selected > packSize, complete: packSize > 0 && selected === packSize };
}

/** Drop empty quantities and anything that is not a positive whole number. */
export function cleanSelections(selections) {
  const out = {};
  for (const [sku, q] of Object.entries(selections || {})) {
    const n = toQty(q);
    if (n > 0) out[sku] = n;
  }
  return out;
}

/** Human messages for everything that stops the buyer from continuing (empty list = ready). */
export function selectionProblems(packSize, selections, options = []) {
  const problems = [];
  const bySku = new Map(options.map((o) => [String(o.sku), o]));
  for (const [sku, q] of Object.entries(selections || {})) {
    const o = bySku.get(String(sku));
    if (!o) problems.push('One of your choices is no longer part of this pack. Remove it.');
    else if (!o.inStock || o.maxQuantity < 1) problems.push(`${o.colorName} ${o.size} is out of stock.`);
    else if (q > o.maxQuantity) problems.push(`${o.colorName} ${o.size}: only ${o.maxQuantity} available (you chose ${q}).`);
  }
  const s = selectionStatus(packSize, selections);
  if (s.over) problems.push(`You chose ${s.selected} pieces. This pack is exactly ${packSize}: remove ${-s.remaining}.`);
  else if (!s.complete) problems.push(s.selected ? `Choose ${s.remaining} more piece${s.remaining === 1 ? '' : 's'} to reach ${packSize}.` : `Choose ${packSize} pieces across the colours and sizes below.`);
  return problems;
}

/** Cart line items ({sku, quantity, labels}) from a selection, in the pack's own order. */
export function selectionItems(selections, options = []) {
  const clean = cleanSelections(selections);
  return options
    .filter((o) => clean[String(o.sku)])
    .map((o) => ({ sku: String(o.sku), quantity: clean[String(o.sku)], productName: o.productName, colorName: o.colorName, size: o.size }));
}
