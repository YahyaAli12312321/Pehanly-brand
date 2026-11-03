import { describe, expect, it, vi } from "vitest";
import { countUnsaved, generateAllSkus, isUnsaved, newSizeDraft, newVariantDraft, validateVariant, variantToDraft } from "./variantDraft";

vi.mock("../../lib/apiClient", () => ({
  get: vi.fn(),
  patch: vi.fn(async (_u, body) => ({ data: body })),
  post: vi.fn(async (_u, body) => ({ data: body })),
  cleanParams: (x) => x,
}));
import * as api from "../../lib/apiClient";
import { productsApi } from "../../services/productsApi";

const colour = (name, code, prefix) => {
  const d = newVariantDraft(0);
  d.color = { name, hexCode: "#ffffff" };
  d.variantCode = code;
  d.sizes = [
    { ...newSizeDraft(code, "M"), sku: `${prefix}-M`, price: "4500", compareAtPrice: "5200", wholesalePrice: "3600", priceUSD: "19.5", compareAtPriceUSD: "24", stock: "12" },
    { ...newSizeDraft(code, "L"), sku: `${prefix}-L`, price: "4700", priceUSD: "20.5", stock: "7" },
  ];
  return d;
};

describe("unsaved colour variants", () => {
  it("new drafts are unsaved, loaded ones are saved until edited", () => {
    const loaded = variantToDraft({ _id: "v1", color: { name: "Black" }, variantCode: "B", sizes: [] });
    expect(isUnsaved(newVariantDraft(0))).toBe(true);
    expect(isUnsaved(loaded)).toBe(false);
    expect(isUnsaved({ ...loaded, dirty: true })).toBe(true);
    expect(countUnsaved([newVariantDraft(0), loaded, { ...loaded, dirty: true }])).toBe(2);
  });
  it("a filled draft validates", () => expect(validateVariant(colour("White", "TNS-WHT", "TNS-WHT")).ok).toBe(true));
});

describe("variant requests", () => {
  it("create sends colour, every SKU, PKR + USD prices, threshold and INITIAL stock", async () => {
    await productsApi.createVariant("p1", colour("White", "TNS-WHT", "TNS-WHT"));
    const [url, body] = api.post.mock.calls.at(-1);
    expect(url).toBe("/admin/products/p1/variants");
    expect(body.color.name).toBe("White");
    expect(body.sizes).toHaveLength(2);
    expect(body.sizes[0]).toMatchObject({ size: "M", sku: "TNS-WHT-M", price: 4500, compareAtPrice: 5200, wholesalePrice: 3600, priceUSD: 19.5, compareAtPriceUSD: 24, stock: 12 });
    expect(body.sizes[1]).toMatchObject({ sku: "TNS-WHT-L", price: 4700, priceUSD: 20.5, stock: 7 });
  });
  it("update never sends stock for an existing SKU, but does for a new one", async () => {
    const d = colour("White", "TNS-WHT", "TNS-WHT");
    d.sizes[0].isNew = false;
    await productsApi.updateVariant("p1", "v1", d);
    const body = api.patch.mock.calls.at(-1)[1];
    expect("stock" in body.sizes[0]).toBe(false);
    expect(body.sizes[1].stock).toBe(7);
  });
});

import { buildSku, syncSkuForSize, syncSkusForVariantCode } from "./variantDraft";
describe("SKU auto-generation", () => {
  it("a blank default row gets its SKU when the variant code is typed", () => {
    const d = newVariantDraft(0); // default S row, blank SKU (no code yet)
    expect(d.sizes[0].sku).toBe("");
    const sizes = syncSkusForVariantCode(d.sizes, "", "LWC-CB");
    expect(sizes[0].sku).toBe("LWC-CB-S");
    d.sizes = sizes; d.color.name = "Cream"; d.variantCode = "LWC-CB"; d.sizes[0].price = "3000";
    expect(validateVariant(d).ok).toBe(true);
  });
  it("keeps following the code while typing and the size when changed", () => {
    let sizes = newVariantDraft(0).sizes; let prev = "";
    for (const code of ["L", "LW", "LWC", "LWC-", "LWC-C", "LWC-CB"]) { sizes = syncSkusForVariantCode(sizes, prev, code); prev = code; }
    expect(sizes[0].sku).toBe("LWC-CB-S");
    expect(syncSkuForSize(sizes[0], "LWC-CB", "M").sku).toBe("LWC-CB-M");
  });
  it("never overwrites a hand-typed SKU or a saved SKU", () => {
    const custom = { ...newSizeDraft("A", "S"), sku: "MY-OWN" };
    expect(syncSkusForVariantCode([custom], "A", "B")[0].sku).toBe("MY-OWN");
    expect(syncSkuForSize(custom, "A", "M").sku).toBe("MY-OWN");
    const saved = { ...newSizeDraft("A", "S"), isNew: false, sku: "A-S" };
    expect(syncSkusForVariantCode([saved], "A", "B")[0].sku).toBe("A-S");
    expect(buildSku(" a ", "xl")).toBe("A-XL");
  });
  it("a blank SKU is rejected locally (no request): this was the reported failure", () => {
    const d = colour("Cream", "LWC-CB", "LWC-CB"); d.sizes[0].sku = "";
    const r = validateVariant(d);
    expect(r.ok).toBe(false);
    expect(Object.values(r.skus)[0]).toMatch(/^SKU:/);
  });
});

/* ---------------- All SKUs ---------------- */

const swatch = (name, code, sizes, extra = {}) => ({
  ...newVariantDraft(0),
  color: { name, hexCode: "#111111" },
  variantCode: code,
  sizes,
  ...extra,
});
const row = (code, size, over = {}) => ({ ...newSizeDraft(code, size), price: "1500", wholesalePrice: "1000", ...over });
const skus = (d) => d.sizes.map((s) => s.sku);

describe("generateAllSkus (All SKUs button)", () => {
  it("gives every colour every configured size, using VARIANTCODE-SIZE, with the existing prices and zero stock", () => {
    const drafts = [swatch("Black", "TEE-BLK", [row("TEE-BLK", "S"), row("TEE-BLK", "M"), row("TEE-BLK", "L")]), swatch("Red", "TEE-RED", [row("TEE-RED", "S", { price: "1600" })])];
    const r = generateAllSkus(drafts);
    expect(r.added).toBe(2);
    expect(skus(r.drafts[0])).toEqual(["TEE-BLK-S", "TEE-BLK-M", "TEE-BLK-L"]); // untouched colour keeps its rows
    expect(r.drafts[0]).toBe(drafts[0]);
    expect(skus(r.drafts[1])).toEqual(["TEE-RED-S", "TEE-RED-M", "TEE-RED-L"]);
    const added = r.drafts[1].sizes.slice(1);
    expect(added.every((s) => s.isNew && s.stock === 0 && s.priceUSD === "" && s.isEnabled)).toBe(true);
    expect(added[0].price).toBe("1600"); // copies the price of the colour's own row
    expect(r.drafts[1].dirty).toBe(true);
    expect(r.skipped).toEqual([]);
  });

  it("never creates duplicates: running it again adds nothing", () => {
    const first = generateAllSkus([swatch("Black", "TEE-BLK", [row("TEE-BLK", "S"), row("TEE-BLK", "M")]), swatch("Red", "TEE-RED", [row("TEE-RED", "S")])]);
    const second = generateAllSkus(first.drafts);
    expect(second.added).toBe(0);
    const all = second.drafts.flatMap(skus);
    expect(new Set(all).size).toBe(all.length);
  });

  it("keeps hand-typed SKUs and does not add a second row for a size that already exists", () => {
    const custom = row("TEE-BLK", "M", { sku: "MY-CUSTOM-M" });
    const drafts = [swatch("Black", "TEE-BLK", [row("TEE-BLK", "S"), custom]), swatch("Red", "TEE-RED", [row("TEE-RED", "M")])];
    const r = generateAllSkus(drafts);
    expect(skus(r.drafts[0])).toEqual(["TEE-BLK-S", "MY-CUSTOM-M"]); // M exists (custom code): not regenerated
    expect(r.drafts[0].sizes[1]).toBe(custom);
    expect(skus(r.drafts[1])).toEqual(["TEE-RED-M", "TEE-RED-S"]);
  });

  it("adds new rows to a SAVED colour without touching its saved SKUs", () => {
    const saved = swatch("Black", "TEE-BLK", [{ ...row("TEE-BLK", "S"), isNew: false, key: "id-1", stock: 12, available: 12 }], { isNew: false, id: "v1" });
    const other = swatch("Red", "TEE-RED", [row("TEE-RED", "S"), row("TEE-RED", "XL")]);
    const r = generateAllSkus([saved, other]);
    expect(r.drafts[0].sizes[0]).toBe(saved.sizes[0]);
    expect(r.drafts[0].sizes[1]).toMatchObject({ sku: "TEE-BLK-XL", isNew: true, size: "XL" });
  });

  it("skips and reports a colour without a variant code, and a code that another colour already uses", () => {
    const noCode = swatch("Green", "", [row("", "S")]);
    const a = swatch("Black", "TEE-BLK", [row("TEE-BLK", "S"), row("TEE-BLK", "M")]);
    const clash = swatch("Blue", "TEE-BLK", [row("TEE-BLK", "S", { sku: "TEE-BLU-S" })]); // same code as Black, different existing SKU
    const r = generateAllSkus([a, noCode, clash]);
    expect(r.skipped.find((s) => s.variant === "Green").reason).toMatch(/variant code/i);
    expect(r.skipped.find((s) => s.variant === "Blue" && s.size === "M").reason).toMatch(/already used/i);
    expect(r.drafts[1]).toBe(noCode);
    const all = r.drafts.flatMap(skus).filter(Boolean);
    expect(new Set(all).size).toBe(all.length);
  });

  it("does nothing when no sizes are configured", () => {
    const r = generateAllSkus([swatch("Black", "TEE-BLK", [])]);
    expect(r.added).toBe(0);
    expect(r.sizes).toEqual([]);
  });
});

import { ADULT_SIZES, KIDS_SIZES, KIDS_SIZE_CHART, kidsAge, dropOtherModeRows, inferSizeMode, sizesForMode } from "./variantDraft";

describe("Adult / Kids / Manual SKU modes", () => {
  const colours = () => [swatch("Black", "TEE-BLK", []), swatch("Red", "TEE-RED", [])];
  it("adult mode generates every adult size for every colour, once", () => {
    const r = generateAllSkus(colours(), { sizes: sizesForMode("adult") });
    expect(r.added).toBe(ADULT_SIZES.length * 2);
    expect(skus(r.drafts[0])).toEqual(ADULT_SIZES.map((z) => `TEE-BLK-${z}`));
    expect(generateAllSkus(r.drafts, { sizes: sizesForMode("adult") }).added).toBe(0);
  });
  it("kids mode generates only kids sizes; adult and kids are disjoint", () => {
    expect(ADULT_SIZES.filter((z) => KIDS_SIZES.includes(z))).toEqual([]);
    const r = generateAllSkus(colours(), { sizes: sizesForMode("kids") });
    expect(r.drafts[1].sizes.map((s) => s.size)).toEqual(KIDS_SIZES);
  });
  it("manual mode has no fixed list and keeps the union behaviour", () => {
    expect(sizesForMode("manual")).toEqual([]);
    const r = generateAllSkus([swatch("Black", "TEE-BLK", [row("TEE-BLK", "S")]), swatch("Red", "TEE-RED", [])], { sizes: [] });
    expect(r.added).toBe(1);
  });
  it("keeps hand-typed SKUs when generating a mode", () => {
    const custom = row("TEE-BLK", "M", { sku: "MY-M" });
    const r = generateAllSkus([swatch("Black", "TEE-BLK", [custom])], { sizes: sizesForMode("adult") });
    expect(r.drafts[0].sizes.filter((s) => s.size === "M")).toHaveLength(1);
    expect(skus(r.drafts[0])).toContain("MY-M");
  });
  it("switching adult -> kids drops only untouched unsaved adult rows and keeps edited/saved ones", () => {
    const a = generateAllSkus([swatch("Black", "TEE-BLK", [])], { sizes: sizesForMode("adult") }).drafts;
    a[0].sizes[1] = { ...a[0].sizes[1], sku: "HAND-S" }; // edited
    a[0].sizes[2] = { ...a[0].sizes[2], isNew: false }; // saved
    const { drafts, dropped, kept } = dropOtherModeRows(a, "kids");
    expect(kept).toBe(2);
    expect(dropped).toBe(ADULT_SIZES.length - 2);
    expect(drafts[0].sizes).toHaveLength(2);
  });
  it("infers the mode of an existing product", () => {
    expect(inferSizeMode([swatch("B", "B", [row("B", "S")])])).toBe("adult");
    expect(inferSizeMode([swatch("B", "B", [row("B", "Medium")])])).toBe("kids");
    expect(inferSizeMode([swatch("B", "B", [row("B", "S"), row("B", "Medium")])])).toBe("manual");
    expect(inferSizeMode([swatch("B", "B", [])])).toBe("manual");
  });
});

describe("Kids sizes follow the client chart exactly", () => {
  it("are the six chart sizes with their printed ages, in chart order", () => {
    expect(KIDS_SIZE_CHART).toEqual([
      { size: "X-Small", age: "1-2" }, { size: "Small", age: "3-4" }, { size: "Medium", age: "5-6" },
      { size: "Large", age: "7-8" }, { size: "X-Large", age: "9-10" }, { size: "2-XL", age: "11-12" },
    ]);
    expect(KIDS_SIZES).toEqual(["X-Small", "Small", "Medium", "Large", "X-Large", "2-XL"]);
    expect(kidsAge("x-large")).toBe("9-10");
    expect(kidsAge("M")).toBe("");
  });
  it("generate valid VARIANTCODE-SIZE SKUs for several colours, never colliding with adult codes", () => {
    const r = generateAllSkus([swatch("Red", "TEE-RED", []), swatch("Blue", "TEE-BLU", []), swatch("Green", "TEE-GRN", [])], { sizes: sizesForMode("kids") });
    expect(r.added).toBe(18);
    expect(r.skipped).toEqual([]);
    expect(skus(r.drafts[1])).toEqual(["TEE-BLU-X-SMALL", "TEE-BLU-SMALL", "TEE-BLU-MEDIUM", "TEE-BLU-LARGE", "TEE-BLU-X-LARGE", "TEE-BLU-2-XL"]);
    expect(generateAllSkus(r.drafts, { sizes: sizesForMode("kids") }).added).toBe(0);
    const adult = generateAllSkus([swatch("Red", "TEE-RED", [])], { sizes: sizesForMode("adult") }).drafts[0];
    expect(skus(adult).filter((s) => skus(r.drafts[0]).includes(s))).toEqual([]);
  });
});
