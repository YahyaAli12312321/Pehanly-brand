# PEHAN LY Public Website - Implementation Report

Scope: the customer-facing website only (React 19 + Vite 8 + Tailwind 4). Backend and Admin Dashboard were delivered earlier and are not redone. Approved design preserved; UI changed only where needed for real data, validation, states, accessibility, SEO or broken behaviour.

## 1. What was built
- **Real data end to end.** All business data comes from the backend (`/api/v1`) through Axios + TanStack Query. All hardcoded products, prices, orders, profiles, promo codes, testimonials, ratings and stats were removed.
- **Real URLs.** `react-router-dom` with clean, crawlable paths: `/`, `/shop`, `/shop/:category`, `/product/:slug`, `/cart`, `/checkout`, `/order-confirmation`, `/track-order`, `/account`, `/wishlist`, `/about`, `/wholesale`, `/custom-manufacturing[/:category]`, `/printing-branding`, plus a real 404. The original `navigate('route-key')` API is kept (via `src/routes.js`), so the approved pages did not need rewiring.
- **Auth:** HttpOnly-cookie session (no tokens in JS or storage); session bootstrap via `/auth/me`; login, register, logout, forgot/reset password, change password, sign out other devices. 401s clear the session.
- **Server state vs client state:** TanStack Query (catalog, orders, account, B2B) vs Zustand (cart, wishlist, UI). Only cart and wishlist are persisted, never auth data.
- **Cart:** lines keyed by SKU id; every line is re-validated against the live catalog (current price, stock cap, availability). Out-of-stock/unavailable lines block checkout. The browser never sends prices or totals; the backend recomputes everything.

## 2. Coupon UX placement decisions (registered customers only)
Backend remains authoritative (`COUPON_AUTH_REQUIRED` for guests). Frontend gating is UX only.
| Context | Guest | Registered |
|---|---|---|
| **Cart** (order summary) | No input. Short note "Coupons are a member benefit" + Sign-in link | Coupon field; code is validated through `POST /coupons/validate`, real discount shown, removable; re-priced automatically when the subtotal changes |
| **Checkout** | Same sign-in note | Applied coupon shown in summary with remove; if none, a pointer back to the bag; code sent to the backend only for signed-in users |
| **Account -> Overview** | n/a | "Member offers" note explaining coupons apply in bag/checkout |
| **Home benefits strip** | "Create an account" CTA for member offers | "Member coupons at checkout" chip |
| **PDP / category / banners** | No coupon surfacing | No coupon surfacing |
Reasoning: the cart is the moment of intent and where a code is actually typed; checkout confirms it. PDP/listing placement would be intrusive and, without a customer-visible coupon list, would require showing codes the backend does not let us list. **Fake coupons and hardcoded discounts: none.**
**BLOCKED - BACKEND CONTRACT MISSING:** automatic *discovery* of available coupons (see `WEBSITE-BACKEND-CHANGES.md`, "Needs a backend decision").

## 3. Free shipping for guests
- Source of truth: the new public `GET /shipping/free-shipping` (lowest active `free_shipping` rule threshold) plus `GET /shipping/quote` for the exact amount. Nothing is hardcoded.
- Shown to everyone who qualifies (not guest-exclusive): announcement bar, PDP, home strip, cart progress bar ("Add Rs. X more to unlock free shipping"), checkout hint. Hidden entirely if the backend reports no rule.
- Guests additionally get a clear sign-in/register CTA instead of coupon access.

## 4. Feature map (existing feature -> backend -> status)
| Feature | Backend | Status |
|---|---|---|
| Browse / categories / search / sort / pagination | `/catalog/*` | Done (server-side). Colour, price and in-stock refinements run on the loaded page only |
| Size / GSM / silhouette filters | none | **BLOCKED - BACKEND CONTRACT MISSING** (removed; no data to filter on) |
| Product page: variants, sizes, stock, price, savings | `/catalog/products/:slug` | Done |
| Size-guide modal, fabric composition/"Garment Architecture" specs | none (no fields) | **BLOCKED - BACKEND CONTRACT MISSING** (sections removed rather than invented) |
| Reviews: summary, list, eligibility, submit (moderated) | `/reviews/*` | Done |
| Related products | `/catalog/products?category=` | Done |
| Delivery check | `/shipping/quote` | Done (by city, replaces the old pincode prompt) |
| Cart + live re-pricing | catalog | Done |
| Checkout (guest + registered), COD | `POST /orders` | Done. Totals come from the backend |
| Raast / JazzCash / online payment, GST 17% line | validator accepts `cod` only; no tax line | **BLOCKED** (removed; not faked) |
| Order confirmation | `POST /orders` response | Done |
| Guest order tracking | `POST /orders/guest/track` (order no. + email/phone) | Done |
| Account: profile, password, addresses, orders, order detail + status timeline, courier tracking, cancellation request, returns (request + list) | `/account/*`, `/orders/my*`, `/returns/*` | Done |
| Quotes: view, accept, decline | `/quotes/my*` | Done |
| Wishlist | none | **BLOCKED**; kept device-local (documented) |
| Size/fit "preferences" tab, "Priority Concierge" card | none | **BLOCKED** (removed; no backend) |
| Wholesale: ready packs, build-your-own (SKU x quantity), request | `/wholesale/*` | Done as **request-for-quote** (login required) |
| Wholesale MOQ + tier pricing, proforma PDF, cart/checkout | none | **BLOCKED** (the old retail-cart wholesale flow was removed; pricing arrives in the quote) |
| Manufacturing: categories -> styles -> colours (model/mockup media) -> RFQ | `/manufacturing/*` | Done (login required to submit) |
| Printing & branding: services, placement picker, artwork upload (<=5 files, 10 MB), RFQ | `/printing/*`, `/media` | Done (login required) |
| Portfolio gallery, client logos, testimonials, press, "1,840+ buyers" stats | none | Removed (unverifiable). Re-add once the owner supplies real material |
| Banners (hero/retail/wholesale/manufacturing promos) + impressions/clicks | `/banners*` | Done; sensible defaults when none are active |
**Ladies' Shoes rule:** retail only. Filtered out of the wholesale picker and manufacturing catalogue, and manufacturing detail returns 404 for such a category (unit-tested).

## 5. SEO
Done: unique title + description + canonical per page; one H1 per page (verified by test); breadcrumbs (UI + JSON-LD); Open Graph/Twitter; JSON-LD `Organization`, `WebSite`, `BreadcrumbList`, `Product` with `AggregateOffer` from real prices/stock, `ItemList` on listings; `aggregateRating` **only** when real approved reviews exist (unit-tested); no FAQ schema (no genuine FAQ data); `noindex` on cart, checkout, account, tracking, wishlist, search results, sorted/filtered views and 404s; canonical drops filters/sort (keeps `?page=N`); `robots.txt` and `sitemap.xml` generated at build (`SITEMAP_API_URL` adds categories/products); unknown product -> proper not-found view with `noindex`.
**Prerender / SSR trade-offs (decision for you; I did NOT migrate to Next.js):**
1. *Client-rendered SPA (delivered).* Zero extra infrastructure; Google renders JS and picks up titles/JSON-LD, but other crawlers/social scrapers may see an empty shell, and unknown URLs return HTTP 200 (soft 404, mitigated with `noindex`).
2. *Build-time prerender of static routes* (`npm run prerender`, Playwright, optional script included). Gives real HTML for home/shop/about/B2B pages cheaply; product pages need a re-run when the catalogue changes (CI/cron). Best next step.
3. *Prerender service / edge SSR for products* (e.g. a prerender proxy for bot user-agents) - good middle ground if the catalogue is large.
4. *Full SSR (Next.js/Remix)* - best SEO/social previews and true 404 status codes, but a rewrite and a Node runtime to operate. Only recommended if organic search becomes the main channel; needs your approval.
Social preview images for product pages rely on JS-rendered meta tags, so WhatsApp/Facebook scrapers may not see them without option 2-3.

## 6. Performance, accessibility, security
- **Performance:** route-level code splitting (lazy pages), vendor/query chunk split, `loading="lazy"`/`decoding="async"` and width/height on images, LCP image on PDP/hero marked `fetchpriority=high`, keep-previous-data pagination, no animation library. Build output: main ~47 kB, vendor ~251 kB (80 kB gz).
- **Accessibility:** skip link, single `main` landmark, focus moved to content on route change, real links/buttons (no click-divs on rewritten pages), labelled inputs with inline `role=alert` errors, `aria-live` toast, mobile menu and search as dialogs with Escape + focus return, radiogroups for colour/size, `aria-pressed/expanded/current`, reduced-motion respected for the hero.
- **Security:** no secrets or tokens in the bundle or storage; only the cart/wishlist are persisted; no `dangerouslySetInnerHTML`, no `console.log`, no `window.prompt`; external courier URLs validated as http(s) and opened with `rel=noopener noreferrer`; uploads restricted client-side by type/size (server also enforces); 4xx are not retried; errors are normalised and never echo raw server bodies.

## 7. Verification actually performed
| Check | Result |
|---|---|
| `vite build` (Vite 8 / Rolldown) | passes |
| `eslint src` | 0 errors, 0 warnings |
| Vitest (routes, formatting, cart store, SKU helpers, Ladies' Shoes rule, API-error mapping, JSON-LD honesty) | 17/17 pass; the suite found and I fixed a real bug (a zero-stock SKU could be added to the cart) |
| Playwright browser smoke against a **mocked API**: 15 routes, no console/page errors, one `main`/one `h1`, SEO tags/JSON-LD, 404s, size-required validation, sold-out size blocked, full guest purchase (order body contains only SKU+quantity+COD, no prices), cart cleared, registered login, coupon applied and sent only for a registered user, prefilled checkout, skip link | all pass (3 consecutive runs) |
| Backend suite after the free-shipping endpoint | 101/101 pass |
**Not verified (be aware):** no run against a live backend or MongoDB (none in the build environment), so real response shapes were matched to the backend source code, not observed live. Wholesale/manufacturing/printing submissions and uploads, password reset e-mail links, cancellation/returns/quote actions, and review submission are implemented against the validators but were not exercised in the browser. No Lighthouse/Core Web Vitals measurement, no screen-reader test, and no cross-browser testing were done.

## 8. Things you need to act on
1. **Placeholder images.** Header/footer logos, the home fallback hero/lookbook and About imagery are still hotlinked from the design tool (`lh3.googleusercontent.com`). Replace with files you own (`public/` or your media library) before launch - they can disappear and hurt performance/SEO. Hero/promo/category/product imagery otherwise comes from the backend.
2. **About-page copy** is the approved text, left as written; please confirm its factual claims (location, capabilities) are correct. All numeric social proof elsewhere was removed.
3. **Environment:** set `VITE_API_BASE_URL`, `VITE_SITE_URL`; for cross-origin APIs add the site to the backend `CORS_ORIGINS` and check cookie `SameSite`/`Secure` (see README).
4. **Backend decisions** listed at the end of `WEBSITE-BACKEND-CHANGES.md` (coupon discovery, wholesale tiers, wishlist, online payments).
5. Add and deploy the one backend patch (free-shipping endpoint) before the website, or the shipping messaging simply stays hidden (it fails closed).

## 9. Removed dead files
Unused `Header.tsx`, `Footer.tsx`, `types/*`, fake `services/api.js`, `data/products.ts`, `data/manufacturingData.js`, six unimported CSS files, `bun.lock`, AI-Studio `metadata.json`, and Gemini/Express/Recharts/Lucide/Motion dependencies.
