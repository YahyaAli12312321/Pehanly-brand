'use strict';

/*
|--------------------------------------------------------------------------
| Staff Permissions (RBAC)
|--------------------------------------------------------------------------
|
| Roles
|   admin    owner; implicitly holds EVERY permission, can manage staff.
|   staff    holds only the permissions explicitly granted on the user.
|   customer storefront user; no admin access.
|
| Permissions follow "<module>.<read|manage>". `manage` implies `read`.
| Notifications / FCM devices and staff management are admin-only (V1 rule)
| and are therefore NOT assignable.
|--------------------------------------------------------------------------
*/

const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  STAFF: 'staff',
  ADMIN: 'admin',
});

const MODULES = Object.freeze([
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
]);

const PERMISSIONS = Object.freeze(
  MODULES.flatMap((moduleName) => [
    `${moduleName}.read`,
    `${moduleName}.manage`,
  ]),
);

/* Convenience presets the admin UI can offer; still stored as plain permissions. */
const ROLE_TEMPLATES = Object.freeze({
  catalog_manager: [
    'catalog.manage',
    'inventory.manage',
    'media.manage',
    'banners.manage',
    'reviews.manage',
  ],
  order_manager: [
    'orders.manage',
    'payments.read',
    'customers.read',
    'shipping.read',
    'inventory.read',
  ],
  b2b_manager: [
    'wholesale.manage',
    'quotes.manage',
    'manufacturing.manage',
    'printing.manage',
    'customers.read',
    'media.manage',
  ],
  analyst: ['analytics.read', 'orders.read', 'payments.read'],
});

/** True when `granted` (a list) satisfies `required` (manage implies read). */
function hasPermission(granted, required) {
  if (!Array.isArray(granted)) return false;
  if (granted.includes(required)) return true;

  const [moduleName, level] = String(required).split('.');
  return level === 'read' && granted.includes(`${moduleName}.manage`);
}

module.exports = {
  ROLES,
  MODULES,
  PERMISSIONS,
  ROLE_TEMPLATES,
  hasPermission,
};
