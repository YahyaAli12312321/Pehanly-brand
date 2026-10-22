# API Integration Report — PEHAN LY Admin Dashboard

Status key: **CONNECTED** = every UI action has a real backend endpoint · **PARTIAL** = connected, but some UI actions the original design implied have no backend support (listed in Notes) · **BLOCKED** = cannot be done until the backend adds something · **NOT APPLICABLE** = intentionally out of scope.
All paths are under `/api/v1`. Hooks are TanStack Query `useQuery`/`useMutation` calls inside each page, using the service module named.

| Module | Frontend page | Backend endpoint | Method | Service | Status | Notes |
|---|---|---|---|---|---|---|
| Auth | LoginPage, route guards | `/auth/login`, `/auth/me`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password` | POST/GET/POST/POST/POST | authApi | CONNECTED | HttpOnly cookie session. 401 clears the session and redirects to `/login`; 403 shows a no-access view. Non-back-office roles are refused. |
| Dashboard | DashboardPage + header drawers | `/admin/dashboard/summary`, `/admin/analytics` | GET | dashboardApi | CONNECTED | Revenue is labelled as order value, not profit. The activity feed became a Work Queue built from backend `attention` counts. Needs `analytics.read`. |
| Categories | CategoriesPage | `/admin/categories` (list, `/summary`, `/audiences`, `/:id`), POST, PATCH `/:id`, PATCH `/:id/status` | GET/POST/PATCH | categoriesApi | PARTIAL | No delete or duplicate endpoint: those buttons were removed (use deactivate). No sort by product count. |
| Products | ProductsPage, ProductEditor | `/admin/products` (list, `/summary`, `/:id`), POST, POST `/bulk`, PATCH `/:id`, PATCH `/:id/status` | GET/POST/PATCH | productsApi | PARTIAL | No delete or duplicate endpoint. |
| Variants / SKUs | ProductEditor | `/admin/products/:id/variants`, PATCH `/admin/products/:id/variants/:variantId` | POST/PATCH | productsApi | CONNECTED | Colour × size SKU editing, with backend validation errors shown on fields. Stock is read-only here. |
| Inventory | InventoryPage | `/admin/inventory`, `/summary`, `/:id/history`, POST `/:id/adjust` | GET/POST | inventoryApi | CONNECTED | Stock changes only through the adjust operation, with a backend reason code. Each change has history. |
| Orders | OrdersPage | `/admin/orders`, `/summary`, `/:id`, PATCH `/:id/status`, `/:id/shipment`, `/:id/notes`; `/admin/cancellations`, PATCH `/:id/review` | GET/PATCH | ordersApi | PARTIAL | Status moves follow the backend lifecycle; the UI offers only legal next states. Admin-created orders have no endpoint: orders come from checkout or converted quotes. |
| Customers | CustomersPage | `/admin/customers`, `/summary`, `/:id`, `/:id/orders`, PATCH `/:id/status` | GET/PATCH | customersApi | PARTIAL | Real data only. No admin-create and no data-export endpoint, so those buttons were removed. |
| Returns | ReturnsPage (new) | `/admin/returns`, `/:id`, PATCH `/:id/review`, `/receive`, `/inspect`, `/refund`, `/refund/complete-cod` | GET/PATCH | returnsApi | PARTIAL | Full flow: review → receive → inspect → prepare refund → complete COD refund. JazzCash provider refunds are not implemented in the backend, so those refunds stay pending. Uses `orders.*`. |
| Payments | PaymentsPage | `/admin/payments`, `/summary`, `/:id`, PATCH `/:id/cod/confirm` | GET/PATCH | paymentsApi | CONNECTED | COD and JazzCash only. `/summary` was unrouted in the backend; added in the backend patch. Refunds are handled through Returns. |
| Shipping | OrdersPage (shipment), SettingsPage → Shipping Rules | `/admin/orders/:id/shipment`, `/admin/shipping-rules` CRUD + `/:id/status` | GET/POST/PATCH/DELETE | ordersApi, settingsApi | CONNECTED | Rules: flat, city-based, free shipping; lower priority wins. Needs `shipping.read`/`manage`. |
| Wholesale | WholesalePage | `/admin/wholesale/requests` (+`/:id`, `/review`, `/approve`), `/stats`, `/packs` CRUD + `/:id/status` | GET/POST/PATCH | wholesaleApi | CONNECTED | Applications and Ready Packs. Approve takes an optional discount scheme. Pack editor picks real SKUs. |
| Manufacturing | ManufacturingPage | `/admin/manufacturing/requests` (+`/:id`, `/review`, `/approve`), `/catalog/:type`, POST/PATCH categories, styles, variants | GET/POST/PATCH | manufacturingApi | CONNECTED | Requests tab and catalog tab. |
| Printing & Branding | PrintingPage (`/printing`) | `/admin/printing/requests` (+`/:id`, `/review`, `/approve`, `/reject`), `/services` CRUD | GET/POST/PATCH/DELETE | printingApi | CONNECTED | One canonical route; `/printing-and-branding` redirects. Reject requires admin notes. Shows garmentSource, garmentDetails, colours and all backend fields. |
| Quotes | QuotesPage, CreateQuoteModal, QuickQuoteModal | `/admin/quotes`, `/:id`, POST `/wholesale\|/manufacturing\|/printing`, PATCH `/:id`, POST `/:id/send`, POST `/:id/convert-to-order` | GET/POST/PATCH | quotesApi | PARTIAL | Quotes are created only from an approved request. Drafts are editable; sending and conversion work. There is no admin accept/reject endpoint (customers respond), so no such button exists. Generic "new quote" and the fake conversion were removed. |
| Coupons | CouponsPage | `/admin/coupons`, `/:id`, POST, PATCH `/:id`, PATCH `/:id/status`, DELETE `/:id` | GET/POST/PATCH/DELETE | couponsApi | PARTIAL | No aggregate stats endpoint, so the KPI tiles show page-level figures only. Used coupons cannot be deleted (409): disable them instead. |
| Banners | BannersPage | `/admin/banners`, `/stats`, `/:id`, POST, PATCH, PATCH `/:id/status`, DELETE | GET/POST/PATCH/DELETE | bannersApi | CONNECTED | Marketing scope is banners only. Stats come from the backend. |
| Reviews | ReviewsPage | `/admin/reviews`, `/:id`, PATCH `/:id/approve`, `/reject`, PUT `/:id/reply` | GET/PATCH/PUT | reviewsApi | CONNECTED | Moderation only. Replies are allowed on approved reviews. |
| Analytics | AnalyticsPage | `/admin/analytics?range=7d\|30d\|90d\|6m\|1y` | GET | dashboardApi | PARTIAL | Checkout conversion is "Not tracked" (backend returns null). Net GMV is not profit. |
| Notifications | NotificationsPage, header bell | `/admin/notifications`, `/unread-count`, PATCH `/:id/read`, `/read-all` | GET/PATCH | notificationsApi | CONNECTED | Admin system notifications only (owner). No customer push. |
| Settings | SettingsPage | `/admin/settings` | GET/PATCH | settingsApi | PARTIAL | Profile, checkout and returns settings. The backend ignores empty email/social values, so those cannot be cleared. NTN/STRN, wholesale discount and low-stock default fields had no backend equivalent and were removed. |
| Staff | StaffPage (new), `/staff` | `/admin/staff`, `/permissions`, POST, PATCH `/:id`, PATCH `/:id/status`, POST `/:id/reset-password` | GET/POST/PATCH | staffApi | CONNECTED | Owner only. Role templates and a per-module none/view/manage matrix. No HR or payroll. |
| Audit Logs | AuditLogsPage (new), `/audit-logs` | `/admin/audit-logs` | GET | auditApi | CONNECTED | Owner only, read-only. Filters: action, entity type, entity id, date range; expandable metadata. |
| Media | ImageUpload, ImageGalleryUpload | `/media` (upload), `/admin/media`, DELETE `/media/:id` | POST/GET/DELETE | mediaApi | CONNECTED | All uploads go through the backend. No standalone media-library page was built. |
| Health | Sidebar system status | `/health/ready` | GET | healthApi | CONNECTED | |
| Inquiries | removed | — | — | — | NOT APPLICABLE | Removed entirely, per scope. |

## Totals
| Item | Count |
|---|---|
| Rows audited (modules/areas) | 25 |
| CONNECTED | 15 |
| PARTIAL | 9 |
| BLOCKED (whole module) | 0 — blocked *actions* are listed below |
| NOT APPLICABLE | 1 |
| New pages created | 5 — ReturnsPage, StaffPage, AuditLogsPage, LoginPage, NotFoundPage |
| API service modules created | 22 (`src/services/*Api.js`) |
| Mock code removed | `data/mockData.ts` (2,279 lines), `services/api.ts` (735), `services/storage.ts` (138), fake-token `services/apiClient.ts`, `types/index.ts`, plus page-level localStorage bypasses and hardcoded stats. Baseline matched ~39 lines on the mock/sample/localStorage/TODO sweep. |
| Intentional static-data occurrences left | 8 (below) |
| Build / lint / test | build OK · lint 0 errors · 20/20 tests (see FRONTEND-VERIFICATION.md) |

### Remaining sweep matches (all intentional)
1. `ErrorState.jsx` comment mentioning "fake" — a doc comment saying it never shows fake data.
2. `useAuth.js` comment — "never in localStorage".
3. `bannersApi.js` comment — "no lookbooks".
4. `inventoryApi.js` — `sample_pull_institutional_client` is a real backend inventory reason code.
5. `wholesaleApi.js` comment — backend stat field is named `totalInquiries` (the UI label says "Total Requests").
6. `toastStore.ts` — `Math.random` for toast element ids only.
7. `apiClient.js` comment — "no bearer token".
8. `PrintingPage.jsx` — "Sample images" is a real printing-request field label.


## Unresolved contract issues
**Backend (needs your decision):**
1. `GET /admin/payments/summary` exists in the controller but was not routed. Fixed in the backend patch (`adminPayment.routes.js`, one line, plus the docs row). Must be deployed with this frontend, otherwise the Payments KPI strip shows an error state with retry.
2. JazzCash refunds are not automated; a return refunded via JazzCash stays pending after "prepare refund".
3. No checkout-start tracking, so conversion cannot be shown.
4. No coupon aggregate stats; no category/product delete or duplicate; no admin create-customer, create-order, or export endpoints.
5. Settings PATCH ignores empty email/social values, so they cannot be cleared.
6. Dashboard `recentOrders` uses `id` where most other lists use `_id` (handled in the UI; flagging for consistency).

**Frontend:**
1. Not run against a live backend (see FRONTEND-VERIFICATION.md). Treat first contact with real data as the real integration test.
2. The pack editor SKU picker walks products → variants → sizes using `_id`s from the products API; confirm against real pack payloads.
3. Revenue chart on the Dashboard shows order value per day without refunds (no per-day refund data).
