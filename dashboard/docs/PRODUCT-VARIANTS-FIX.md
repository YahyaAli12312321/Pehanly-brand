# Product creation: colour variants, size SKUs and initial inventory

## 1. Root cause (frontend orchestration, not the backend)
The backend contract is multi-request and was already correct:
`POST /admin/products` (draft) -> `POST /admin/products/:id/variants` (colour + sizes/SKUs + opening stock).
`variant.service.createVariant` writes ProductVariant + Sku documents + the `stock_in` "Initial stock" InventoryTransaction in ONE transaction.

The editor's final **Save Product** button only called `POST/PATCH /admin/products` (product fields) and closed with a success toast.
Colour variants / sizes were persisted only by each card's separate "Create colour variant" button. Anything typed but not saved that way
was kept in React state, silently discarded on close, and even counted in the "Ready to publish" summary. Result: a product row with
0 colours, 0 SKUs, no price, 0 pcs.

No stock / variant fields were added to the Product model (stock stays on SKUs; the ledger stays the single source).

## 2. Fix (admin frontend only; no backend change)
* `Save Product` now persists every unsaved colour variant through the existing endpoints, sequentially, after validating ALL of them first
  (an invalid variant blocks the save and nothing is written).
* New SKUs carry `stock` (initial stock) in the create/update-variant body; existing SKUs never send `stock` (backend would answer 400 `STOCK_VIA_INVENTORY`).
* Partial failure: the dialog stays open, step "Sizes & SKUs" is shown, and the message reads
  `Product details were saved, but only X of N colour variants were saved. "<colour>" failed: <reason>. Nothing was rolled back; fix it and save again.`
  No success toast, nothing is auto-deleted.
* Unsaved cards show "Not saved yet" / "Unsaved changes"; new unsaved cards can be discarded; closing the dialog with unsaved variants asks for confirmation.
* Summary distinguishes "N saved - M unsaved". Double-click is guarded synchronously.
* React Query: `invalidate()` refreshes `products.*` and `inventory.*`, so the Products table is always backend-derived (no localStorage / mock).

## 3. SKU / inventory persistence flow
1. `POST /admin/products` -> Product (draft).
2. `POST /admin/products/:id/variants` per colour -> in one transaction: ProductVariant, Sku[] (price, priceUSD, compareAt*, wholesalePrice, lowStockThreshold, stock, available),
   InventoryTransaction `stock_in` reason "Initial stock" per SKU with stock > 0.
3. `PATCH /admin/products/:id/status` when publishing (409 `PRODUCT_NOT_READY` until a sellable SKU exists).
4. Later stock changes only via `POST /admin/inventory/:sku/adjust`.
5. `GET /admin/products` derives variantsCount / skuCount / priceMin-Max / availableStock from variants + SKUs.

## 4. Verifying in MongoDB (run by you; no MongoDB was reachable where this was built)
```js
const p = db.products.findOne({ slug: "<slug>" });
db.productvariants.find({ product: p._id }).count();                       // 2
db.skus.find({ product: p._id }, { sku:1, price:1, priceUSD:1, stock:1, available:1, lowStockThreshold:1 });  // 4 rows
db.inventorytransactions.find({ reason: "Initial stock", sku: { $in: ["<sku1>", "<sku2>"] } });             // one stock_in per SKU
db.products.findOne({ _id: p._id }).stock;                                  // undefined (Product has no stock)
```
Then restart backend + frontend and reload Products: values must be identical (they come from `GET /admin/products`).
