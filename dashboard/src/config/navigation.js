import {
  LayoutDashboard,
  ShoppingBag,
  Warehouse,
  Users,
  CreditCard,
  Store,
  Factory,
  Printer,
  FileSpreadsheet,
  Tag,
  Image as ImageIcon,
  Star,
  RotateCcw,
  BarChart3,
  Settings,
  UserCog,
  ScrollText,
} from "lucide-react";

/** Canonical routes - the single source for the router, the Sidebar and in-app links. */
export const ROUTES = {
  dashboard: "/",
  categories: "/categories",
  products: "/products",
  orders: "/orders",
  inventory: "/inventory",
  customers: "/customers",
  payments: "/payments",
  returns: "/returns",
  wholesale: "/wholesale",
  manufacturing: "/manufacturing",
  printing: "/printing",
  quotes: "/quotes",
  coupons: "/coupons",
  banners: "/banners",
  reviews: "/reviews",
  analytics: "/analytics",
  notifications: "/notifications",
  settings: "/settings",
  staff: "/staff",
  auditLogs: "/audit-logs",
  login: "/login",
};

/** Retired spellings that still redirect so old bookmarks keep working. */
export const LEGACY_REDIRECTS = {
  "/printing-and-branding": ROUTES.printing,
  "/dashboard": ROUTES.dashboard,
};

/**
 * Sidebar structure. `permission` hides an item from staff who lack it (UX only);
 * `ownerOnly` items are for the owner (admin) account.
 */
export const NAV_SECTIONS = [
  {
    title: "Overview",
    items: [{ to: ROUTES.dashboard, label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    title: "Commerce",
    items: [
      {
        label: "Catalog",
        group: true,
        permission: "catalog.read",
        children: [
          { to: ROUTES.categories, label: "Categories", permission: "catalog.read" },
          { to: ROUTES.products, label: "Products", permission: "catalog.read" },
        ],
      },
      { to: ROUTES.orders, label: "Orders", icon: ShoppingBag, permission: "orders.read" },
      { to: ROUTES.inventory, label: "Inventory", icon: Warehouse, permission: "inventory.read" },
      { to: ROUTES.customers, label: "Customers", icon: Users, permission: "customers.read" },
      { to: ROUTES.payments, label: "Payments", icon: CreditCard, permission: "payments.read" },
    ],
  },
  {
    title: "B2B Manufacturing",
    items: [
      { to: ROUTES.wholesale, label: "Wholesale", icon: Store, permission: "wholesale.read" },
      { to: ROUTES.manufacturing, label: "Manufacturing", icon: Factory, permission: "manufacturing.read" },
      { to: ROUTES.printing, label: "Printing & Branding", icon: Printer, permission: "printing.read" },
      { to: ROUTES.quotes, label: "Quotes", icon: FileSpreadsheet, permission: "quotes.read" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { to: ROUTES.coupons, label: "Coupons & Offers", icon: Tag, permission: "coupons.read" },
      { to: ROUTES.banners, label: "Banners", icon: ImageIcon, permission: "banners.read" },
      { to: ROUTES.reviews, label: "Reviews", icon: Star, permission: "reviews.read" },
    ],
  },
  {
    title: "Support",
    items: [{ to: ROUTES.returns, label: "Returns & Refunds", icon: RotateCcw, permission: "orders.read" }],
  },
  {
    title: "System & Insights",
    items: [
      { to: ROUTES.analytics, label: "Analytics", icon: BarChart3, permission: "analytics.read" },
      { to: ROUTES.settings, label: "Settings", icon: Settings, permission: "settings.read" },
    ],
  },
  {
    title: "Administration",
    ownerOnly: true,
    items: [
      { to: ROUTES.staff, label: "Staff & Access", icon: UserCog, ownerOnly: true },
      { to: ROUTES.auditLogs, label: "Audit Logs", icon: ScrollText, ownerOnly: true },
    ],
  },
];

const BREADCRUMBS = [
  [ROUTES.categories, "Catalog", "Categories"],
  [ROUTES.products, "Catalog", "Products"],
  [ROUTES.orders, "Commerce", "Orders"],
  [ROUTES.inventory, "Commerce", "Inventory"],
  [ROUTES.customers, "Commerce", "Customers"],
  [ROUTES.payments, "Commerce", "Payments"],
  [ROUTES.wholesale, "B2B Manufacturing", "Wholesale"],
  [ROUTES.manufacturing, "B2B Manufacturing", "Manufacturing"],
  [ROUTES.printing, "B2B Manufacturing", "Printing & Branding"],
  [ROUTES.quotes, "B2B Manufacturing", "Quotes"],
  [ROUTES.coupons, "Marketing", "Coupons & Offers"],
  [ROUTES.banners, "Marketing", "Banners"],
  [ROUTES.reviews, "Marketing", "Reviews"],
  [ROUTES.returns, "Support", "Returns & Refunds"],
  [ROUTES.analytics, "System & Insights", "Analytics"],
  [ROUTES.notifications, "System & Insights", "Notifications"],
  [ROUTES.settings, "System & Insights", "Settings"],
  [ROUTES.staff, "Administration", "Staff & Access"],
  [ROUTES.auditLogs, "Administration", "Audit Logs"],
];

/** Header breadcrumb for a pathname. */
export function findBreadcrumb(pathname) {
  if (pathname === "/") return { section: "Overview", current: "Dashboard" };
  const hit = BREADCRUMBS.find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
  return hit ? { section: hit[1], current: hit[2] } : { section: "Console", current: "Overview" };
}
