# Wholesale-only products, flexible ready packs, All SKUs, fixed low-stock threshold

## 1. Files created
Backend: `src/constants/salesChannel.js`, `scripts/normalize-low-stock.js`, `test/sales-channel-and-threshold.test.js`, `test/wholesale-flexible-packs.test.js`
Admin: `src/lib/salesChannel.js`, `src/lib/packSkus.js`, `src/lib/packSkus.test.js`
Website: `src/utils/packSelection.js`, `src/utils/packSelection.test.js`, `src/components/wholesale/PackComposer.jsx`

## 2. Files modified
Backend: `constants/inventory.js`, `utils/stock.js`, `utils/presenter.js`, `models/Product.js`, `models/Wholesale.js`, `services/{product,catalog,order,wholesale,variant,inventory,adminNotificationEvents}.service.js`, `services/whatsapp/events.js`, `controllers/wholesale.controller.js`, `validators/{product,wholesale}.validators.js`, `scripts/reconcile-stock.js`, `test/wholesale-packs-tiers.test.js` (one assertion).
Admin: `components/products/{variantDraft.js,variantDraft.test.js,VariantCard.jsx,ProductEditor.jsx}`, `services/productsApi.js`, `pages/{WholesalePage,ProductsPage,InventoryPage}.jsx`.
Website: `store/useWholesaleCartStore.js`, `utils/{wholesaleCart.js,wholesaleCart.test.js}`, `components/wholesale/{ReadyPacks,WholesaleCart}.jsx`, `pages/WholesalePage.jsx`, `services/b2bApi.js`.

## 3. Schema changes / migration
- `Product.salesChannel` (optional enum `retail|wholesale|both`, indexed). When absent it is derived from the old flag (`wholesale.isEnabled` -> both, else retail). **No migration needed**; existing products stay retail-visible.
- `Wholesale` (pack) gains `selectionMode` (`fixed` default / `flexible`) and `packSize`. Existing packs are `fixed` and unchanged.
- Low stock: `Sku.lowStockThreshold` is no longer read or written. Optional cleanup: `node scripts/normalize-low-stock.js` (dry run), then `--apply`. It recomputes stored `stockStatus` with threshold 10 and removes the legacy field. Idempotent. Old admin builds that still send `lowStockThreshold` are tolerated (ignored).

## 4. Retail vs wholesale-only visibility
Retail catalogue list, search, product-by-slug and checkout all apply `RETAIL_VISIBLE_FILTER` (`salesChannel != wholesale`, which also matches legacy docs). Checkout rejects a wholesale-only product with `ITEM_UNAVAILABLE`. Wholesale-only products are still fully editable in the admin (colours, per-colour images, sizes, SKUs) and appear in pack search with a channel badge. Setting wholesale-only forces the retail flags off; the channel and `wholesale.isEnabled` are kept consistent.

## 5. Flexible pack SKU selection
A pack with `selectionMode: flexible` and `packSize` N holds a pool of SKUs (retail or wholesale-only). The customer opens "Choose colours & sizes", enters per-SKU quantities and sees "X of N selected / remaining". The button is enabled only when the total is exactly N. It stays **one cart line** with its SKU quantities preserved.
Backend re-validates on preview and on request: SKU must belong to the pack, no duplicates, product active, variant and SKU enabled, `available >= qty` (409 `INSUFFICIENT_STOCK`). Request creation requires exactly N (400 `PACK_QUANTITY_MISMATCH` for 199/201). Preview accepts a partial selection and reports `selected/remaining`. Pricing uses the existing wholesale rules.
Inventory: the chosen SKU lines flow through the existing request -> quote -> `convertQuoteToOrder` -> `reserveSku` path, so the correct SKU is deducted. Stock logic itself is untouched.

## 6. All SKUs
`generateAllSkus` (shared pure function in `variantDraft.js`) adds every missing colour x size row using the existing `VARIANTCODE-SIZE` convention. It never duplicates or overwrites manual rows, skips colours without a variant code and already-used codes (and reports them), is idempotent, and rows stay editable before save. In the pack builder, "All SKUs" / "Add all sizes" selects the product's **existing** SKU records (nothing is created), skipping ineligible ones with a reason.

## 7. Fixed low-stock threshold
`LOW_STOCK_THRESHOLD = 10` in `constants/inventory.js`; used by `stockStatus`, presenter, inventory reporting, notifications and WhatsApp events. 1-10 low, 0 out, 11+ ok. The admin field is removed; the Inventory page shows a fixed "Low at 10".

## 8. Tests and limitations
- Backend: 307/307 (`node --test`), including 23 new tests (25-colour pack, 199/200/201, insufficient stock, disabled SKU, foreign SKU, retail exclusion, threshold).
- Admin: `tsc` clean, vitest 79/79, build OK. Website: eslint clean, vitest 62/62, build OK.
- Limitations: backend tests use stubbed Mongoose models (no real MongoDB or transactions). The new admin and website screens (channel selector, All SKUs buttons, pack builder, composer) were **not** exercised in a real browser; they are covered by unit tests, type-check and build only. Request-time stock validation is a check, not a reservation; the reservation happens at quote->order conversion, so stock can change in between. SKU records still require a retail `price` even for wholesale-only products. Guests see flexible-pack contents but no prices. `maxQuantity` discloses stock only up to the pack size. Pack MOQ ("min packs per order") remains unenforced, as before.
