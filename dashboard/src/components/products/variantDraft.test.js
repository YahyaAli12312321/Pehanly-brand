import { describe, expect, it, vi } from "vitest";
import { countUnsaved, isUnsaved, newSizeDraft, newVariantDraft, validateVariant, variantToDraft } from "./variantDraft";

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
    { ...newSizeDraft(code, "M"), sku: `${prefix}-M`, price: "4500", compareAtPrice: "5200", wholesalePrice: "3600", priceUSD: "19.5", compareAtPriceUSD: "24", lowStockThreshold: "3", stock: "12" },
    { ...newSizeDraft(code, "L"), sku: `${prefix}-L`, price: "4700", priceUSD: "20.5", lowStockThreshold: "5", stock: "7" },
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
    expect(body.sizes[0]).toMatchObject({ size: "M", sku: "TNS-WHT-M", price: 4500, compareAtPrice: 5200, wholesalePrice: 3600, priceUSD: 19.5, compareAtPriceUSD: 24, lowStockThreshold: 3, stock: 12 });
    expect(body.sizes[1]).toMatchObject({ sku: "TNS-WHT-L", price: 4700, priceUSD: 20.5, lowStockThreshold: 5, stock: 7 });
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