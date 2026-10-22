import { get, cleanParams } from '../lib/apiClient';

/**
 * Dashboard + Analytics (admin). Both require analytics.read.
 * GET /admin/dashboard/summary ->
 *   { generatedAt, timezone, note, revenue{today,thisWeek,thisMonth}, orders{today,thisWeek,thisMonth,byStatus{status:count}},
 *     attention{pendingCancellations,pendingReturns,pendingWholesaleRequests,pendingManufacturingRequests,pendingPrintingRequests,
 *               quotesAwaitingCustomer,acceptedQuotesToConvert,pendingReviews,lowStockSkus,outOfStockSkus},
 *     recentOrders[{id,orderNumber,orderType,orderStatus,paymentStatus,total,customerName,placedAt}] }
 *   "Revenue" = value of non-cancelled orders. It is NOT profit.
 * GET /admin/analytics?range=7d|30d|90d|6m|1y ->
 *   { range, period{start,end}, previousPeriod, overview{netGmv,grossGmv,completedRefunds,aov,orderCount,checkoutConversion(null),returnRate},
 *     comparison{netGmv,aov,checkoutConversion(null),returnRate (% / pp change, may be null)}, returns{deliveredOrders,returnedOrders,rate},
 *     revenueShare{totalRevenue,streams{retail,wholesale,manufacturing,printing:{revenue,orders,share}}},
 *     revenuePerformance{bucket, data[{period,retail,wholesale,manufacturing,printing,total}]},
 *     topProducts{products[{productId,name,slug,revenue,quantitySold,orderCount}],topProduct,totalTopRevenue} }
 */
export const ANALYTICS_RANGES = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '3 Months' },
  { value: '6m', label: '6 Months' },
  { value: '1y', label: '1 Year' },
];

export const dashboardApi = {
  summary: async () => (await get('/admin/dashboard/summary')).data,
  analytics: async (range = '30d') => (await get('/admin/analytics', cleanParams({ range }))).data,
};
