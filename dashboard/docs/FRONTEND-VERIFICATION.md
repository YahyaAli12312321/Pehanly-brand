# Frontend Verification — PEHAN LY Admin Dashboard

## What was run (in this workspace)
| Check | Result |
|---|---|
| `npm install` (lockfile generated, `bun.lock` removed) | OK |
| `npm run lint` (`tsc --noEmit`) | 0 errors |
| `tsc --checkJs` filtered for undefined names / missing exports / missing modules | 0 findings (the unfiltered checkJs run reports ~1,700 inference warnings, e.g. `useState(null)` typed as `never`; it was not used as a gate) |
| `npm run build` | OK |
| `npm test` (vitest) | 3 files, 20 tests pass: error normalisation, 422 field mapping, permissions (manage ⇒ read), order lifecycle, attention counters, formatters |
| Endpoint cross-check: every `get/post/patch/put/del` in `src/services` vs the backend route table (199 routes) | All match. `GET /admin/payments/summary` was missing from the backend and is added in the backend patch; quote creation uses `POST /admin/quotes/{wholesale\|manufacturing\|printing}` |
| Browser smoke test (headless Chromium, API stubbed at the network layer, stubs not shipped) | 22 routes load with no page errors or console errors; `/printing-and-branding` redirects to `/printing`; an unauthenticated visit redirects to `/login`; `localStorage` stays empty |
| Mock sweep (`mock, dummy, fake, sample, demo, seed, localStorage, TODO, console., innerHTML, eval, bearer, gemini, stripe, easypaisa, lookbook, inquir`) | 8 matches left, all intentional (see API-INTEGRATION-REPORT.md) |

## What was NOT verified
- **No live backend run.** No MongoDB or running API was available here. The smoke test used stubbed responses, so it proves the pages render and route correctly, not that real payloads match. Request/response shapes were taken from the backend source, validators and docs.
- Real login, the `pl_session` cookie, CSRF origin check and CORS were not exercised end to end.
- Cloudinary uploads, JazzCash, FCM and SMTP flows were not exercised.
- No component or end-to-end tests exist beyond the 20 unit tests. Forms, drawers and mutation flows have been exercised by code review only.
- No accessibility audit, visual regression check or cross-browser pass.
- Bundle: the largest chunks are the shared chart library (~373 kB) and the main bundle (~350 kB); pages are lazy-loaded.

## Recommended first run against the real backend
1. Start the backend with `CORS_ORIGINS` including `http://localhost:3000`, then `npm run dev`.
2. Sign in as the owner. Open every sidebar item and watch the network tab for 4xx/5xx.
3. Run one flow per module: create a category → product with variants → adjust stock → place an order from the storefront → advance its status → confirm COD → raise a return → approve a wholesale request → create and send a quote.
4. Sign in as a staff user with a single permission and confirm the other modules are hidden and direct URLs show the 403 view.
