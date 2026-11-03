'use strict';

/*
 * Daily admin summary (reporting logic + WhatsApp message). Run it from the existing maintenance worker
 * (`whatsapp-daily-summary`, see src/jobs/maintenance.js). The project's worker has no clock of its own, so schedule
 * `node scripts/worker.js --once` (or the BullMQ repeat job) at the time you want the summary; nothing new is scheduled here.
 *
 * Definitions (PKR orders only, so currencies are never added together):
 *   totalOrders      orders placed that day (any status)
 *   totalSales       sum of order totals placed that day, cancelled orders excluded
 *   totalRevenue     money actually received: payments marked paid that day
 *   pendingPayments  open orders (not cancelled) whose payment is still pending / processing, at the time of the run
 *   wholesaleOrders  wholesale orders placed that day
 *   lowStockProducts distinct products with at least one SKU currently in "low" stock
 */

const Order = require('../../models/order.model');
const Payment = require('../../models/Payment');
const Sku = require('../../models/Sku');
const { WHATSAPP_EVENTS: E } = require('../../constants/WhatsApp');
const { dispatchToAdmins } = require('./whatsapp.service');

function dayRange(day = 'today', now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0); // process TZ is the business time zone (BUSINESS_TIMEZONE)
  if (day === 'yesterday') start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

const pkr = { $or: [{ currency: 'PKR' }, { currency: { $exists: false } }, { currency: null }] };

async function buildDailySummary({ day = 'today', now = new Date() } = {}) {
  const { start, end } = dayRange(day, now);
  const placed = { placedAt: { $gte: start, $lt: end }, ...pkr };

  const [orders, sales, revenue, pendingPayments, wholesaleOrders, lowProducts] = await Promise.all([
    Order.countDocuments(placed),
    Order.aggregate([{ $match: { ...placed, orderStatus: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$pricing.total' } } }]),
    Payment.aggregate([{ $match: { status: 'paid', paidAt: { $gte: start, $lt: end }, ...pkr } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Order.countDocuments({ orderStatus: { $ne: 'cancelled' }, paymentStatus: { $in: ['pending', 'processing'] } }),
    Order.countDocuments({ ...placed, orderType: 'wholesale' }),
    Sku.distinct('product', { stockStatus: 'low' }),
  ]);

  return {
    date: start.toISOString().slice(0, 10),
    totalOrders: orders,
    totalSales: sales[0]?.total || 0,
    totalRevenue: revenue[0]?.total || 0,
    pendingPayments,
    wholesaleOrders,
    lowStockProducts: lowProducts.length,
  };
}

/** Builds the summary and sends it to every admin recipient (once per day and recipient: re-running the task does not repeat it). */
async function sendDailySummary(options = {}) {
  const summary = await buildDailySummary(options);
  const results = await dispatchToAdmins({
    event: E.ADMIN_DAILY_SUMMARY,
    entity: { type: 'summary', reference: summary.date },
    variables: summary,
    idempotencyKey: `admin_daily_summary:${summary.date}`,
  });
  return { summary, recipients: results.length };
}

module.exports = { buildDailySummary, sendDailySummary, dayRange };
