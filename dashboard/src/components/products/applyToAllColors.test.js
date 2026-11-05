import { describe, expect, it, vi } from "vitest";
vi.mock("../../lib/apiClient", () => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), cleanParams: (x) => x }));
import { ADULT_SIZES, KIDS_SIZES, applyColorPlan, generateAllSkus, newSizeDraft, newVariantDraft, planApplyToAllColors, validateVariant, variantToDraft } from "./variantDraft";

const colour = (name, code, rows = []) => {
  const d = newVariantDraft(0);
  d.color = { name, hexCode: "#000000" };
  d.variantCode = code;
  d.sizes = rows.map(([size, price, stock, extra = {}]) => ({ ...newSizeDraft(code, size), price: String(price), stock, ...extra }));
  return d;
};
const BLACK = [["S", 1500, 200], ["M", 1500, 150], ["L", 1600, 100], ["XL", 1600, 80]];
const run = (drafts, key, opts) => { const plan = planApplyToAllColors(drafts, key); return { plan, ...applyColorPlan(drafts, plan, opts) }; };
const row = (drafts, name, size) => drafts.find((d) => d.color.name === name).sizes.find((s) => s.size === size);

describe("Apply to All Colors", () => {
  it("copies every size, price and stock to every other colour (the brief's example)", () => {
    const d = [colour("Black", "TEE-BLK", BLACK), colour("Red", "TEE-RED"), colour("White", "TEE-WHT"), colour("Blue", "TEE-BLU")];
    const { drafts, summary } = run(d, d[0].key);
    expect(summary.created).toBe(12);
    for (const name of ["Red", "White", "Blue"]) {
      for (const [size, price, stock] of BLACK) {
        const r = row(drafts, name, size);
        expect([r.price, r.stock]).toEqual([String(price), stock]);
      }
    }
    expect(row(drafts, "Red", "XL").sku).toBe("TEE-RED-XL");
    expect(drafts.slice(1).every((x) => x.dirty && x.sizes.every((s) => s.isNew))).toBe(true);
  });

  it("every SKU is unique, valid and independent; the source is untouched", () => {
    const d = [colour("Black", "B", BLACK), colour("Red", "R"), colour("Blue", "U")];
    const before = JSON.stringify(d[0]);
    const { drafts } = run(d, d[0].key);
    const skus = drafts.flatMap((x) => x.sizes.map((s) => s.sku));
    expect(new Set(skus).size).toBe(skus.length);
    expect(drafts.every((x) => validateVariant(x).ok)).toBe(true);
    expect(JSON.stringify(drafts[0])).toBe(before);
    // rows are separate objects: editing one colour never changes another
    expect(row(drafts, "Red", "S")).not.toBe(row(drafts, "Blue", "S"));
  });

  it("copies compare-at, wholesale and USD where the source has them, and leaves USD blank where it does not", () => {
    const d = [colour("Black", "B", [["M", 1500, 10, { compareAtPrice: "1800", wholesalePrice: "1000", priceUSD: "6", compareAtPriceUSD: "8" }], ["L", 1600, 5]]), colour("Red", "R")];
    const { drafts } = run(d, d[0].key);
    expect(row(drafts, "Red", "M")).toMatchObject({ compareAtPrice: "1800", wholesalePrice: "1000", priceUSD: "6", compareAtPriceUSD: "8" });
    expect(row(drafts, "Red", "L")).toMatchObject({ priceUSD: "", compareAtPriceUSD: "" });
  });

  it("is safe to repeat: second run creates nothing and changes nothing", () => {
    const d = [colour("Black", "B", BLACK), colour("Red", "R")];
    const first = run(d, d[0].key);
    const second = run(first.drafts, d[0].key);
    expect(second.summary.created).toBe(0);
    expect(second.plan.same).toHaveLength(4);
    expect(second.plan.conflicts).toHaveLength(0);
    expect(second.drafts.flatMap((x) => x.sizes)).toHaveLength(8);
  });

  it("protects manually entered target data: conflicts are listed and untouched unless confirmed", () => {
    const d = [colour("Black", "B", BLACK), colour("Red", "R", [["S", 999, 5, { sku: "RED-CUSTOM-S" }], ["M", 1500, 150]])];
    const plan = planApplyToAllColors(d, d[0].key);
    expect(plan.conflicts.map((c) => c.size)).toEqual(["S"]);
    expect(plan.conflicts[0].diffs.map((x) => x.field).sort()).toEqual(["price", "stock"]);
    expect(plan.same.map((c) => c.size)).toEqual(["M"]);
    expect(plan.create.map((c) => c.size)).toEqual(["L", "XL"]);
    const safe = applyColorPlan(d, plan);
    expect(row(safe.drafts, "Red", "S")).toMatchObject({ price: "999", stock: 5, sku: "RED-CUSTOM-S" });
    expect(safe.summary).toMatchObject({ created: 2, conflictsLeft: 1, updated: 0 });
    const forced = applyColorPlan(d, plan, { overwriteConflicts: true });
    expect(row(forced.drafts, "Red", "S")).toMatchObject({ price: "1500", stock: 200, sku: "RED-CUSTOM-S" }); // price/stock replaced, SKU code kept
    expect(forced.summary.updated).toBe(1);
  });

  it("fills untouched blank rows without calling them conflicts", () => {
    const d = [colour("Black", "B", BLACK), colour("Red", "R", BLACK.map(([s]) => [s, "", 0]))];
    const { plan, drafts } = run(d, d[0].key);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.fill).toHaveLength(4);
    expect(row(drafts, "Red", "L")).toMatchObject({ price: "1600", stock: 100 });
    expect(drafts[1].sizes).toHaveLength(4); // no duplicate rows
  });

  it("rows seeded with a guessed price by All SKUs that differ are reported as conflicts, not silently replaced", () => {
    let d = [colour("Black", "B", BLACK), colour("Red", "R")];
    d = generateAllSkus(d).drafts;
    const plan = planApplyToAllColors(d, d[0].key);
    expect(plan.conflicts.length + plan.same.length + plan.fill.length).toBe(4);
    expect(applyColorPlan(d, plan).drafts[1].sizes.find((s) => s.size === "S").price).toBe(d[1].sizes.find((s) => s.size === "S").price);
  });

  it("saved target SKUs keep live stock; their price conflicts need confirmation", () => {
    const saved = variantToDraft({ _id: "v2", color: { name: "Red" }, variantCode: "R", isEnabled: true, images: [], sizes: [{ _id: "s1", size: "S", sku: "R-S", price: 1400, stock: 30, reservedStock: 0, available: 30, isEnabled: true }] });
    const d = [colour("Black", "B", BLACK), saved];
    const plan = planApplyToAllColors(d, d[0].key);
    expect(plan.conflicts[0].diffs.map((x) => x.field)).toEqual(["price"]);
    expect(plan.stockKept).toEqual([{ variant: "Red", size: "S", current: 30, source: 200 }]);
    const { drafts } = run(d, d[0].key, { overwriteConflicts: true });
    expect(row(drafts, "Red", "S")).toMatchObject({ price: "1500", stock: 30, sku: "R-S", isNew: false });
  });

  it("never creates a SKU that already exists elsewhere, and skips colours with no variant code", () => {
    const clash = colour("Green", "G", [["S", 1, 0, { sku: "R-S" }]]);
    const d = [colour("Black", "B", [["S", 1500, 1]]), colour("Red", "R"), clash, colour("Pink", "")];
    const { plan, drafts } = run(d, d[0].key);
    expect(plan.skipped.map((s) => s.reason).join("|")).toMatch(/R-S is already used/);
    expect(plan.skipped.some((s) => s.variant === "Pink" && /variant code/.test(s.reason))).toBe(true);
    const skus = drafts.flatMap((x) => x.sizes.map((s) => s.sku));
    expect(new Set(skus).size).toBe(skus.length);
  });

  it("source rows without a retail price are not copied; no priced rows is an error", () => {
    const d = [colour("Black", "B", [["S", 1500, 1], ["M", "", 1]]), colour("Red", "R")];
    const plan = planApplyToAllColors(d, d[0].key);
    expect(plan.rows.map((r) => r.size)).toEqual(["S"]);
    expect(plan.skipped[0]).toMatchObject({ size: "M" });
    const empty = planApplyToAllColors([colour("Black", "B", [["S", "", 0]]), colour("Red", "R")], d[0].key);
    expect(planApplyToAllColors([colour("A", "A", [["S", "", 0]]), colour("B", "B")], undefined).error).toBeTruthy();
    expect(empty.error).toBeTruthy();
  });

  it("works for Adult, Kids and Manual size sets", () => {
    for (const sizes of [ADULT_SIZES, KIDS_SIZES, ["28", "30", "W32"]]) {
      const d = [colour("Black", "B", sizes.map((s, i) => [s, 1000 + i * 100, 10 + i])), colour("Red", "R"), colour("Blue", "U")];
      const { drafts } = run(d, d[0].key);
      sizes.forEach((s, i) => { for (const n of ["Red", "Blue"]) expect(row(drafts, n, s)).toMatchObject({ price: String(1000 + i * 100), stock: 10 + i }); });
      expect(drafts[1].sizes.map((x) => x.size)).toEqual(sizes);
      expect(validateVariant(drafts[1]).ok).toBe(true);
    }
    // Kids keeps the client chart labels
    expect(KIDS_SIZES).toEqual(["X-Small", "Small", "Medium", "Large", "X-Large", "2-XL"]);
  });

  it("leaves target-only sizes alone", () => {
    const d = [colour("Black", "B", BLACK), colour("Red", "R", [["XXL", 2000, 3]])];
    const { drafts } = run(d, d[0].key);
    expect(drafts[1].sizes.map((s) => s.size)).toEqual(["XXL", "S", "M", "L", "XL"]);
  });
});
