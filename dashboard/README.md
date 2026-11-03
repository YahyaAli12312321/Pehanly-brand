# PEHAN LY — Admin Dashboard

React 19 + Vite + Tailwind admin dashboard for the PEHAN LY backend (`/api/v1`).
Every screen reads and writes real backend data; there is no mock data layer.

## Run locally
```bash
npm ci                      # or: npm install
cp .env.example .env.local  # optional; defaults work with the backend on :5000
npm run dev                 # http://localhost:3000
```
- Auth is the backend's **HttpOnly `pl_session` cookie**. Nothing secret is stored in the browser.
- In development Vite proxies `/api` to `VITE_DEV_PROXY_TARGET` (default `http://localhost:5000`), so the app and API share an origin.
- The backend's `CORS_ORIGINS` must include the exact origin in the address bar (`http://localhost:3000`), otherwise register/login fail with `403 CORS_ORIGIN_NOT_ALLOWED`. The dev server uses a fixed port and stops if 3000 is busy.
- In production serve the SPA and proxy `/api` to the backend on the same origin (or set `VITE_API_BASE_URL` and configure CORS + cookies yourself).

## Scripts
| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with API proxy (port 3000) |
| `npm run build` | Production build to `dist/` |
| `npm run lint` | `tsc --noEmit` type/syntax check |
| `npm test` | Vitest unit tests |

## Structure
`src/lib` (axios client, error normalisation, permissions, formatters, query keys) · `src/services` (one API module per backend area) · `src/pages` · `src/components` · `src/store` (UI-only Zustand) · `src/hooks`.
Server state lives in TanStack Query; Zustand holds UI state only.

## Permissions
Staff hold `<module>.read|manage` (manage implies read); the owner holds everything. The UI hides what a user cannot use, but the backend enforces every rule. Staff, Audit Logs and Notifications are owner-only.
