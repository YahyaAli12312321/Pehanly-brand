# Size Chart – product detail page

## Kya bana
Product page par ab "Size Chart" section hai. Content **merchant ka hai** — Admin ▸ Settings ▸ Size Charts se manage hota hai, deploy ki zaroorat nahi. Maine koi measurement apne paas se nahi banaya.

- **Kids:** har size ke saamne recommended age (aap ne yahi kaha tha). Client wala chart pehle se bhara hua hai: X-Small 1-2 years, Small 3-4, Medium 5-6, Large 7-8, X-Large 9-10, 2-XL 11-12.
- **Men / Women / Unisex:** alag-alag charts, columns aap khud define karte hain (`Chest (in)`, `Waist (in)`, `Bust (in)` … jo bhi chahiye). Ye shuru mein **khali** hain — jab tak aap na bharein, storefront par ye section dikhta hi nahi.

## Chart kaise choose hota hai
1. Product ka apna `audience` (men / women / unisex).
2. Warna category ka audience — **kids** yahin se aata hai, kyunki Product.audience sirf men/women/unisex hai.
3. Warna agar product ke saare sizes kids wale naam hain (Small/Medium/Large …) to kids chart.
4. Jis audience ka chart khali ho, uske liye **unisex** chart fallback hai. Dono khali to section nahi.

## Admin (Settings ▸ Size Charts)
Chaar tabs: Kids, Men, Women, Unisex. Har chart mein:
- **Show on storefront** toggle (band karne par rows mehfooz rehti hain).
- **Note** — table ke neeche ek line (jaise "Measured flat. Do sizes ke darmiyan hon to bara size lein").
- **Columns** — heading khud likhein, add/remove (max 8).
- **Sizes (rows)** — size naam + har column ki value, add/remove (max 40).
- Kids ke liye **"Restore client age ranges"** button — ek click mein chhe asli sizes wapas.
- Validation: bina column ke size nahi, bina size ke value nahi, aur ek hi size do baar nahi.

## Storefront
- Size selector ke saath **"Size chart"** link — click par neeche table par le jata hai.
- Table: Size + aap ke columns. Jo size customer ne choose kiya hai, **us ki row highlight** ho jati hai ("Selected").
- Semantic table (caption, `scope="col"`/`scope="row"`), section labelled — screen readers ke liye theek.
- Desktop / tablet / mobile teeno par test kiya; mobile par table apne andar scroll karta hai, page horizontally nahi.

## Files
- **Backend:** naya `proj/src/constants/SizeChart.js`, `proj/test/size-charts.test.js`; badle `src/models/StoreSettings.js`, `src/validators/settings.validators.js`, `src/services/settings.service.js`, `src/services/catalog.service.js` (detail mein `categoryAudience`), `docs/API.md`.
- **Admin:** naya `fe/src/components/settings/SizeChartsEditor.jsx`, `fe/e2e/size-charts.mocked-api.cjs`; badla `fe/src/pages/SettingsPage.jsx` (naya tab), `fe/src/components/common/Toggle.jsx` par koi change nahi (sirf `label` prop use kiya).
- **Website:** naya `web/src/components/SizeChart.jsx`, `web/src/components/sizeChart.test.js`, `web/e2e/size-chart.mocked-api.cjs`; badla `web/src/pages/ProductDetailPage.jsx`.

## Database / migration
`sizeCharts` ek naya optional field hai. **Koi migration nahi chahiye** — purane documents mein ye absent rehta hai aur sab kuch pehle ki tarah chalta hai. Jab pehli dafa Settings save hoti hai ya naya store document banta hai, kids chart default ke tor par bhar jata hai. Reverse karna ho to field ko ignore kar dein ya chart off kar dein; koi data overwrite nahi hota.

## Tests (jo actually chale)
- **Backend:** 325/325 (7 naye) — kids default, public view sirf enabled + non-empty charts deta hai, bina size wali rows drop, validator ke accept/reject cases, aur purane settings patch par koi asar nahi. Models stubbed hain, asli Mongo nahi.
- **Admin:** `tsc` clean, 99/99 unit, build OK; naya browser test 14/14 (kids pre-filled, columns editable, men chart banaya aur save hua, untouched audiences khali save hue, validation errors, row remove, restore button, chart off karna).
- **Website:** eslint clean, 75/75 unit (8 naye — chart selection aur fallbacks), build OK; naya browser test 23/23 (kids age ranges, men/women/unisex alag charts, selected row highlight, link scroll, fallback, empty states, semantics, teen viewports).
- **Regression:** admin products 26 / pack-wizard 21 / kids-retail 8 / smoke 66 / under-garments 11 / apply-colors 31; website smoke 118 / flows 142 / home-sections 11 / audience 14 / auth-session 13 / under-garments 48 / footer-social 20 — sab pass.

## Limitations
- Asli MongoDB ya live backend par test nahi hua; browser tests mocked API par chale.
- Men/Women/Unisex charts khali hain — jab tak aap Settings mein asli measurements nahi daalte, un products par section nahi dikhega (kids par dikhega).
- Ek product ke liye ek hi chart. Agar ek hi category mein alag-alag styles ke alag charts chahiye hon to per-product override karna padega — abhi nahi hai.
- Inches/cm ka toggle nahi banaya; agar dono chahiye to do columns bana lein ("Chest (in)" aur "Chest (cm)").
