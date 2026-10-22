/**
 * Pure wholesale-cart helpers. Nothing here knows a price: prices, MOQ status, tiers and totals
 * are returned by the backend (POST /wholesale/preview). The frontend only checks that the size/colour
 * allocation adds up to the quantity the buyer ordered - the backend re-validates everything on submit.
 */

export const sumValues = (obj) => Object.values(obj || {}).reduce((n, q) => n + (Number(q) || 0), 0);

/** Parse a quantity input into a non-negative integer. */
export const toQty = (v) => Math.max(0, Math.min(1_000_000, Math.floor(Number(v) || 0)));

/**
 * Allocation state for one product line.
 *  ordered   - quantity the buyer wants of this product
 *  alloc     - { [skuId]: qty } spread over colours/sizes
 */
export function allocationStatus(ordered, alloc) {
  const allocated = sumValues(alloc);
  const target = toQty(ordered);
  return {
    allocated,
    ordered: target,
    remaining: target - allocated,
    valid: target > 0 && allocated === target,
    over: allocated > target,
  };
}

/** A cart line is checkout-ready only when its allocation matches AND the buyer confirmed it. */
export const lineReady = (line) => line.type === 'pack' || (allocationStatus(line.ordered, line.alloc).valid && Boolean(line.confirmed));

/** Flatten manual lines into the backend item list ({sku, quantity}), dropping empty allocations. */
export function manualItems(lines) {
  return lines
    .filter((l) => l.type !== 'pack')
    .flatMap((l) => Object.entries(l.alloc || {}).filter(([, q]) => q > 0).map(([sku, quantity]) => ({ sku, quantity })));
}

export function packItems(line) {
  return (line.items || []).map((i) => ({ sku: String(i.sku), quantity: i.quantity }));
}

/** Everything the preview endpoint should price: confirmed-or-not manual allocations + packs. */
export function previewItemsFor(lines) {
  const seen = new Map();
  [...manualItems(lines), ...lines.filter((l) => l.type === 'pack').flatMap(packItems)].forEach((i) => {
    seen.set(i.sku, (seen.get(i.sku) || 0) + i.quantity);
  });
  return [...seen.entries()].map(([sku, quantity]) => ({ sku, quantity }));
}

export const cartErrors = (lines) => {
  const errs = [];
  lines.filter((l) => l.type !== 'pack').forEach((l) => {
    const s = allocationStatus(l.ordered, l.alloc);
    if (!s.ordered) errs.push(`${l.name}: enter a quantity.`);
    else if (!s.valid) errs.push(`${l.name}: allocate exactly ${s.ordered} pieces (${s.remaining > 0 ? `${s.remaining} left to allocate` : `${-s.remaining} too many`}).`);
    else if (!l.confirmed) errs.push(`${l.name}: confirm the size & colour allocation.`);
  });
  return errs;
};
