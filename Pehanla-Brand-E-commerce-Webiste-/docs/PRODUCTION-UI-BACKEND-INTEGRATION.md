# PEHANLY website: production UI + backend integration (delivery / payment / wholesale / manufacturing / printing / header)

Status: **implemented and tested against stubbed models and a mocked API. Not verified against a real MongoDB, and not visually signed off against the approved screenshots. Not claimed production-ready.** See section 13.

## 1. Root causes

| Problem | Root cause |
|---|---|
| "Delivery unavailable" outside Karachi | Two independent causes. (a) Backend `shippingRule.service` threw `SHIPPING_NOT_AVAILABLE` for any city with no ShippingRule, so a missing rate was reported as "we do not deliver". (b) Checkout and the product page were hard-wired to COD, so COD-unavailable was shown as delivery-unavailable. Delivery and payment were not separate concepts. |
| Wholesale had no prices / cart / tiers | The backend wholesale module is request-and-quote only: no tier pricing, no preview, no freight/tax, public catalogue hides wholesale price. The page therefore had nothing authoritative to show. |
| Manufacturing / printing pages | Functional but a plain list + form; no gallery, spec, placement interaction, or capability content. |
| Header overflow | At 1024px the full nav + utility cluster overflowed (cart button ~90px off-screen); at 390px the menu button was off-screen (found by the new header audit). The compact currency selector also ignored `hidden` on phones (Tailwind `inline-flex` in the component's base class won). |

## 2. Frontend files changed (website, `web/`)

CheckoutPage, CartPage, ProductDetailPage, HomePage, ShopPage (copy), Header, Footer, WholesalePage (rewritten), CustomManufacturingPage (rewritten), ManufacturingDetailPage (rewritten), PrintingBrandingPage (rewritten);
new: `components/wholesale/{AllocationPanel,Builder,ReadyPacks,WholesaleCart}.jsx`, `components/manufacturing/{GalleryModal,InquiryForm,StyleCard}.jsx`, `components/PlacementVisualizer.jsx`, `store/useWholesaleCartStore.js`, `utils/wholesaleCart.js` (+ `.test.js`), `hooks/usePaymentAvailability.js` (rewritten), `hooks/useQueries.js`, `services/accountApi.js`, `services/b2bApi.js`, `e2e/flows.mocked-api.cjs`, `e2e/smoke.mocked-api.cjs` (updated).

## 3. Backend files changed (`proj/`)

New: `src/services/deliveryPolicy.service.js`, `scripts/ensure-pakistan-shipping-rule.js`, `test/delivery-payment.test.js`, `test/wholesale-preview.test.js`.
Updated: `constants/{Currency,Payment}.js`, `models/{StoreSettings,order.model,Payment,Product,Wholesale}.js`, `validators/{settings,order,shippingRule,product,wholesale}.validators.js`, `services/{settings,order,payment,shippingRule,wholesale}.service.js`, controllers/routes for shipping options and wholesale, `package.json`, `test/{currency,phase2}.test.js`.

## 4. API / endpoints affected

| Endpoint | Change |
|---|---|
| `POST /shipping/options` (public, new) | `{subtotal, city, province?, country='Pakistan', currency}` -> `{deliverable, deliveryMessage, shipping, shippingIssue, payment: {methods, cod:{available,reason}, jazzcashManual:{available, accountTitle, walletNumber, instructions}}}` |
| `POST /orders` | new optional `paymentMethod` (`cod` \| `jazzcash_manual`, default `cod`), `paymentReference` (4-64 chars, manual only). New errors: `COD_NOT_AVAILABLE_FOR_LOCATION`, `PAYMENT_METHOD_UNAVAILABLE`, `DELIVERY_COUNTRY_UNSUPPORTED`, `PAYMENT_REFERENCE_NOT_APPLICABLE`, `SHIPPING_RATE_NOT_CONFIGURED` |
| `GET /settings/public` | `checkout.jazzcashManual` = `{enabled:true, accountTitle, walletNumber, instructions}` or `{enabled:false}`; `currencies.paymentMethods.PKR = ['cod','jazzcash_manual']`. No secrets. |
| `PATCH /admin/settings` | accepts `checkout.jazzcashManual.{enabled,accountTitle,walletNumber,instructions}` and `wholesale.{freightFlat,taxPercent}` |
| `GET /wholesale/catalog` (auth, new) | wholesale-enabled products with variants/sizes, wholesale price, MOQ, tiers, boolean availability (no stock counts) |
| `POST /wholesale/preview` (auth, new) | `{items:[{sku,quantity}]}` -> items with tier-adjusted unit price, per-product MOQ status, units, `pricing {subtotal, freight?, tax?, estimatedTotal, pending[]}`. Nothing persisted. |
| `POST /wholesale/requests/custom`, `POST /wholesale/packs/:id/request` | pricing snapshot now also stores `freight` / `tax` when configured; items store `baseWholesalePrice` / `tierDiscountPercent` when a tier applied. MOQ still enforced (`WHOLESALE_MOQ_NOT_MET`). |
| Admin product create/update | `wholesale.tiers: [{minQuantity>=2, discountPercent 0.01-90}]`, ordered, max 10 |

## 5. Shipping / serviceability

`deliveryPolicy.service` is the single source for both UI guidance and enforcement. Any valid Pakistani address is deliverable. ShippingRule still decides the charge. If PKR + Pakistan has no matching rule the backend answers `SHIPPING_RATE_NOT_CONFIGURED` (a configuration problem, reported as such, never "we don't deliver", never silently free). To add the Pakistan-wide fallback: `npm run ensure-pakistan-shipping-rule -- --rate=<PKR>` (idempotent; the business must choose the rate). Non-Pakistan addresses are not deliverable and get no payment method. USD stays blocked.

## 6. COD eligibility

COD only when city is Karachi (province blank or Sindh) and `checkout.codEnabled !== false`. Karachi + another province, Hyderabad, Lahore, Islamabad, Rawalpindi, Peshawar, Quetta, Gilgit are not eligible. Enforced in `createRetailOrder` (a hand-crafted API call gets `COD_NOT_AVAILABLE_FOR_LOCATION`); the UI shows "Cash on Delivery is currently available in Karachi only."

## 7. Manual JazzCash wallet

`Payment.gateway = jazzcash_manual`, status `pending`, optional customer transaction reference. Number/title/instructions come from Store Settings only. Offered only when `enabled` AND a wallet number is set. Staff confirm receipt with the existing confirm-payment endpoint (generalised to this gateway). The online JazzCash gateway is not offered or accepted anywhere. No other provider added.

## 8. Manufacturing

Main: hero "From Concept to Creation.", capability catalogue (real categories), signature silhouettes (real styles), Polo spotlight (only if a real style named Polo exists), inquiry form. Detail: breadcrumb, hero, spec sheet card (counts from real data only), capabilities, style cards, gallery modal (Model/Mockup tabs and colour chips built from the real media, selected configuration, hands the colour to the form), brief-checklist table, related silhouettes, inquiry form. Submits the existing authenticated contract. No invented counts, GSM, lead time or MOQ (the backend has none: "confirmed in your quote").

## 9. Printing & Branding

Six capability sections, services from the backend, working SVG placement visualizer (front: left/right chest, centre front, left sleeve; back: nape, centre back; click or keyboard), per-placement size/note, branding specification summary, packaging choice. Payload = existing `POST /printing/requests` (`placements[{name, description}]`, packaging appended to `requirements`, artwork via existing upload).

## 10. Wholesale

Ready Packs and Build Your Own both kept. Flow: browse -> add to wholesale cart (own store, separate from retail) -> size/colour allocation (sum must equal quantity, checkout blocked otherwise, backend revalidates) -> confirm allocation -> order summary -> Request Quote. All money comes from `/wholesale/preview`, one preview per backend request (manual lines = one custom request, each pack = its own pack request) so the preview matches what is submitted. The cart persists only SKU ids and quantities. Guests see no wholesale price. Freight/tax appear only if configured in settings, otherwise "Quoted by our team". Wholesale checkout is a quote request (the backend has no wholesale payment); no download/print was added.

## 11. Header / responsive

Full nav + wishlist heart at >=1280; below that a compact header (menu, search, cart; account/wishlist in the menu). Announcement: "COD IN KARACHI • DELIVERY ACROSS PAKISTAN" (or the settings announcement). Footer/home payment badges are settings-driven and say Karachi-only COD. Wishlist functionality untouched (product cards, PDP, account, menu).

## 12. Tests performed (see VERIFICATION.md for counts)

Backend unit/integration with stubbed models; website lint, vitest, build; Playwright against a MOCKED API for flows A-H and a 5-width responsive sweep (1440/1280/1024/768/390). The mock's wholesale preview re-implements the backend rules; the real backend rules are covered by `test/wholesale-preview.test.js`.

## 13. Remaining / not verified

- No real MongoDB was available: real transactions, real order/wholesale persistence, real payment confirm, real Pakistan rule creation were **not run**.
- Browser flows ran against a mocked API (and a sandbox without the icon font / remote images; icon width was emulated).
- Visual match to the approved screenshots was built from the written requirements and has not been pixel-reviewed by you.
- Data to configure after deploy: Pakistan ShippingRule (script), JazzCash wallet settings, wholesale freight/tax (optional), product tiers (optional), via the admin APIs. **The admin dashboard UI has no fields for these yet** (API only).
- A manual-wallet order is not held back from shipping until staff mark it paid (staff process).
- JazzCash online gateway: unverified (external dependency); not offered.


---

# Update: Wholesale redesign, Ready Packs, shipments, banners, header, PDP

## Root causes
1. **Manufacturing "401".** The backend public catalog routes (`/manufacturing/categories|styles|variants`) have no `authenticate` and return 200 to anonymous callers, even with a stale `pl_session` cookie (covered by `test/public-catalog-access.test.js`). Admin mutations are under `/admin/*` and return 401 unauthenticated. The 401 visible in the browser console is the guest `/auth/me` probe, which is expected. The only confirmed contributing defect was a 5-minute website cache that hid a newly created category; it is now 30 s. If a *catalog* URL really returns 401 in your browser, send the exact URL from the Network tab (it was not reproducible without MongoDB).
2. **PDP oversized on laptops.** Unbounded two-column grid, an image sized by width only, fixed large type. Now: `max-w-[1200px]`, `1.15fr/1fr` grid, image `aspect-[4/5]` capped by `min(100%, 72vh*0.8, 560px)`, clamp() type, smaller thumbnails/swatches.
3. **Shipment form assumed a courier everywhere.** Karachi orders are delivered by a local rider.
4. **Ready Packs lacked admin-managed presentation data**, and tiers could only be a percentage.

## Backend / API changes
- `GET /wholesale/packs`, `GET /wholesale/packs/:slug` now use `optionalAuth` and return `computed` figures from LIVE SKU data: `totalPieces`, `assortment` (per colour), `sizeCurve` (per size), `calculatedPrice`, `packPrice`, `perPiece`, `available`. Guests receive everything except prices (`computed.pricingHidden`). Packs whose SKUs are no longer wholesale-eligible are omitted publicly and flagged `available:false` in admin.
- Admin pack create/update accept: `badge`, `packPrice` (nullable), `compareAtValue` (nullable), `moq` (min packs, nullable), `dispatchText`, `isFeatured`.
- A fixed `packPrice` is spread across the pack lines (rounding absorbed by the last line) in preview and in pack requests.
- `POST /wholesale/preview` accepts `{items}` OR `{packId}` (mutually exclusive), plus optional `ordered:[{product, ordered}]`. Response adds `quoteRequired` and `allocation:{checked, matched, mismatches[]}`.
- `POST /wholesale/requests/custom` accepts `ordered`; a per-product mismatch is rejected with `400 ALLOCATION_MISMATCH` before anything is written.
- Product wholesale tiers: each tier is exactly one of `discountPercent`, `unitPrice` (flat per piece) or `quoteOnly:true`. Quantities must increase; discounts must not decrease; unit prices must not increase. A quote-only quantity is priced at the best priced tier below it and flagged `quoteRequired`.
- `GET /wholesale/catalog` adds `basePrice`, `retailPrice` and per-tier `unitPrice`/`quoteOnly` (display matrix; real totals always come from preview).
- Orders: `shipment.deliveryMethod` (`local_rider|courier`), `riderName`, `riderPhone`. `deliveryPolicy.assessShipment` decides: Karachi -> local rider (name + phone, no waybill/URL); elsewhere -> courier (partner + waybill, URL optional); local rider outside Karachi -> `409 LOCAL_RIDER_KARACHI_ONLY`.

## Database / model changes (no migration needed; all fields optional)
`Wholesale` (pack docs): `badge, packPrice, compareAtValue, moq, dispatchText, isFeatured`. `Product.wholesale.tiers[]`: `discountPercent` no longer required; `unitPrice`, `quoteOnly` added. `Order.shipment`: `deliveryMethod, riderName, riderPhone`. No new indexes.

## Admin (fe)
Ready Pack editor: badge, dispatch text, pack price, reference value, min packs, featured; list shows backend pack price and per-piece. Product editor (Wholesale step): quantity tier rows (price / % off / custom quote). Orders drawer: Delivery method + rider or courier fields; invoice shows the matching logistics.

## Website (web)
Wholesale: light hero with admin Wholesale banner (`wholesale_promo`) and real metrics, four feature cards, "Choose How You Want to Order" (two separate paths), pack cards, Build Your Own cards (tier matrix, active tier, +/- quantity, base vs retail, estimate, Allocate Sizes & Colors, Add to Wholesale Cart), allocation panel (count, remaining, Reset, Confirm & Save), "Wholesale Order Summary" with "Consolidated Invoice Estimate" and the two actions. Home: "Stock Your Business With PEHANLY" (admin packs) and "Build Your Clothing Brand With Us" lifecycle; the two-card Wholesale/Manufacturing section is untouched. Manufacturing hero: neutral background, copy left, admin `manufacturing_promo` image right (stacks on mobile). `BannerImage` handles loading skeleton, missing/failed image (local placeholder, no hotlink), object-fit and alt. Header: account icon removed from the icon row; Account is in the top utility bar (>= 640px) and the first item of the mobile menu; the top bar is now fixed 35px so it can never overlap the header.

## Decisions to confirm
- Wholesale prices stay hidden from signed-out visitors (earlier rule). Your reference shows public rates; say if you want them public.
- "Proceed to Wholesale Checkout" submits the validated cart as an order request (no payment is taken); there is no wholesale payment gateway, and none was added.
- "Trusted Across Pakistan" testimonials were NOT built: they would be invented customer reviews. Add real reviews to the backend first.
