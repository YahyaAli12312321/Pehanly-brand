# Apply to All Colors – copy sizes, prices, SKUs & stock to every colour

Admin dashboard only (frontend). **No backend, schema or API change**: the feature fills the normal colour/SKU drafts, which are then saved colour by colour through the existing variant endpoints, so all existing validation, transactional opening stock and the "Initial stock" ledger entry apply unchanged.

## Where
Product Creation ▸ **SKUs** step (and the identical SKUs step of the wholesale *Customer chooses colours & sizes* pack wizard, which shares the same component). Retail, Wholesale-only and Both channels all use it. Button: **Apply to All Colors** (needs at least two colours).

## How it works
1. Configure one colour (e.g. Black): sizes, retail / compare-at / wholesale / USD prices, opening stock.
2. Click **Apply to All Colors**. A preview shows: source colour (changeable – any colour can be the source), the target colours, a table of the sizes/prices/stock to be copied, and counts: new SKUs, empty rows to fill, rows that already match, conflicts.
3. **Apply** adds missing SKUs and fills empty rows only. If conflicts exist they are listed (`Red S (RT-RED-S): Price 999 → 1,500, Opening stock 5 → 200`); the main button keeps them untouched, and a separate **Add missing and update N conflicts…** button asks for explicit confirmation first.
4. A result summary shows SKUs created, rows filled, existing skipped, conflicts needing attention, anything not applied (with reasons). Nothing is saved to the server by the button; every colour stays editable and is saved with its normal **Save colour variant** button.

## Rules
- Per target colour and source size: no row → **create** `VARIANTCODE-SIZE` (same convention as All SKUs/manual rows; prices + opening stock copied; USD only where the source has it). Same values → **skipped**. Empty (blank) existing row → **filled**. Different non-blank values → **conflict** (never changed without confirmation).
- SKU codes are never duplicated: a code already used by any row is skipped and reported; a colour without a variant code is skipped and reported; invalid codes (e.g. size with a space) are skipped and reported. Existing SKU codes are never changed, even when overwriting values.
- Optional fields the source leaves empty never blank out values the target already has. Target sizes the source doesn't have are left alone. Source rows without a retail price are not copied (reported).
- Saved (already created) SKUs keep their live stock – stock is changed through inventory adjustments, not the product form – so a stock difference on a saved SKU is only reported ("Saved SKUs keep their live stock"). Price fields on saved SKUs can be updated after confirmation and saved as usual.
- Safe to repeat: a second click finds everything already matching (0 new) and the apply button is disabled.
- Works with Adult, Kids (client chart sizes untouched) and Manual: the sizes copied are whatever the source colour has.

## Files
`fe/src/components/products/variantDraft.js` (`planApplyToAllColors`, `applyColorPlan`), `variantWorkspace.jsx` (`ApplyToAllColors` panel in `SkusStep`), `applyToAllColors.test.js`, `e2e/apply-colors.mocked-api.cjs`.

## Tests performed
- Unit (vitest) 99/99 total, 12 new: brief's S/M/L/XL example to 3 colours, SKU uniqueness/validity, independence of rows, compare/wholesale/USD, repeat safety, conflict protection + confirmed overwrite, blank-row fill, saved SKUs keep stock, SKU clash/missing code, unpriced source, Adult/Kids/Manual size sets, target-only sizes.
- Browser (real Chromium, **mocked API**, not a real backend/DB) 31/31: retail Manual example (preview contents, apply, summary, 16 unique SKUs, same prices/stock everywhere, repeat = 0 new, manual edit protected, conflict list, add-missing-only keeps values, confirmed overwrite, edit after applying, save → API receives 16 unique SKUs with right values and ledger entries), Wholesale-only (wholesale price copied and saved), Adult (28 rows, blanks filled, no duplicates), Kids (chart sizes), choosing another source colour.
- `tsc --noEmit` clean, production build OK; regression e2e: products 26, pack-wizard 21, kids-retail 8, smoke 66, under-garments 11, single-image, orders-ship, whatsapp all pass.

## Limitations
- Not tested against a real backend/MongoDB or by hand in a browser against the live API.
- Rows seeded by **All SKUs** carry a guessed price from the nearest colour; if that differs from the source they appear as conflicts (nothing is replaced silently) – confirm to replace them.
- A hand-typed custom SKU code on a target row is kept (values update, code doesn't); new rows always use `VARIANTCODE-SIZE`, since a custom pattern can't be inferred from the source.
- Images, colour names and variant codes are not copied (colour-specific by design).
