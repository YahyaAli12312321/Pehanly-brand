# Under Garments – dedicated category (Backend + Admin + Website)

## 1. Summary
Under Garments is a **dedicated parent category** (flag `dedicatedSection`) with admin-managed sub-categories. It is reached only from **Shop ▸ Under Garments** in the header menu (desktop dropdown + mobile drawer), lives on its own page `/under-garments`, and is excluded **at the API level** from the general Shop (listing, search, category list, filters, counts, home). Products are created through the existing Product Creation wizard; no new wizard, model or collection.

## 2. Admin Dashboard files (`fe/src`)
Modified: `services/categoriesApi.js` (sends `dedicatedSection`, top-level only), `pages/CategoriesPage.jsx` (form toggle "Dedicated section", list badge), `components/products/ProductEditor.jsx` (Category picker grouped Category → Sub-category, parent marked "(own page)", inactive options disabled).
Tests: `e2e/under-garments.mocked-api.cjs` (new).

## 3. Backend files (`proj`)
Created: `scripts/seed-under-garments.js`, `test/under-garments.test.js`.
Modified: `src/models/Category.js`, `src/validators/category.validators.js`, `src/validators/catalog.validators.js`, `src/services/category.service.js`, `src/services/product.service.js`, `src/services/catalog.service.js`, `src/controllers/catalog.controller.js`, `src/routes/catalog.routes.js`, `scripts/generate-postman.js`, `package.json` (script `seed:under-garments`), `docs/API.md`, and stubs in three existing tests (`audience-and-images`, `round3-catalog`, `sales-channel-and-threshold`).

## 4. Website files (`web/src`)
Created: `pages/UnderGarmentsPage.jsx`, `components/ProductCard.jsx` (extracted from ShopPage and reused), `config/sections.js`, `e2e/under-garments.mocked-api.cjs`.
Modified: `components/Header.jsx` (Shop dropdown + mobile nested list), `pages/ShopPage.jsx` (uses shared card), `services/catalogApi.js`, `hooks/useQueries.js`, `routes.js`, `App.jsx`; `e2e/smoke.mocked-api.cjs` (waits for the checkout prefill effect before reading).

## 5. Schema / migration
One optional boolean on `Category`: `dedicatedSection` (default `false`). **No migration required**: existing documents behave as `false`. Optional seed: `node scripts/seed-under-garments.js` (dry-run) then `--apply` creates Under Garments + Men's/Women's/Kids' Underwear + Socks only where the slug is missing and never edits existing data. Equivalent without the script: Admin ▸ Categories ▸ Add "Under Garments", tick **Dedicated section**, then add sub-categories under it. Reversal: untick the flag (products return to the Shop) or deactivate/delete empty categories; no data is rewritten.

## 6. API changes (all backward compatible)
- `POST/PATCH /admin/categories`: `dedicatedSection` (top-level only; rejected on sub-categories); duplicate name/slug rejected; admin permission as before.
- `GET /catalog/products`: new `section`, `size`, `color`, `minPrice`, `maxPrice`, `inStock`; cards include `sizes`.
- `GET /catalog/categories`: new `section=<slug>` mode.
- `GET /catalog/facets` (new): sizes, colours, price span, in-stock count, active sub-categories with counts.
- Product create/update: category must be active; sub-category must belong to its parent.

## 7. Exclusion from the general Shop
Backend computes the set of category ids under any dedicated root. General requests drop those ids before querying/searching/sorting/counting, so totals and pagination stay correct; the category list and `parentOnly` list skip them too. The section is returned only with `section=true` + a category inside it. Product detail by slug and cart/checkout/orders/inventory are untouched, so direct URLs stay valid. The Shop page UI has no Under Garments code at all (it only shows what the API returns).

## 8. Dynamic sub-category management
The page, its sub-navigation and its filters are built from `/catalog/categories?section=under-garments` and `/catalog/facets`. Nothing is hardcoded. Adding, renaming, re-ordering, deactivating a sub-category in Admin ▸ Categories changes the storefront on next load; an inactive sub-category (or parent) hides its products. The Shop menu shows the Under Garments link only while the section exists and is active.

## 9. Testing actually performed
- Backend `npm test`: 318/318 (incl. 10 new: exclusion in list/search/sort/counts/categories, section access, filters, facets, assignment rules, duplicates). Models are **stubbed/in-memory fakes**, not MongoDB.
- Admin: `tsc --noEmit` clean, vitest 87/87, production build OK; Playwright (real Chromium, mocked API) new 11/11 + regression products 26/26, pack-wizard 21/21, kids-retail 8/8, smoke 66/66.
- Website: eslint clean, vitest 62/62, production build OK; Playwright (real Chromium, mocked API) new 48/48 covering Shop exclusion (grid, category filter, Explore strip, search, `/shop/under-garments`), dropdown (hover, click, active state, keyboard Enter/Tab/Escape), mobile drawer, dynamic sub-categories, size/colour/price/availability filters, sort, empty/reset, desktop/tablet/mobile overflow, deactivated section; regression audience, smoke, flows, home-sections, auth-session all pass.

## 10. Limitations / not done
- **No real MongoDB or live backend was available**: DB persistence, unique indexes and the seed script were not run against a database; browser tests used a mocked API that mirrors the backend rules, not the real server.
- The spec's **"Sale"** has no concept in the codebase, so it is not in the dropdown. **Kids / Shoes** appear only if they exist as top-level categories; Men/Women use the existing audience filter.
- Price/size/colour/stock refinement runs in memory after the category scope (exact, fine for section-sized catalogues).
- `/shop/under-garments` shows "Category not found" (no redirect). Section products are intentionally absent from New Arrivals/featured/home lists.
- Sizes are per product via the existing Adult / Kids / Manual modes (use Manual for waist sizes); no Under-Garments sizes are hardcoded.
- Wholesale catalogue unchanged. Two existing web e2e scripts needed small fixes: a timing wait in smoke, and the mobile drawer's "Shop Women" link name preserved.
