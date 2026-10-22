/**
 * Draft helpers for colour variants.
 * A draft mirrors the backend variant but keeps editable values as strings.
 */

export const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;
export const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{0,39}$/;

export const SIZE_PRESETS = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
];

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

  lowStockThreshold: s2f(size.lowStockThreshold),

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

  lowStockThreshold:
    template?.lowStockThreshold ?? "",

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