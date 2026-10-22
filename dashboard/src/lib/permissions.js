/**
 * Frontend permission helpers. UX only: the backend re-checks every request.
 * Roles: customer | staff | admin (owner). Staff hold explicit "<module>.read|manage";
 * `manage` implies `read`; admin holds everything.
 */
export const ROLES = { CUSTOMER: 'customer', STAFF: 'staff', ADMIN: 'admin' };

export const MODULES = [
  'catalog',
  'inventory',
  'orders',
  'payments',
  'customers',
  'wholesale',
  'quotes',
  'manufacturing',
  'printing',
  'shipping',
  'coupons',
  'banners',
  'reviews',
  'analytics',
  'settings',
  'media',
];

export const MODULE_LABELS = {
  catalog: 'Catalog (categories, products, variants)',
  inventory: 'Inventory',
  orders: 'Orders, returns & cancellations',
  payments: 'Payments',
  customers: 'Customers',
  wholesale: 'Wholesale',
  quotes: 'Quotes',
  manufacturing: 'Manufacturing',
  printing: 'Printing & branding',
  shipping: 'Shipping rules',
  coupons: 'Coupons',
  banners: 'Banners',
  reviews: 'Reviews',
  analytics: 'Dashboard & analytics',
  settings: 'Store settings',
  media: 'Media library',
};

export const isOwner = (user) => user?.role === ROLES.ADMIN;
export const isBackOffice = (user) => user?.role === ROLES.ADMIN || user?.role === ROLES.STAFF;

export function can(user, permission) {
  if (!user) return false;
  if (user.role === ROLES.ADMIN) return true;
  if (user.role !== ROLES.STAFF) return false;
  const granted = user.permissions || [];
  if (granted.includes(permission)) return true;
  const [moduleName, level] = String(permission).split('.');
  return level === 'read' && granted.includes(`${moduleName}.manage`);
}

export const canRead = (user, moduleName) => can(user, `${moduleName}.read`);
export const canManage = (user, moduleName) => can(user, `${moduleName}.manage`);

/** Human role label for the UI. */
export const roleLabel = (user) =>
  user?.role === ROLES.ADMIN ? 'Owner' : user?.role === ROLES.STAFF ? 'Staff' : 'Customer';

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?';
