# PATCH-MANIFEST — Admin Dashboard (frontend)

Baseline = the uploaded AI Studio export (59 files). Apply: delete the DELETE list, then copy every file in `PEHANLY-Admin-Dashboard-PATCH.zip` over the project (CREATE and REPLACE), then `npm ci`.

Totals: CREATE 56 · REPLACE 34 · DELETE 7

## DELETE (7)
- `bun.lock`
- `metadata.json`
- `src/data/mockData.ts`
- `src/services/api.ts`
- `src/services/apiClient.ts`
- `src/services/storage.ts`
- `src/types/index.ts`

## REPLACE (34)
- `.env.example`
- `README.md`
- `index.html`
- `package.json`
- `src/App.jsx`
- `src/components/common/StatusBadge.jsx`
- `src/components/layout/AttentionQueueDrawer.jsx`
- `src/components/layout/B2BPipelineDrawer.jsx`
- `src/components/layout/CommandPaletteModal.jsx`
- `src/components/layout/Header.jsx`
- `src/components/layout/InventoryAlertsDrawer.jsx`
- `src/components/layout/NotificationsDrawer.jsx`
- `src/components/layout/QuickQuoteModal.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/pages/AnalyticsPage.jsx`
- `src/pages/BannersPage.jsx`
- `src/pages/CategoriesPage.jsx`
- `src/pages/CouponsPage.jsx`
- `src/pages/CustomersPage.jsx`
- `src/pages/DashboardPage.jsx`
- `src/pages/InventoryPage.jsx`
- `src/pages/ManufacturingPage.jsx`
- `src/pages/NotificationsPage.jsx`
- `src/pages/OrdersPage.jsx`
- `src/pages/PaymentsPage.jsx`
- `src/pages/PrintingPage.jsx`
- `src/pages/ProductsPage.jsx`
- `src/pages/QuotesPage.jsx`
- `src/pages/ReviewsPage.jsx`
- `src/pages/SettingsPage.jsx`
- `src/pages/WholesalePage.jsx`
- `src/store/uiStore.ts`
- `tsconfig.json`
- `vite.config.ts`

## CREATE (56)
- `docs/API-INTEGRATION-REPORT.md`
- `docs/FRONTEND-VERIFICATION.md`
- `package-lock.json`
- `src/components/auth/guards.jsx`
- `src/components/common/ErrorState.jsx`
- `src/components/common/FilterSelect.jsx`
- `src/components/common/ImageGalleryUpload.jsx`
- `src/components/common/ImageUpload.jsx`
- `src/components/common/PageLoader.jsx`
- `src/components/common/Toggle.jsx`
- `src/components/products/ProductEditor.jsx`
- `src/components/products/VariantCard.jsx`
- `src/components/products/variantDraft.js`
- `src/components/quotes/CreateQuoteModal.jsx`
- `src/config/navigation.js`
- `src/hooks/useAuth.js`
- `src/hooks/useDebouncedValue.js`
- `src/lib/apiClient.js`
- `src/lib/apiError.js`
- `src/lib/apiError.test.js`
- `src/lib/attention.js`
- `src/lib/formErrors.js`
- `src/lib/format.js`
- `src/lib/format.test.js`
- `src/lib/notificationTypes.js`
- `src/lib/orderLifecycle.js`
- `src/lib/permissions.js`
- `src/lib/permissions.test.js`
- `src/lib/queryKeys.js`
- `src/pages/AuditLogsPage.jsx`
- `src/pages/LoginPage.jsx`
- `src/pages/NotFoundPage.jsx`
- `src/pages/ReturnsPage.jsx`
- `src/pages/StaffPage.jsx`
- `src/services/auditApi.js`
- `src/services/authApi.js`
- `src/services/bannersApi.js`
- `src/services/categoriesApi.js`
- `src/services/couponsApi.js`
- `src/services/customersApi.js`
- `src/services/dashboardApi.js`
- `src/services/healthApi.js`
- `src/services/inventoryApi.js`
- `src/services/manufacturingApi.js`
- `src/services/mediaApi.js`
- `src/services/notificationsApi.js`
- `src/services/ordersApi.js`
- `src/services/paymentsApi.js`
- `src/services/printingApi.js`
- `src/services/productsApi.js`
- `src/services/quotesApi.js`
- `src/services/returnsApi.js`
- `src/services/reviewsApi.js`
- `src/services/settingsApi.js`
- `src/services/staffApi.js`
- `src/services/wholesaleApi.js`

## Dependency changes (package.json)
- Removed unused AI Studio packages: `@google/genai`, `dotenv`, `express`, `motion`, `autoprefixer`, `esbuild`, `tsx`, `@types/express` (they caused `npm ERESOLVE` and the Gemini key had no place in a dashboard).
- Added dev dependency `vitest`; added `lint` and `test` scripts. No existing package versions were upgraded. `bun.lock` removed; `package-lock.json` added (npm is the single package manager).

## Backend patch required alongside this frontend
- REPLACE `src/routes/adminPayment.routes.js` — adds `GET /admin/payments/summary` (above `/:id`).
- REPLACE `docs/API_ROUTES.md` — documents that route.
Shipped as `PEHANLY-Backend-payments-summary-PATCH.zip`.

## Notes
- `metadata.json` (AI Studio) deleted; `README.md` rewritten; `.env.example` added; `vite.config.ts` has the `/api` dev proxy on port 3000.
- `docs/API-INTEGRATION-REPORT.md` and `docs/FRONTEND-VERIFICATION.md` ship inside the project too.
