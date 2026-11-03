'use strict';

/*
|--------------------------------------------------------------------------
| Admin dashboard (read-only aggregates over real collections)
|--------------------------------------------------------------------------
|
| There is no "dashboard" or "analytics" collection; every figure is computed
| from Orders, Skus and the request collections.
|
| NAMING: "revenue" is the order total (sales value) of non-cancelled orders
| in the period. It is NOT profit; costs are not tracked.
| Day / week / month boundaries use the business time zone (config.timezone).
|--------------------------------------------------------------------------
*/

const Order = require('../models/order.model');
const Sku = require('../models/Sku');
const CancellationRequest = require('../models/CancellationRequest');
const ReturnRefundRequest = require('../models/ReturnRefundRequest');
const Wholesale = require('../models/Wholesale');
const Manufacturing = require('../models/Manufacturing');
const Printing = require('../models/Printing');
const Quote = require('../models/Quote');
const Review = require('../models/Review');

const { ORDER_STATUSES } = require('../constants/Order');
const { RETURN_STATUSES } = require('../constants/ReturnRefund');
const { QUOTE_STATUSES } = require('../constants/Quote');

function startOfToday(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(now) {
  // Monday-based week.
  const d = startOfToday(now);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d;
}

function startOfMonth(now) {
  const d = startOfToday(now);
  d.setDate(1);
  return d;
}

async function revenueSince(start, end) {
  const [row] = await Order.aggregate([
    {
      $match: {
        placedAt: { $gte: start, $lte: end },
        orderStatus: { $ne: ORDER_STATUSES.CANCELLED },
      },
    },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$pricing.total' },
        orders: { $sum: 1 },
      },
    },
  ]);

  return { revenue: row?.revenue || 0, orders: row?.orders || 0 };
}

async function getSummary(now = new Date()) {
  const today = startOfToday(now);
  const week = startOfWeek(now);
  const month = startOfMonth(now);

  const [
    todayStats,
    weekStats,
    monthStats,
    statusRows,
    pendingCancellations,
    pendingReturns,
    pendingWholesale,
    pendingManufacturing,
    pendingPrinting,
    quotesAwaitingCustomer,
    acceptedQuotesToConvert,
    lowStockSkus,
    outOfStockSkus,
    pendingReviews,
    recentOrders,
  ] = await Promise.all([
    revenueSince(today, now),
    revenueSince(week, now),
    revenueSince(month, now),

    Order.aggregate([{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),

    CancellationRequest.countDocuments({ status: 'pending' }),
    ReturnRefundRequest.countDocuments({ returnStatus: RETURN_STATUSES.PENDING }),
    Wholesale.countDocuments({ documentType: 'request', status: 'pending' }),
    Manufacturing.countDocuments({ documentType: 'request', status: 'pending' }),
    Printing.countDocuments({ documentType: 'request', status: 'pending' }),
    Quote.countDocuments({ status: QUOTE_STATUSES.SENT }),
    Quote.countDocuments({ status: QUOTE_STATUSES.ACCEPTED, order: null }),

    Sku.countDocuments({ isEnabled: true, stockStatus: 'low' }),
    Sku.countDocuments({ isEnabled: true, stockStatus: 'out' }),

    Review.countDocuments({ status: 'pending' }),

    Order.find({})
      .sort({ placedAt: -1 })
      .limit(8)
      .select('orderNumber orderType orderStatus paymentStatus pricing.total customer.name placedAt')
      .lean(),
  ]);

  const ordersByStatus = Object.fromEntries(
    Object.values(ORDER_STATUSES).map((status) => [status, 0]),
  );

  for (const row of statusRows) {
    ordersByStatus[row._id] = row.count;
  }

  return {
    generatedAt: now,
    timezone: require('../config/env').config.timezone,
    note: 'Revenue is the total value of non-cancelled orders. It is not profit.',

    revenue: {
      today: todayStats.revenue,
      thisWeek: weekStats.revenue,
      thisMonth: monthStats.revenue,
    },

    orders: {
      today: todayStats.orders,
      thisWeek: weekStats.orders,
      thisMonth: monthStats.orders,
      byStatus: ordersByStatus,
    },

    attention: {
      pendingCancellations,
      pendingReturns,
      pendingWholesaleRequests: pendingWholesale,
      pendingManufacturingRequests: pendingManufacturing,
      pendingPrintingRequests: pendingPrinting,
      quotesAwaitingCustomer,
      acceptedQuotesToConvert,
      pendingReviews,
      lowStockSkus,
      outOfStockSkus,
    },

    recentOrders: recentOrders.map((order) => ({
      id: String(order._id),
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      total: order.pricing?.total ?? 0,
      customerName: order.customer?.name,
      placedAt: order.placedAt,
    })),
  };
}

module.exports = {
  getSummary,
  // exported for tests
  startOfToday,
  startOfWeek,
  startOfMonth,
};
