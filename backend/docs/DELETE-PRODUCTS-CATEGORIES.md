# Delete products & categories

## Safety rule
Order history kabhi nahi tootegi. Jo cheez kahin use ho chuki hai, wo permanently delete **nahi** hoti — uske liye saaf message aur "Deactivate instead" ka option hai.

**Product delete block ho jata hai agar:** koi order, return/refund request, quote, ya wholesale pack/request us product ko reference karta ho. (Orders apna naam aur SKU snapshot rakhte hain, lekin reference toot jata, is liye block.)

**Category delete block ho jati hai agar:** uske andar sub-categories hon, ya uske subtree mein koi product ho.

Jab delete allowed ho to product ke saath uske **variants, SKUs, inventory ledger aur reviews** bhi delete hote hain. Category ke case mein sirf category (wo khali hi hoti hai).

## Admin UI
- **Products page:** har row mein trash icon.
- **Categories page:** row ke menu mein "Delete Category".
- Dono ek hi dialog kholte hain jo pehle backend se poochta hai:
  - Allowed → "What will be removed" (kitne variants, SKUs, history)
  - Blocked → counts ke saath wajah, delete button disabled, aur "Deactivate instead"
- Confirm par hi kuch hota hai; Cancel se kuch nahi. Delete ke baad toast aur list turant update.
- Agar check ke baad server par kuch badal jaye (product ab order ho gaya), to DELETE phir bhi refuse hota hai aur error dialog mein dikhta hai.

## API (admin only, `catalog.manage`)
| Method | Path |
| --- | --- |
| GET | `/admin/products/:id/delete-check` |
| DELETE | `/admin/products/:id` → 409 `PRODUCT_IN_USE` |
| GET | `/admin/categories/:id/delete-check` |
| DELETE | `/admin/categories/:id` → 409 `CATEGORY_NOT_EMPTY` |

Dono actions audit log mein record hote hain (`product.delete`, `category.delete`).

## Files
- **Backend:** naya `src/services/deletion.service.js`, `test/deletion.test.js`; badle `src/services/product.service.js`, `src/services/category.service.js`, dono controllers, dono routes, `docs/API.md`.
- **Admin:** naya `src/components/common/DeleteEntityDialog.jsx`, `e2e/delete-entities.mocked-api.cjs`; badle `src/pages/ProductsPage.jsx`, `src/pages/CategoriesPage.jsx`, `src/services/productsApi.js`, `src/services/categoriesApi.js`.
- **Website:** koi change nahi.

## Database
Koi schema change nahi, koi migration nahi.

## Tests (jo actually chale)
- **Backend:** 339/339 (14 naye) — preview output, har tarah ka blocker, cascade (variants/SKUs/ledger/reviews, sab product-scoped), refusal par kuch delete na hona, 404, subtree ke products, aur message ki English.
- **Admin:** `tsc` clean, 99/99 unit, build OK; naya browser test 27/27 — blocked product (counts, disabled button, deactivate instead), allowed product (summary, cancel, confirm, row gayab, toast), server ka late refusal, category blocked by products / by sub-categories, empty category delete, child phir parent.
- **Regression:** admin products 26 / pack-wizard 21 / kids-retail 8 / smoke 66 / under-garments 11 / apply-colors 31 / size-charts 14; backend 337; website eslint clean + 75 unit + build (website mein koi change nahi).

## Update: 500 on `delete-check` (hardening)
Pehli version mein reference check ke models `mongoose.modelNames()` se lazily uthaye ja rahe the. Do masle the:
1. **Safety hole:** agar koi model us waqt registered na ho, check chup-chaap `0` return karta — yani ordered product bhi delete ho sakta tha.
2. **500:** agar kisi bhi check ki query fail ho jaye to poora endpoint 500 de deta tha, bina ye bataye ke kaunsa model aur kyun.

Ab:
- Saare models **direct require** se aate hain (`order.model`, `Quote`, `ReturnRefundRequest`, `Wholesale`, `Product`, `Category`), aur ek test check karta hai ke chhe ke chhe load ho rahe hain.
- Koi check fail ho to error **server log mein model ke naam aur stack ke saath** likha jata hai, aur record **blocked** ho jata hai (`unverified` blocker) — delete allow nahi hota. Fail-safe.
- Admin dialog ab "Could not check … (see the server log)" dikhata hai, delete button disabled rehta hai.
- Plurals bhi theek: "2 sub-categories", "3 wholesale packs or requests" (pehle "2 sub-categorys" banta).

Agar 500 phir bhi aaye to wajah backend par purani `product.service.js` hai (route nayi, service purani). Check: `node -e "console.log(Object.keys(require('./src/services/product.service')))"` — `deletePreview` aur `remove` dikhne chahiye.

## Limitations
- Asli MongoDB par test nahi hua; browser tests mocked API par chale jo wahi rules enforce karta hai.
- Delete transaction mein nahi hai: agar cascade ke darmiyan DB gir jaye to kuch child records reh sakte hain (product aakhir mein delete hota hai, is liye orphan product nahi banta).
- Bulk delete nahi banaya — bulk bar mein sirf purane activate/deactivate/feature actions hain.
- Media library se images delete nahi hoti (wo shared ho sakti hain); sirf product ka reference jata hai.
- Deleted product ka storefront URL 404 dega — SEO ke liye redirect chahiye to alag se batayein.
