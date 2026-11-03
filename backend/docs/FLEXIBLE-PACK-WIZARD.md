# Flexible wholesale pack wizard: reusing the Product Creation steps

## What changed
Choosing **Customer chooses colours & sizes** in *New wholesale pack* now opens a 5-step wizard:
1. Pack Details (name, slug, description, image, pack type, pack size, category for the pack's product)
2. Color Variants (the Product Creation step)
3. SKUs (the Product Creation step: Adult / Kids / Manual, All SKUs / Generate missing SKUs)
4. Pack Pricing & Configuration (badge, dispatch text, pack price, reference value, minimum packs, featured, sort order, active; optional extra SKUs from other products)
5. Review & Save

Steps can be visited in any order, backwards and forwards, without losing data (all state is held in the wizard). **Fixed packs keep the original single form, untouched.**

## 1. Components reused
The Color Variants and SKUs steps were **extracted** from `ProductEditor.jsx` into `components/products/variantWorkspace.jsx` and are now used by both flows:
- `useVariantWorkspace` (drafts, Adult/Kids/Manual mode, save-per-colour, All SKUs, duplicate prevention),
- `ColorVariantsStep`, `SkusStep`, `VariantSections`,
- plus the existing `VariantCard` and `variantDraft.js` (central adult/kids size lists, `VARIANTCODE-SIZE` convention).
Product Creation now renders those same components, so there is one implementation. Per-colour image upload, validation and save behaviour come with `VariantCard`.

## 2. Files
Created: `fe/src/components/products/variantWorkspace.jsx`, `fe/e2e/pack-wizard.mocked-api.cjs`.
Modified (admin): `components/products/ProductEditor.jsx` (now consumes the shared steps), `pages/WholesalePage.jsx` (PackEditor), `e2e/products.mocked-api.cjs` (updated for the removed low-stock column and the Adult-mode size dropdown).
Modified (backend): `models/Wholesale.js`, `validators/wholesale.validators.js`, `services/wholesale.service.js`, `test/wholesale-flexible-packs.test.js`.

## 3. How pack-specific colours and SKUs are stored
The data model has no "pack-owned" colours: colours, images and SKUs exist only as Product -> Variant -> Sku records, and a pack references SKU records. So the wizard keeps that model:
- Pack Details -> **Save & continue** creates one **wholesale-only draft product** through the normal product endpoint (`salesChannel: wholesale`, never in the shop). It reuses the pack's name, description and image.
- Steps 2-3 add colours/images/SKUs to that product with the normal variant endpoints (stock and ledger as usual).
- On save, the product is published (still wholesale-only) and the pack is created with `items` = every enabled SKU of that product (plus any extras from other products), quantity 1 each, and the new optional field `Wholesale.colorProduct` pointing at the product. Editing the pack reloads that product into steps 2-3.
No retail product is created or published. Legacy flexible packs (no `colorProduct`) keep their items as "extras" and can add a pack product later.

## 4. Inventory consistency
SKUs are single Sku records with normal stock, reservation and ledger. The pack only references them, so nothing is duplicated and SKU identities cannot conflict (SKU uniqueness is still enforced by the backend). Customer ordering of flexible packs is unchanged (SKU-level validation and reservation at quote -> order).
Schema: one optional field `Wholesale.colorProduct`; no migration.

## 5. Tests
- Backend: 308/308 (1 new: `colorProduct` stored on a flexible pack).
- Admin: tsc clean, vitest 85/85, production build OK.
- Browser (Playwright, mocked API): `pack-wizard` 20/20, `products` (product creation, regression for the extraction) 26/26, `smoke` 66/66. The wizard test covers: 5 steps, category required, wholesale-only draft product creation, Kids mode 22 rows, no duplicates on regenerate, Adult switch 14 rows, `VARIANTCODE-SIZE` codes, navigation without data loss, save order (variants, publish, pack), pack body (flexible, size 200, colorProduct, 14 unique SKU ids, quantity 1), no extra product, fixed form unchanged.

## 6. Limitations
- The browser tests use a fake API, not a real backend/MongoDB. Per-colour image upload was not exercised in a browser (it is the unchanged `VariantCard`/upload component).
- Not re-tested end to end this round: the customer composer reading a pack created by the wizard. The pack data shape is identical to earlier flexible packs (pool of SKU items), which the earlier backend and website tests cover.
- Closing the wizard after "Save & continue" but before saving the pack leaves the wholesale-only product as a draft (a notice says so); find it in Products with the Wholesale-only filter.
- The pack's product is named after the pack when created; renaming the pack later does not rename the product.
- Because the product is wholesale-enabled and published, it can also appear in the per-product wholesale catalogue.
