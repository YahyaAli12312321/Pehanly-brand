# PEHAN LY - Public Website

React 19 + Vite 8 + Tailwind 4 storefront for PEHAN LY (retail, wholesale, custom manufacturing, printing & branding).
It talks to the **same backend as the Admin Dashboard** (`/api/v1`). There is no mock business data.

## Stack
- Server state: TanStack Query 5 - Client/UI state: Zustand 5 (only cart + wishlist are persisted on-device)
- HTTP: Axios, `withCredentials`, HttpOnly cookie session (no tokens in JS, no auth data in storage)
- Routing: react-router-dom 7 (real, crawlable URLs; legacy `navigate('route-key')` API kept via `src/routes.js`)
- Tests: Vitest + Testing Library - Lint: ESLint 9

## Run
```bash
cp .env.example .env        # set VITE_API_BASE_URL / VITE_SITE_URL
npm install
npm run dev                 # http://localhost:3001, proxies /api to DEV_API_PROXY (default http://127.0.0.1:5000)
npm test                    # unit tests
npm run lint
npm run build               # vite build + sitemap.xml / robots.txt / _redirects into dist/
```

## Environment (browser-visible only - never put secrets in VITE_*)
| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | API base. `/api/v1` when served behind the same origin / reverse proxy |
| `VITE_SITE_URL` | Canonical origin for canonicals, JSON-LD, sitemap |
| `VITE_WHATSAPP_NUMBER` | Optional WhatsApp link |
| `SITEMAP_API_URL` | Build-time only: API base used to list products/categories in `sitemap.xml` |
| `DEV_API_PROXY` | Dev server proxy target |

## Deployment
1. **Same-origin (recommended):** serve `dist/` and reverse-proxy `/api/` to the backend. Cookies stay first-party; no CORS needed.
2. **Separate API domain:** add the website origin to the backend `CORS_ORIGINS` and set `COOKIE_SAMESITE`/`COOKIE_DOMAIN` appropriately (HTTPS required for `SameSite=None`).
3. SPA fallback: every unknown path must serve `index.html` (a `_redirects` file is generated for Netlify/Cloudflare; for nginx use `try_files $uri /index.html;`).
4. Serve `dist/robots.txt` and `dist/sitemap.xml` at the site root.

Optional prerendering for crawlers: `npm run prerender` (needs Playwright) - see `scripts/prerender.mjs` and the trade-off notes in `IMPLEMENTATION-REPORT.md`.

## Structure
```
src/config      env + brand placeholder images
src/services    axios client + API modules (catalog, account, b2b)
src/hooks       TanStack Query hooks, cart live-pricing
src/store       Zustand store (cart, wishlist, UI, session mirror)
src/seo         <Seo/> head manager + JSON-LD builders
src/pages       route pages (lazy-loaded)
src/components  Layout, Header, Footer, Search, shared states/forms
scripts         postbuild (sitemap/robots), optional prerender
```
