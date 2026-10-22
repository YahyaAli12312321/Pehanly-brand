'use strict';

const router = require('express').Router();

const returnRefundRoutes = require('./adminReturnRefund.routes');
const wholesaleRoutes = require('./wholesale.routes');
const quoteRoutes = require('./quote.routes');
const manufacturingRoutes = require('./manufacturing.routes');
const printingRoutes = require('./printing.routes');
const paymentRoutes = require('./payment.routes');
const bannerRoutes = require('./banner.routes');
const reviewRoutes = require('./review.routes');

router.use('/reviews', reviewRoutes);
router.use('/health', require('./health.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/account', require('./account.routes'));

/*
 * Customer / guest orders only.
 * Admin order endpoints live exclusively under /admin/orders
 * (routes/admin.routes.js), behind authenticate + requireAdmin.
 */
router.use('/orders', require('./order.routes'));

router.use('/admin', require('./admin.routes'));
router.use('/returns', returnRefundRoutes);
router.use('/wholesale', wholesaleRoutes);
router.use('/quotes', quoteRoutes);
router.use('/manufacturing', manufacturingRoutes);
router.use('/printing', printingRoutes);
router.use('/shipping', require('./shippingRule.routes'));
router.use('/coupons', require('./coupon.routes'));
router.use('/payments', paymentRoutes);
router.use('/banners', bannerRoutes);
router.use('/media', require('./media.routes'));
router.use('/settings', require('./settings.routes'));
router.use('/catalog', require('./catalog.routes'));

module.exports = router;
