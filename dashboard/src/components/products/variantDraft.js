/**
 * Draft helpers for colour variants.
 * A draft mirrors the backend variant but keeps editable values as strings.
 */

export const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;
export const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{0,39}$/;

/**
 * Central size definitions. Adult sizes are the project's original presets (unchanged).
 * Kids sizes are age-based (years) and fit the SKU code rules (VARIANTCODE-2Y).
 * Edit these two lists to change what the Adult / Kids SKU modes generate, for retail AND wholesale-only products.
 */
export const ADULT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
/**
 * Kids sizes, exactly as printed on the client's size chart (Grand Tex: "Polo Kids" and "Kids Round Neck" charts).
 * `size` is the label stored on the SKU (and used in its code); `age` is the age range the chart prints under it.
 * Polo Kids lists Small..2-XL; Kids Round Neck adds X-Small. Ages agree across both charts.
 * To follow a new chart, change this one list: retail and wholesale-only product creation both read it.
 */
export const KIDS_SIZE_CHART = [
  { size: "X-Small", age: "1-2" },
  { size: "Small", age: "3-4" },
  { size: "Medium", age: "5-6" },
  { size: "Large", age: "7-8" },
  { size: "X-Large", age: "9-10" },
  { size: "2-XL", age: "11-12" },
];
export const KIDS_SIZES = KIDS_SIZE_CHART.map((k) => k.size);
/** Age range printed on the chart for a kids size ("" for anything else). */
export const kidsAge = (size) => KIDS_SIZE_CHART.find((k) => normalizeCode(k.size) === normalizeCode(size))?.age || "";
export const SIZE_PRESETS = ADULT_SIZES; // kept for existing imports

export const SIZE_MODES = { adult: "adult", kids: "kids", manual: "manual" };
/** Sizes a mode generates/offers; manual has no fixed list. */
export const sizesForMode = (mode) => (mode === "adult" ? ADULT_SIZES : mode === "kids" ? KIDS_SIZES : []);

/** Mode for an existing product: all saved sizes adult -> adult, all kids -> kids, none/mixed/custom -> manual. */
export const inferSizeMode = (drafts) => {
  const sizes = drafts.flatMap((d) => d.sizes.map((s) => String(s.size).trim().toUpperCase())).filter(Boolean);
  if (!sizes.length) return "manual";
  const adult = ADULT_SIZES.map(normalizeCode);
  const kids = KIDS_SIZES.map(normalizeCode);
  if (sizes.every((s) => adult.includes(s))) return "adult";
  if (sizes.every((s) => kids.includes(s))) return "kids";
  return "manual";
};

/**
 * Switching Adult <-> Kids: drops only UNSAVED rows of the other audience whose SKU is still the untouched
 * auto-generated one. Saved SKUs and anything hand-edited are kept (and reported via `kept`).
 */
export const dropOtherModeRows = (drafts, nextMode) => {
  const keep = sizesForMode(nextMode);
  if (!keep.length) return { drafts, dropped: 0, kept: 0 };
  const keepN = keep.map(normalizeCode);
  const other = [...ADULT_SIZES, ...KIDS_SIZES].map(normalizeCode).filter((s) => !keepN.includes(s));
  let dropped = 0;
  let kept = 0;
  const next = drafts.map((d) => {
    const rows = d.sizes.filter((s) => {
      const size = normalizeCode(s.size);
      if (!other.includes(size)) return true;
      if (s.isNew && normalizeCode(s.sku) === buildSku(d.variantCode, s.size)) { dropped++; return false; }
      kept++;
      return true;
    });
    return rows.length === d.sizes.length ? d : { ...d, sizes: rows, dirty: true };
  });
  return { drafts: next, dropped, kept };
};

let counter = 0;

/**
 * Temporary client-side key for unsaved variants/SKUs.
 */
export const tempKey = (prefix = "new") =>
  `${prefix}-${Date.now()}-${counter++}`;

/**
 * Convert nullable backend values to editable form strings.
 */
const s2f = (value) =>
  value === null || value === undefined ? "" : String(value);

/**
 * Normalize codes/SKUs consistently.
 */
export const normalizeCode = (value = "") =>
  String(value).trim().toUpperCase();

/**
 * Generate the default SKU for a variant + size.
 *
 * Example:
 * variantCode = LWC-CB
 * size        = M
 *
 * result:
 * LWC-CB-M
 */
export const buildSku = (variantCode, size) => {
  const code = normalizeCode(variantCode);
  const normalizedSize = normalizeCode(size);

  if (!code || !normalizedSize) {
    return "";
  }

  return `${code}-${normalizedSize}`;
};

/**
 * Returns true when the current SKU is still an automatically generated SKU
 * and can therefore safely be regenerated.
 *
 * Manually customized SKUs should NOT be overwritten.
 */
export const canAutoUpdateSku = ({
  currentSku,
  previousVariantCode,
  previousSize,
}) => {
  const current = normalizeCode(currentSku);

  if (!current) {
    return true;
  }

  const previousAutoSku = buildSku(
    previousVariantCode,
    previousSize,
  );

  return current === previousAutoSku;
};

/**
 * Synchronize new SKU rows when the variant code changes.
 *
 * Existing backend SKUs are intentionally never modified.
 * Manually customized new SKUs are also preserved.
 */
export const syncSkusForVariantCode = (
  sizes,
  previousVariantCode,
  nextVariantCode,
) =>
  sizes.map((sizeDraft) => {
    if (!sizeDraft.isNew) {
      return sizeDraft;
    }

    const shouldUpdate = canAutoUpdateSku({
      currentSku: sizeDraft.sku,
      previousVariantCode,
      previousSize: sizeDraft.size,
    });

    if (!shouldUpdate) {
      return sizeDraft;
    }

    return {
      ...sizeDraft,
      sku: buildSku(nextVariantCode, sizeDraft.size),
    };
  });

/**
 * Synchronize an automatically generated SKU when its size changes.
 *
 * Example:
 *
 * LWC-CB-S
 *
 * changing size S -> M becomes:
 *
 * LWC-CB-M
 *
 * A manually customized SKU is preserved.
 */
export const syncSkuForSize = (
  sizeDraft,
  variantCode,
  nextSize,
) => {
  if (!sizeDraft.isNew) {
    return {
      ...sizeDraft,
      size: nextSize,
    };
  }

  const shouldUpdate = canAutoUpdateSku({
    currentSku: sizeDraft.sku,
    previousVariantCode: variantCode,
    previousSize: sizeDraft.size,
  });

  return {
    ...sizeDraft,
    size: nextSize,
    ...(shouldUpdate
      ? {
          sku: buildSku(variantCode, nextSize),
        }
      : {}),
  };
};

/**
 * Convert an existing backend SKU into an editable draft.
 */
export const sizeToDraft = (size) => ({
  key: size._id,
  isNew: false,

  size: size.size,
  sku: size.sku,

  price: s2f(size.price),
  compareAtPrice: s2f(size.compareAtPrice),
  wholesalePrice: s2f(size.wholesalePrice),

  priceUSD: s2f(size.priceUSD),
  compareAtPriceUSD: s2f(size.compareAtPriceUSD),

  isEnabled: !!size.isEnabled,

  stock: size.stock,
  reservedStock: size.reservedStock,
  available: size.available,
  stockStatus: size.stockStatus,
});

/**
 * Convert an existing backend colour variant into a draft.
 */
export const variantToDraft = (variant) => ({
  key: variant._id,
  id: variant._id,

  isNew: false,

  color: {
    name: variant.color?.name || "",
    hexCode: variant.color?.hexCode || "#111827",
  },

  variantCode: variant.variantCode || "",

  images: variant.images || [],

  isEnabled: !!variant.isEnabled,

  sortOrder: variant.sortOrder ?? 0,

  sizes: (variant.sizes || []).map(sizeToDraft),
});

/**
 * Create a new SKU/size row.
 *
 * If a variant code already exists, automatically generate:
 *
 * VARIANTCODE-SIZE
 *
 * Example:
 * LWC-CB-M
 */
export const newSizeDraft = (
  variantCode,
  size,
  template,
) => ({
  key: tempKey("sku"),

  isNew: true,

  size,

  sku: buildSku(variantCode, size),

  price: template?.price ?? "",
  compareAtPrice: template?.compareAtPrice ?? "",
  wholesalePrice: template?.wholesalePrice ?? "",

  // USD is entered manually by the merchant.
  // Never automatically derive USD from PKR.
  priceUSD: "",
  compareAtPriceUSD: "",

  isEnabled: true,

  // Initial/opening stock.
  // Existing stock later becomes read-only in Product Editor.
  stock: 0,
});

/**
 * Create a completely new colour variant.
 *
 * Important:
 * The initial S SKU starts blank because there is no variant code yet.
 * Once the merchant enters a variant code, VariantCard should call
 * syncSkusForVariantCode() to generate the SKU automatically.
 */
export const newVariantDraft = (sortOrder = 0) => ({
  key: tempKey("var"),

  isNew: true,

  color: {
    name: "",
    hexCode: "#111827",
  },

  variantCode: "",

  images: [],

  isEnabled: true,

  sortOrder,

  sizes: [
    newSizeDraft("", "S"),
  ],
});

/**
 * A draft is unsaved when:
 *
 * - it does not exist on the server yet
 * OR
 * - an existing draft has been edited.
 */
export const isUnsaved = (draft) =>
  draft.isNew || draft.dirty === true;

/**
 * Count variants that still need saving.
 */
export const countUnsaved = (drafts) =>
  drafts.filter(isUnsaved).length;

/**
 * Validate a complete colour variant before sending it to the backend.
 *
 * Returns:
 *
 * {
 *   general: string[],
 *   skus: {
 *     [skuKey]: string
 *   },
 *   ok: boolean
 * }
 */
export function validateVariant(draft) {
  const general = [];
  const skus = {};

  /*
   * --------------------------------------------------
   * Colour
   * --------------------------------------------------
   */

  if (!draft.color?.name?.trim()) {
    general.push("Colour name is required.");
  }

  /*
   * --------------------------------------------------
   * Variant code
   * --------------------------------------------------
   */

  const variantCode = normalizeCode(
    draft.variantCode,
  );

  if (!CODE_RE.test(variantCode)) {
    general.push(
      "Variant code: letters, numbers, dots, dashes (1-40 chars).",
    );
  }

  /*
   * --------------------------------------------------
   * Sizes
   * --------------------------------------------------
   */

  if (!Array.isArray(draft.sizes) || draft.sizes.length === 0) {
    general.push("Add at least one size.");
  }

  const seen = new Set();

  for (const sizeDraft of draft.sizes || []) {
    const size = String(
      sizeDraft.size ?? "",
    ).trim();

    const sku = normalizeCode(
      sizeDraft.sku,
    );

    /*
     * Size
     */

    if (!size) {
      skus[sizeDraft.key] =
        "Size is required";

      continue;
    }

    /*
     * SKU format
     */

    if (!SKU_RE.test(sku)) {
      skus[sizeDraft.key] =
        "SKU: letters, numbers, dots, dashes (2-40 chars)";

      continue;
    }

    /*
     * Duplicate SKU inside this colour variant.
     */

    if (seen.has(sku)) {
      skus[sizeDraft.key] =
        "Duplicate SKU";

      continue;
    }

    seen.add(sku);

    /*
     * PKR retail price
     */

    if (!(Number(sizeDraft.price) > 0)) {
      skus[sizeDraft.key] =
        "Retail price must be greater than 0";

      continue;
    }

    /*
     * PKR compare-at price
     */

    if (
      sizeDraft.compareAtPrice !== "" &&
      !(
        Number(sizeDraft.compareAtPrice) >
        Number(sizeDraft.price)
      )
    ) {
      skus[sizeDraft.key] =
        "Compare price must be higher than price";

      continue;
    }

    /*
     * Wholesale price
     */

    if (
      sizeDraft.wholesalePrice !== "" &&
      Number(sizeDraft.wholesalePrice) < 0
    ) {
      skus[sizeDraft.key] =
        "Wholesale price can't be negative";

      continue;
    }

    /*
     * USD retail price
     */

    if (
      sizeDraft.priceUSD !== "" &&
      !(Number(sizeDraft.priceUSD) > 0)
    ) {
      skus[sizeDraft.key] =
        "USD price must be greater than 0";

      continue;
    }

    /*
     * USD compare-at requires USD retail price.
     */

    if (
      sizeDraft.compareAtPriceUSD !== "" &&
      sizeDraft.priceUSD === ""
    ) {
      skus[sizeDraft.key] =
        "Set a USD price before a USD compare-at";

      continue;
    }

    /*
     * USD compare-at must exceed USD retail price.
     */

    if (
      sizeDraft.compareAtPriceUSD !== "" &&
      !(
        Number(sizeDraft.compareAtPriceUSD) >
        Number(sizeDraft.priceUSD)
      )
    ) {
      skus[sizeDraft.key] =
        "USD compare-at must be higher than the USD price";

      continue;
    }
  }

  return {
    general,
    skus,
    ok:
      general.length === 0 &&
      Object.keys(skus).length === 0,
  };
}
/**
 * "All SKUs": fill in every missing colour x size combination.
 *
 * The sizes are the ones already configured on the colours (their union, in first-seen order); every colour gets every one of
 * them. Nothing is ever overwritten or duplicated:
 *  - a colour that already has a size (whatever its SKU code is, hand-typed or generated) is left alone,
 *  - a generated code that is already used by any colour is skipped and reported,
 *  - a colour with no variant code cannot get a code yet and is skipped and reported.
 * New rows use the same convention as manual rows (VARIANTCODE-SIZE) and start with the prices of the closest existing row
 * (opening stock 0, USD blank - USD is always entered by the merchant). Saved colours get new, unsaved rows; the admin reviews
 * and edits them before saving.
 *
 * Returns { drafts, added, skipped:[{ variant, size?, reason }] }. `drafts` is a new array; unchanged colours are the same objects.
 */
export function generateAllSkus(drafts, { sizes: fixedSizes } = {}) {
  // Manual "All SKUs": the union of sizes already configured. Adult/Kids mode: that mode's central size list.
  const sizes = [];
  const seenSizes = new Set();
  const source = fixedSizes && fixedSizes.length ? [{ sizes: fixedSizes.map((size) => ({ size })) }] : drafts;
  for (const d of source) {
    for (const s of d.sizes) {
      const key = normalizeCode(s.size);
      if (key && !seenSizes.has(key)) {
        seenSizes.add(key);
        sizes.push(String(s.size).trim());
      }
    }
  }
  const taken = new Set(drafts.flatMap((d) => d.sizes.map((s) => normalizeCode(s.sku)).filter(Boolean)));
  const priced = (d) => [...d.sizes].reverse().find((s) => String(s.price ?? "") !== "");
  const anyPriced = drafts.map(priced).find(Boolean);

  const skipped = [];
  let added = 0;
  const next = drafts.map((d) => {
    const name = d.color?.name?.trim() || "Unnamed colour";
    const code = normalizeCode(d.variantCode);
    const have = new Set(d.sizes.map((s) => normalizeCode(s.size)));
    const missing = sizes.filter((size) => !have.has(normalizeCode(size)));
    if (!missing.length) return d;
    if (!code) {
      skipped.push({ variant: name, reason: "Enter a variant code first, then click All SKUs again." });
      return d;
    }
    const template = priced(d) || anyPriced;
    const rows = [];
    for (const size of missing) {
      const sku = buildSku(code, size);
      if (!SKU_RE.test(sku)) {
        skipped.push({ variant: name, size, reason: `${sku || "SKU"} is not a valid SKU code.` });
      } else if (taken.has(sku)) {
        skipped.push({ variant: name, size, reason: `SKU ${sku} is already used by another colour.` });
      } else {
        taken.add(sku);
        rows.push(newSizeDraft(code, size, template));
      }
    }
    if (!rows.length) return d;
    added += rows.length;
    return { ...d, sizes: [...d.sizes, ...rows], dirty: true };
  });
  return { drafts: next, added, skipped, sizes };
}

/**
 * "Apply to All Colors": copy one source colour's SKU set (sizes, prices, opening stock) to the other colours.
 *
 * Pure planning step - nothing is changed until applyColorPlan() runs, so the UI can preview, ask for confirmation and report.
 * Per target colour and source size:
 *  - the target has no row for that size -> CREATE one (VARIANTCODE-SIZE, same convention as every other SKU; prices + opening
 *    stock copied; USD copied only where the source has it),
 *  - the target row already holds the same values -> SAME (skipped),
 *  - the target row has blanks only where the source has values (an untouched generated row) -> FILL (safe, not a conflict),
 *  - the target row has different non-blank values -> CONFLICT. Conflicts are only changed when the admin confirms.
 * Target sizes the source does not have are never touched. Saved SKUs keep their live stock (stock is changed through inventory
 * adjustments, not the product form), so a stock difference on a saved SKU is reported as `stockKept`, never overwritten.
 */
export const COPY_PRICE_FIELDS = ["price", "compareAtPrice", "wholesalePrice", "priceUSD", "compareAtPriceUSD"];
const blank = (v) => v === "" || v === null || v === undefined;
const sameNum = (a, b) => (blank(a) && blank(b)) || (!blank(a) && !blank(b) && Number(a) === Number(b));

export function planApplyToAllColors(drafts, sourceKey) {
  const source = drafts.find((d) => d.key === sourceKey);
  const plan = { source: source ? { key: source.key, name: source.color?.name?.trim() || "Unnamed colour" } : null, rows: [], targets: [], create: [], fill: [], same: [], conflicts: [], skipped: [], stockKept: [], error: null };
  if (!source) { plan.error = "Choose the colour to copy from."; return plan; }
  const srcRows = [];
  for (const s of source.sizes) {
    const size = String(s.size ?? "").trim();
    if (!size) continue;
    if (!(Number(s.price) > 0)) { plan.skipped.push({ variant: plan.source.name, size, reason: "No retail price on the source row yet" }); continue; }
    srcRows.push(s);
  }
  plan.rows = srcRows.map((s) => ({ size: String(s.size).trim(), price: s.price, compareAtPrice: s.compareAtPrice, wholesalePrice: s.wholesalePrice, priceUSD: s.priceUSD, compareAtPriceUSD: s.compareAtPriceUSD, stock: Number(s.stock) || 0 }));
  if (!srcRows.length) { plan.error = `${plan.source.name} has no size with a retail price to copy. Enter sizes and prices first.`; return plan; }

  const taken = new Set(drafts.flatMap((d) => d.sizes.map((s) => normalizeCode(s.sku)).filter(Boolean)));
  for (const t of drafts) {
    if (t.key === source.key) continue;
    const name = t.color?.name?.trim() || "Unnamed colour";
    const code = normalizeCode(t.variantCode);
    plan.targets.push({ key: t.key, name });
    if (!code) { plan.skipped.push({ variant: name, reason: "No variant code yet - enter one, then apply again" }); continue; }
    for (const s of srcRows) {
      const size = String(s.size).trim();
      const existing = t.sizes.find((x) => normalizeCode(x.size) === normalizeCode(size));
      if (!existing) {
        const sku = buildSku(code, size);
        if (!SKU_RE.test(sku)) { plan.skipped.push({ variant: name, size, reason: `${sku || "SKU"} is not a valid SKU code` }); continue; }
        if (taken.has(sku)) { plan.skipped.push({ variant: name, size, reason: `SKU ${sku} is already used by another row` }); continue; }
        taken.add(sku);
        plan.create.push({ target: t.key, variant: name, size, sku, from: s });
        continue;
      }
      const diffs = [];
      let fillable = false;
      for (const f of COPY_PRICE_FIELDS) {
        if (sameNum(existing[f], s[f])) continue;
        if (blank(s[f])) continue; // the source has nothing to offer for this field - never blank out the target
        if (blank(existing[f])) fillable = true;
        else diffs.push({ field: f, from: existing[f], to: s[f] });
      }
      const srcStock = Number(s.stock) || 0;
      const curStock = Number(existing.stock) || 0;
      if (existing.isNew) {
        if (curStock !== srcStock) { if (curStock === 0) fillable = true; else diffs.push({ field: "stock", from: curStock, to: srcStock }); }
      } else if (curStock !== srcStock) {
        plan.stockKept.push({ variant: name, size, current: curStock, source: srcStock });
      }
      const item = { target: t.key, variant: name, size, sku: existing.sku, rowKey: existing.key, from: s, diffs };
      if (diffs.length) plan.conflicts.push(item);
      else if (fillable) plan.fill.push(item);
      else plan.same.push(item);
    }
  }
  return plan;
}

/** Runs a plan. `overwriteConflicts` false (default) adds/fills only; true also updates conflicting rows. Returns { drafts, summary }. */
export function applyColorPlan(drafts, plan, { overwriteConflicts = false } = {}) {
  const summary = { created: 0, filled: 0, updated: 0, skippedExisting: plan.same.length, conflictsLeft: overwriteConflicts ? 0 : plan.conflicts.length, skipped: plan.skipped, stockKept: plan.stockKept };
  const copyVals = (s, isNew) => ({
    price: s.price, compareAtPrice: s.compareAtPrice ?? "", wholesalePrice: s.wholesalePrice ?? "", priceUSD: s.priceUSD ?? "", compareAtPriceUSD: s.compareAtPriceUSD ?? "",
    ...(isNew ? { stock: Number(s.stock) || 0 } : {}),
  });
  const patchRow = (row, item) => {
    const vals = copyVals(item.from, row.isNew);
    // optional fields the source leaves empty never blank out something the target already has
    for (const f of ["compareAtPrice", "wholesalePrice", "priceUSD", "compareAtPriceUSD"]) if (blank(vals[f]) && !blank(row[f])) vals[f] = row[f];
    return { ...row, ...vals };
  };
  const byTarget = new Map();
  const add = (k, fn) => byTarget.set(k, [...(byTarget.get(k) || []), fn]);
  for (const c of plan.create) add(c.target, (d) => { d.sizes = [...d.sizes, { ...newSizeDraft(d.variantCode, c.size), ...copyVals(c.from, true) , sku: c.sku }]; summary.created++; });
  for (const f of plan.fill) add(f.target, (d) => { d.sizes = d.sizes.map((r) => (r.key === f.rowKey ? patchRow(r, f) : r)); summary.filled++; });
  if (overwriteConflicts) for (const c of plan.conflicts) add(c.target, (d) => { d.sizes = d.sizes.map((r) => (r.key === c.rowKey ? patchRow(r, c) : r)); summary.updated++; });
  const next = drafts.map((d) => {
    const fns = byTarget.get(d.key);
    if (!fns) return d;
    const copy = { ...d, sizes: [...d.sizes], dirty: true };
    fns.forEach((fn) => fn(copy));
    return copy;
  });
  return { drafts: next, summary };
}
