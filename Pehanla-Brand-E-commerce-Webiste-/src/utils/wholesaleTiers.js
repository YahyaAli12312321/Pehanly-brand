/**
 * Display helpers for the volume-tier matrix. The tiers themselves (quantities, prices, quote-only
 * steps) come from the backend catalog; this only lays them out as ranges and finds which one a
 * quantity falls in. Authoritative totals always come from POST /wholesale/preview.
 */

/** [{label, from, to, unitPrice|null, quoteOnly, base}] - first row is the base wholesale price from the MOQ. */
export function buildTierRows(product) {
  const moq = Math.max(1, Number(product?.moq) || 1);
  const tiers = [...(product?.tiers || [])].sort((a, b) => a.minQuantity - b.minQuantity);
  const rows = [{ from: moq, unitPrice: product?.basePrice ?? null, quoteOnly: false, base: true }];
  tiers.forEach((t) => rows.push({ from: t.minQuantity, unitPrice: t.quoteOnly ? null : t.unitPrice ?? null, quoteOnly: Boolean(t.quoteOnly), base: false }));
  return rows
    .filter((r, i) => i === 0 || r.from > rows[0].from || rows[0].from === r.from)
    .map((r, i, arr) => {
      const next = arr[i + 1];
      const to = next ? next.from - 1 : null;
      const label = to === null ? `${r.from}+ pcs` : r.from === to ? `${r.from} pcs` : `${r.from}–${to} pcs`;
      return { ...r, to, label };
    });
}

/** Index of the row a quantity falls into (-1 below the MOQ). */
export function activeTierIndex(rows, qty) {
  const q = Number(qty) || 0;
  if (!rows.length || q < rows[0].from) return -1;
  let idx = 0;
  rows.forEach((r, i) => { if (q >= r.from) idx = i; });
  return idx;
}

/**
 * Estimated unit price for display only: the active priced row; for a quote-only row the best priced
 * row below it (the real quote is negotiated). Returns {unitPrice, quote}.
 */
export function estimateUnit(rows, qty) {
  const idx = activeTierIndex(rows, qty);
  if (idx < 0) return { unitPrice: rows[0]?.unitPrice ?? null, quote: false };
  const row = rows[idx];
  if (!row.quoteOnly) return { unitPrice: row.unitPrice, quote: false };
  const priced = [...rows.slice(0, idx)].reverse().find((r) => !r.quoteOnly && r.unitPrice != null);
  return { unitPrice: priced?.unitPrice ?? null, quote: true };
}
