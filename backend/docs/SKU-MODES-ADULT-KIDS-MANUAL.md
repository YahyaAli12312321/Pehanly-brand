# SKU generation modes: Adult / Kids / Manual

Admin dashboard only. No backend or website change, no schema change, no migration. Backend SKU validation and uniqueness rules are untouched.

## Behaviour (SKU step of product creation)
- A mode selector (Adult | Kids | Manual) sits above the SKU matrix. Only one mode is active per product.
- **Adult**: on selecting it, every adult size is generated for every configured colour (codes `VARIANTCODE-SIZE`, e.g. `TEE-BLK-XL`).
- **Kids**: same, with the kids sizes only.
- **Manual**: unchanged manual workflow (Add Size SKU, free-text sizes). "All SKUs" still copies the sizes already on any colour to every colour.
- In Adult/Kids mode "Add Size SKU" and the size cell offer only that mode's sizes, so the two ranges cannot be mixed by accident.
- The same editor is used for retail and wholesale-only products, so both behave identically. Generated rows are ordinary unsaved rows: edit them, then save each colour.
- Generating again adds nothing (idempotent). Hand-typed SKUs, saved SKUs, and SKU codes already used by another colour are never overwritten or duplicated; skipped items are reported in a toast. Colours without a variant code are skipped until a code is entered.
- Switching Adult <-> Kids removes only unsaved rows of the old range whose SKU is still the untouched auto code. Saved or hand-edited rows are kept and reported.
- Editing an existing product infers its mode (all adult sizes -> Adult, all kids -> Kids, none/mixed/custom -> Manual).

## Size definitions
Adult: the project's original presets XS, S, M, L, XL, 2XL, 3XL (unchanged).
Kids: taken from the client's Grand Tex size chart image (replaces an earlier placeholder list), exactly as printed:

| Size label | Age |
|---|---|
| X-Small | 1-2 |
| Small | 3-4 |
| Medium | 5-6 |
| Large | 7-8 |
| X-Large | 9-10 |
| 2-XL | 11-12 |

Both lists live in `src/components/products/variantDraft.js` (`ADULT_SIZES`, `KIDS_SIZE_CHART`). Retail and wholesale-only creation use the same editor, so changing the list changes both. Kids SKU codes: `VARIANTCODE-LABEL`, e.g. `KT-RED-X-SMALL`, `KT-RED-2-XL`.

Notes on the chart: it has two kids charts. Polo Kids lists Small to 2-XL; Kids Round Neck also lists X-Small (1-2). The ages agree, so the list is their union; delete the X-Small rows for a polo style. The chart's chest and length measurements are not stored. Kids labels (Small, Medium...) differ from adult labels (S, M...), so adult and kids SKU codes never collide.

## Files
Modified: `src/components/products/variantDraft.js`, `variantDraft.test.js`, `VariantCard.jsx`, `ProductEditor.jsx`. Created: none.

## Tests
Admin: tsc clean, vitest 87/87 (8 new: adult generates all sizes, kids only kids sizes and disjoint lists, manual unchanged, hand-typed SKU kept, no duplicates on repeat, switch keeps saved/edited rows, mode inference), build OK.
Not done: no browser (Playwright) run of the new selector; the retail and wholesale-only paths share one component, so they are covered by the same unit tests rather than two separate UI runs. Backend tests were not re-run because nothing there changed.
