import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./hooks/useAuth";
import { AdminLayout } from "./components/layout/AdminLayout";
import { RequireAuth, RequirePermission } from "./components/auth/guards";
import { PageLoader } from "./components/common/PageLoader";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { LEGACY_REDIRECTS, ROUTES } from "./config/navigation";

// Pages are code-split so recharts and the big forms don't weigh down the first paint.
const page = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const DashboardPage = page(() => import("./pages/DashboardPage"), "DashboardPage");
const CategoriesPage = page(() => import("./pages/CategoriesPage"), "CategoriesPage");
const ProductsPage = page(() => import("./pages/ProductsPage"), "ProductsPage");
const OrdersPage = page(() => import("./pages/OrdersPage"), "OrdersPage");
const InventoryPage = page(() => import("./pages/InventoryPage"), "InventoryPage");
const CustomersPage = page(() => import("./pages/CustomersPage"), "CustomersPage");
const PaymentsPage = page(() => import("./pages/PaymentsPage"), "PaymentsPage");
const ReturnsPage = page(() => import("./pages/ReturnsPage"), "ReturnsPage");
const WholesalePage = page(() => import("./pages/WholesalePage"), "WholesalePage");
const ManufacturingPage = page(() => import("./pages/ManufacturingPage"), "ManufacturingPage");
const PrintingPage = page(() => import("./pages/PrintingPage"), "PrintingPage");
const QuotesPage = page(() => import("./pages/QuotesPage"), "QuotesPage");
const CouponsPage = page(() => import("./pages/CouponsPage"), "CouponsPage");
const BannersPage = page(() => import("./pages/BannersPage"), "BannersPage");
const ReviewsPage = page(() => import("./pages/ReviewsPage"), "ReviewsPage");
const AnalyticsPage = page(() => import("./pages/AnalyticsPage"), "AnalyticsPage");
const NotificationsPage = page(() => import("./pages/NotificationsPage"), "NotificationsPage");
const SettingsPage = page(() => import("./pages/SettingsPage"), "SettingsPage");
const StaffPage = page(() => import("./pages/StaffPage"), "StaffPage");
const AuditLogsPage = page(() => import("./pages/AuditLogsPage"), "AuditLogsPage");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
      // Retry only transient failures (network / 5xx). 4xx answers are final.
      retry: (failureCount, error) => (error?.status === 0 || error?.status >= 500) && failureCount < 2
    },
    mutations: { retry: false }
  }
});

/** A gated group of routes: every child inherits the permission check. */
const gated = (permission, children, what) => <Route element={<RequirePermission permission={permission} what={what} />}>{children}</Route>;

export default function App() {
  return <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path={ROUTES.login} element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              <Route element={<RequireAuth />}>
                <Route path="/" element={<AdminLayout />}>
                  <Route index element={<DashboardPage />} />

                  {gated("catalog.read", <>
                    <Route path="categories" element={<CategoriesPage />} />
                    <Route path="products" element={<ProductsPage />} />
                    <Route path="products/:id" element={<ProductsPage />} />
                  </>, "Catalog")}
                  {gated("orders.read", <>
                    <Route path="orders" element={<OrdersPage />} />
                    <Route path="orders/:id" element={<OrdersPage />} />
                    <Route path="returns" element={<ReturnsPage />} />
                    <Route path="returns/:id" element={<ReturnsPage />} />
                  </>, "Orders")}
                  {gated("inventory.read", <Route path="inventory" element={<InventoryPage />} />, "Inventory")}
                  {gated("customers.read", <><Route path="customers" element={<CustomersPage />} /><Route path="customers/:id" element={<CustomersPage />} /></>, "Customers")}
                  {gated("payments.read", <>
                    <Route path="payments" element={<PaymentsPage />} />
                    <Route path="payments/:id" element={<PaymentsPage />} />
                  </>, "Payments")}

                  {gated("wholesale.read", <>
                    <Route path="wholesale" element={<WholesalePage />} />
                    <Route path="wholesale/:id" element={<WholesalePage />} />
                  </>, "Wholesale")}
                  {gated("manufacturing.read", <>
                    <Route path="manufacturing" element={<ManufacturingPage />} />
                    <Route path="manufacturing/:id" element={<ManufacturingPage />} />
                  </>, "Manufacturing")}
                  {gated("printing.read", <>
                    <Route path="printing" element={<PrintingPage />} />
                    <Route path="printing/:id" element={<PrintingPage />} />
                  </>, "Printing & Branding")}
                  {gated("quotes.read", <>
                    <Route path="quotes" element={<QuotesPage />} />
                    <Route path="quotes/:id" element={<QuotesPage />} />
                  </>, "Quotes")}

                  {gated("coupons.read", <Route path="coupons" element={<CouponsPage />} />, "Coupons")}
                  {gated("banners.read", <Route path="banners" element={<BannersPage />} />, "Banners")}
                  {gated("reviews.read", <>
                    <Route path="reviews" element={<ReviewsPage />} />
                    <Route path="reviews/:id" element={<ReviewsPage />} />
                  </>, "Reviews")}

                  {gated("analytics.read", <Route path="analytics" element={<AnalyticsPage />} />, "Analytics")}
                  {gated("settings.read", <Route path="settings" element={<SettingsPage />} />, "Settings")}

                  {/* Owner-only on the backend */}
                  <Route element={<RequirePermission ownerOnly what="this page" />}>
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="staff" element={<StaffPage />} />
                    <Route path="audit-logs" element={<AuditLogsPage />} />
                  </Route>

                  {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => <Route key={from} path={from.slice(1)} element={<Navigate to={to} replace />} />)}
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>;
}
