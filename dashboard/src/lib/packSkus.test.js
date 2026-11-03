import { describe, expect, it } from "vitest";
import { collectPackSkus, packSkuBlocker } from "./packSkus";

const size = (id, s, over = {}) => ({ _id: id, size: s, sku: `T-${id}`, wholesalePrice: 100, isEnabled: true, ...over });
const product = (over = {}) => ({
  name: "Tee", salesChannel: "wholesale", wholesale: { isEnabled: true, moq: 10 },
  variants: [
    { _id: "v1", color: { name: "Black" }, isEnabled: true, sizes: [size("a", "S"), size("b", "M"), size("c", "L", { wholesalePrice: null })] },
    { _id: "v2", color: { name: "Red" }, isEnabled: true, sizes: [size("d", "S"), size("e", "M", { isEnabled: false })] },
  ],
  ...over,
});

describe("collectPackSkus (All SKUs in the pack builder)", () => {
  it("selects every orderable SKU of a wholesale-only product and explains the ones it skips", () => {
    const r = collectPackSkus(product(), new Set());
    expect(r.add.map((x) => x.sku)).toEqual(["a", "b", "d"]);
    expect(r.blocked.map((x) => x.reason)).toEqual(["No wholesale price set", "This SKU is disabled"]);
    expect(r.add[0]).toEqual({ sku: "a", label: "Tee · Black / S (T-a)", quantity: 1 });
  });
  it("never adds a SKU twice (reuses the existing SKU records)", () => {
    const r = collectPackSkus(product(), new Set(["a", "d"]));
    expect(r.add.map((x) => x.sku)).toEqual(["b"]);
    expect(r.duplicates).toBe(2);
    expect(collectPackSkus(product(), new Set(["a", "b", "d"])).add).toEqual([]);
  });
  it("can be limited to one colour", () => {
    expect(collectPackSkus(product(), new Set(), "v2").add.map((x) => x.sku)).toEqual(["d"]);
  });
  it("refuses everything for a product that is not wholesale-enabled (e.g. retail only)", () => {
    const retail = product({ salesChannel: "retail", wholesale: { isEnabled: false } });
    expect(collectPackSkus(retail, new Set()).add).toEqual([]);
    expect(packSkuBlocker(retail, retail.variants[0], retail.variants[0].sizes[0])).toMatch(/not enabled/);
  });
  it("accepts a retail+wholesale product (legacy products with only the wholesale flag too)", () => {
    expect(collectPackSkus(product({ salesChannel: undefined, wholesale: { isEnabled: true } }), new Set()).add).toHaveLength(3);
    expect(collectPackSkus(product({ salesChannel: "both" }), new Set()).add).toHaveLength(3);
  });
});
