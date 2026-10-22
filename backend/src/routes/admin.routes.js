'use strict';

const router = require('express').Router();

const {
  authenticate,
  requireAdmin,
  requireStaff,
  requireModule,
} = require('../middleware/auth');

const categoryRoutes = require('./category.routes');
const productRoutes = require('./product.routes');
const inventoryRoutes = require('./inventory.routes');

const adminOrderRoutes = require('./adminOrder.routes');
const adminCancellationRoutes = require('./adminCancellation.routes');
const adminReturnRefundRoutes = require('./adminReturnRefund.routes');
const adminPaymentRoutes = require('./adminPayment.routes');

const adminWholesaleRoutes = require('./adminWholesale.routes');
const adminQuoteRoutes = require('./adminQuote.routes');
const adminManufacturingRoutes = require('./adminManufacturing.routes');
const adminPrintingRoutes = require('./adminPrinting.routes');

const adminShippingRuleRoutes = require('./adminShippingRule.routes');
const adminCouponRoutes = require('./adminCoupon.routes');
const adminBannerRoutes = require('./adminBanner.routes');

const adminNotificationRoutes = require('./adminNotification.routes');
const adminDeviceRoutes = require('./adminDevice.routes');
const adminAnalyticsRoutes = require('./adminAnalytics.routes');
const adminReviewRoutes = require('./adminReview.routes');

const customerRoutes = require('./customer.routes');
const adminDashboardRoutes = require('./adminDashboard.routes');
const adminSettingsRoutes = require('./adminSettings.routes');
const adminMediaRoutes = require('./adminMedia.routes');
const adminStaffRoutes = require('./adminStaff.routes');
const adminAuditRoutes = require('./adminAudit.routes');
const auditAdminWrites = require('../middleware/auditAdminWrites');

/*
|--------------------------------------------------------------------------
| Back-office Guard
|--------------------------------------------------------------------------
|
| This MUST stay above every router.use('/...') below.
|
|   1. authenticate   valid session cookie of an active user
|   2. requireStaff   role admin (owner) or staff
|   3. per module     requireModule('<module>'):
|                       GET/HEAD   -> <module>.read   (or <module>.manage)
|                       otherwise  -> <module>.manage
|                     admin passes every module check; staff need the
|                     permission granted on their account.
|
| Notifications, FCM devices and staff management are OWNER-ONLY (admin).
|--------------------------------------------------------------------------
*/

router.use(authenticate, requireStaff);

/* Records every back-office write and refused attempt (field names only, never values). */
router.use(auditAdminWrites);

/* Catalog */
router.use('/categories', requireModule('catalog'), categoryRoutes);
router.use('/products', requireModule('catalog'), productRoutes);
router.use('/inventory', requireModule('inventory'), inventoryRoutes);

/* Orders */
router.use('/orders', requireModule('orders'), adminOrderRoutes);
router.use('/cancellations', requireModule('orders'), adminCancellationRoutes);
router.use('/returns', requireModule('orders'), adminReturnRefundRoutes);

/* Customers */
router.use('/customers', requireModule('customers'), customerRoutes);

/* Payments */
router.use('/payments', requireModule('payments'), adminPaymentRoutes);

/* B2B / Wholesale / Manufacturing / Printing */
router.use('/wholesale', requireModule('wholesale'), adminWholesaleRoutes);
router.use('/quotes', requireModule('quotes'), adminQuoteRoutes);
router.use('/manufacturing', requireModule('manufacturing'), adminManufacturingRoutes);
router.use('/printing', requireModule('printing'), adminPrintingRoutes);

/* Shipping and marketing */
router.use('/shipping-rules', requireModule('shipping'), adminShippingRuleRoutes);
router.use('/coupons', requireModule('coupons'), adminCouponRoutes);
router.use('/banners', requireModule('banners'), adminBannerRoutes);

/* Owner-only: notifications + FCM devices (V1 rule) */
router.use('/notifications', requireAdmin, adminNotificationRoutes);
router.use('/devices', requireAdmin, adminDeviceRoutes);

/* Analytics, dashboard, reviews, settings, media */
router.use('/analytics', requireModule('analytics'), adminAnalyticsRoutes);
router.use('/dashboard', requireModule('analytics'), adminDashboardRoutes);
router.use('/reviews', requireModule('reviews'), adminReviewRoutes);
router.use('/settings', requireModule('settings'), adminSettingsRoutes);
router.use('/media', requireModule('media'), adminMediaRoutes);

/* Owner-only: staff accounts and permissions */
router.use('/staff', requireAdmin, adminStaffRoutes);

/* Owner-only: read the audit trail */
router.use('/audit-logs', requireAdmin, adminAuditRoutes);

module.exports = router;
