'use strict';

const { config } = require('../config/env');

const Order = require('../models/order.model');

const ReturnRefundRequest =
  require('../models/ReturnRefundRequest');

const {
  ORDER_STATUSES,
} = require('../constants/Order');

const {
  RETURN_STATUSES,
  REFUND_STATUSES,
} = require('../constants/ReturnRefund');

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const REVENUE_STREAMS = Object.freeze([
  'retail',
  'wholesale',
  'manufacturing',
  'printing',
]);

const EXCLUDED_ORDER_STATUSES = Object.freeze([
  ORDER_STATUSES.CANCELLED,
]);

const EXCLUDED_RETURN_STATUSES = Object.freeze([
  RETURN_STATUSES.REJECTED,
  RETURN_STATUSES.CANCELLED,
]);

/*
|--------------------------------------------------------------------------
| Date Helpers
|--------------------------------------------------------------------------
*/

function startOfDay(date) {
  const result = new Date(date);

  result.setHours(
    0,
    0,
    0,
    0,
  );

  return result;
}

function endOfDay(date) {
  const result = new Date(date);

  result.setHours(
    23,
    59,
    59,
    999,
  );

  return result;
}

function subtractDays(
  date,
  days,
) {
  const result =
    new Date(date);

  result.setDate(
    result.getDate() - days,
  );

  return result;
}

function subtractMonths(
  date,
  months,
) {
  const result =
    new Date(date);

  result.setMonth(
    result.getMonth() - months,
  );

  return result;
}

/*
|--------------------------------------------------------------------------
| Resolve Selected + Previous Period
|--------------------------------------------------------------------------
*/

function getDateRange(
  range,
  now = new Date(),
) {
  const currentEnd =
    endOfDay(now);

  let currentStart;

  switch (range) {
    case '7d':
      currentStart =
        startOfDay(
          subtractDays(
            now,
            6,
          ),
        );
      break;

    case '90d':
      currentStart =
        startOfDay(
          subtractDays(
            now,
            89,
          ),
        );
      break;

    case '6m':
      currentStart =
        startOfDay(
          subtractMonths(
            now,
            6,
          ),
        );
      break;

    case '1y':
      currentStart =
        startOfDay(
          subtractMonths(
            now,
            12,
          ),
        );
      break;

    case '30d':
    default:
      currentStart =
        startOfDay(
          subtractDays(
            now,
            29,
          ),
        );
      break;
  }

  /*
  |--------------------------------------------------------------------------
  | Previous Period
  |--------------------------------------------------------------------------
  |
  | Exact same duration immediately before current period.
  |--------------------------------------------------------------------------
  */

  const durationMs =
    currentEnd.getTime() -
    currentStart.getTime() +
    1;

  const previousEnd =
    new Date(
      currentStart.getTime() - 1,
    );

  const previousStart =
    new Date(
      previousEnd.getTime() -
        durationMs +
        1,
    );

  return {
    current: {
      start: currentStart,
      end: currentEnd,
    },

    previous: {
      start: previousStart,
      end: previousEnd,
    },
  };
}

/*
|--------------------------------------------------------------------------
| Percentage Change
|--------------------------------------------------------------------------
*/

function percentageChange(
  current,
  previous,
) {
  if (
    previous === 0
  ) {
    if (current === 0) {
      return 0;
    }

    return null;
  }

  return Number(
    (
      ((current - previous) /
        previous) *
      100
    ).toFixed(2),
  );
}

/*
|--------------------------------------------------------------------------
| Safe Percentage
|--------------------------------------------------------------------------
*/

function percentage(
  numerator,
  denominator,
) {
  if (!denominator) {
    return 0;
  }

  return Number(
    (
      (numerator /
        denominator) *
      100
    ).toFixed(2),
  );
}

/*
|--------------------------------------------------------------------------
| Revenue Match
|--------------------------------------------------------------------------
|
| Cancelled orders are excluded.
|
| Revenue is based on placedAt because that is the authoritative commercial
| order timestamp in the current Order model.
|--------------------------------------------------------------------------
*/

function buildOrderPeriodMatch(
  start,
  end,
) {
  return {
    placedAt: {
      $gte: start,
      $lte: end,
    },

    orderStatus: {
      $nin:
        EXCLUDED_ORDER_STATUSES,
    },
  };
}

/*
|--------------------------------------------------------------------------
| Gross Revenue
|--------------------------------------------------------------------------
*/

async function getGrossRevenue({
  start,
  end,
}) {
  const result =
    await Order.aggregate([
      {
        $match:
          buildOrderPeriodMatch(
            start,
            end,
          ),
      },

      {
        $group: {
          _id: null,

          grossGmv: {
            $sum:
              '$pricing.total',
          },

          orderCount: {
            $sum: 1,
          },
        },
      },
    ]);

  return {
    grossGmv:
      result[0]?.grossGmv || 0,

    orderCount:
      result[0]?.orderCount || 0,
  };
}

/*
|--------------------------------------------------------------------------
| Completed Refunds
|--------------------------------------------------------------------------
|
| Refund date is processedAt.
|
| This means the refund impacts the financial period in which the refund
| actually completed, rather than rewriting historical order revenue.
|--------------------------------------------------------------------------
*/

async function getCompletedRefunds({
  start,
  end,
}) {
  const result =
    await ReturnRefundRequest.aggregate([
      {
        $match: {
          'refund.status':
            REFUND_STATUSES.COMPLETED,

          'refund.processedAt': {
            $gte: start,
            $lte: end,
          },
        },
      },

      {
        $group: {
          _id: null,

          amount: {
            $sum:
              '$refund.amount',
          },

          count: {
            $sum: 1,
          },
        },
      },
    ]);

  return {
    amount:
      result[0]?.amount || 0,

    count:
      result[0]?.count || 0,
  };
}

/*
|--------------------------------------------------------------------------
| Financial Overview
|--------------------------------------------------------------------------
*/

async function getFinancialOverview(
  period,
) {
  const [
    gross,
    refunds,
  ] =
    await Promise.all([
      getGrossRevenue(period),

      getCompletedRefunds(
        period,
      ),
    ]);

  const netGmv =
    Math.max(
      0,
      gross.grossGmv -
        refunds.amount,
    );

  const aov =
    gross.orderCount > 0
      ? Number(
          (
            netGmv /
            gross.orderCount
          ).toFixed(2),
        )
      : 0;

  return {
    grossGmv:
      gross.grossGmv,

    completedRefunds:
      refunds.amount,

    refundCount:
      refunds.count,

    netGmv,

    orderCount:
      gross.orderCount,

    aov,
  };
}

/*
|--------------------------------------------------------------------------
| Return Rate
|--------------------------------------------------------------------------
|
| Denominator:
| delivered orders during selected period.
|
| Numerator:
| distinct delivered orders that have at least one non-rejected /
| non-cancelled return request.
|--------------------------------------------------------------------------
*/

async function getReturnRate({
  start,
  end,
}) {
  const deliveredOrders =
    await Order.find({
      orderStatus:
        ORDER_STATUSES.DELIVERED,

      placedAt: {
        $gte: start,
        $lte: end,
      },
    })
      .select('_id')
      .lean();

  if (
    deliveredOrders.length === 0
  ) {
    return {
      deliveredOrders: 0,
      returnedOrders: 0,
      rate: 0,
    };
  }

  const orderIds =
    deliveredOrders.map(
      (order) =>
        order._id,
    );

  const returnedOrderIds =
    await ReturnRefundRequest.distinct(
      'order',
      {
        order: {
          $in:
            orderIds,
        },

        returnStatus: {
          $nin:
            EXCLUDED_RETURN_STATUSES,
        },
      },
    );

  return {
    deliveredOrders:
      orderIds.length,

    returnedOrders:
      returnedOrderIds.length,

    rate:
      percentage(
        returnedOrderIds.length,
        orderIds.length,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Revenue By Stream
|--------------------------------------------------------------------------
*/

async function getRevenueByStream({
  start,
  end,
}) {
  const result =
    await Order.aggregate([
      {
        $match:
          buildOrderPeriodMatch(
            start,
            end,
          ),
      },

      {
        $group: {
          _id:
            '$orderType',

          revenue: {
            $sum:
              '$pricing.total',
          },

          orders: {
            $sum: 1,
          },
        },
      },
    ]);

  const streams = {
    retail: {
      revenue: 0,
      orders: 0,
      share: 0,
    },

    wholesale: {
      revenue: 0,
      orders: 0,
      share: 0,
    },

    manufacturing: {
      revenue: 0,
      orders: 0,
      share: 0,
    },

    printing: {
      revenue: 0,
      orders: 0,
      share: 0,
    },
  };

  for (const item of result) {
    if (
      streams[item._id]
    ) {
      streams[item._id] = {
        revenue:
          item.revenue || 0,

        orders:
          item.orders || 0,

        share: 0,
      };
    }
  }

  const totalRevenue =
    Object.values(
      streams,
    ).reduce(
      (sum, stream) =>
        sum +
        stream.revenue,
      0,
    );

  for (
    const stream of
    REVENUE_STREAMS
  ) {
    streams[stream].share =
      percentage(
        streams[stream]
          .revenue,

        totalRevenue,
      );
  }

  return {
    totalRevenue,
    streams,
  };
}

/*
|--------------------------------------------------------------------------
| Chart Bucket Format
|--------------------------------------------------------------------------
*/

function getChartBucket(
  range,
) {
  /*
  |--------------------------------------------------------------------------
  | Short ranges = daily
  | Longer ranges = monthly
  |--------------------------------------------------------------------------
  */

  if (
    ['7d', '30d', '90d'].includes(
      range,
    )
  ) {
    return {
      format:
        '%Y-%m-%d',

      unit:
        'day',
    };
  }

  return {
    format:
      '%Y-%m',

    unit:
      'month',
  };
}

/*
|--------------------------------------------------------------------------
| Revenue Performance
|--------------------------------------------------------------------------
|
| Produces time-series data for:
| retail / wholesale / manufacturing / printing.
|--------------------------------------------------------------------------
*/

async function getRevenuePerformance({
  range,
  start,
  end,
}) {
  const bucket =
    getChartBucket(
      range,
    );

  const rows =
    await Order.aggregate([
      {
        $match:
          buildOrderPeriodMatch(
            start,
            end,
          ),
      },

      {
        $group: {
          _id: {
            period: {
              $dateToString: {
                format:
                  bucket.format,

                date:
                  '$placedAt',

                timezone:
                  config.timezone,
              },
            },

            stream:
              '$orderType',
          },

          revenue: {
            $sum:
              '$pricing.total',
          },
        },
      },

      {
        $sort: {
          '_id.period': 1,
        },
      },
    ]);

  const periods =
    new Map();

  for (const row of rows) {
    const period =
      row._id.period;

    if (
      !periods.has(
        period,
      )
    ) {
      periods.set(
        period,
        {
          period,

          retail: 0,
          wholesale: 0,
          manufacturing: 0,
          printing: 0,

          total: 0,
        },
      );
    }

    const point =
      periods.get(
        period,
      );

    if (
      REVENUE_STREAMS.includes(
        row._id.stream,
      )
    ) {
      point[
        row._id.stream
      ] =
        row.revenue || 0;

      point.total +=
        row.revenue || 0;
    }
  }

  return {
    bucket:
      bucket.unit,

    data:
      Array.from(
        periods.values(),
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Top Performing Products
|--------------------------------------------------------------------------
|
| Only retail + wholesale have actual Product references.
|
| Manufacturing and Printing are separate commercial streams and are NOT
| mixed into the product leaderboard.
|--------------------------------------------------------------------------
*/

async function getTopProducts({
  start,
  end,
  limit = 5,
}) {
  const result =
    await Order.aggregate([
      {
        $match: {
          ...buildOrderPeriodMatch(
            start,
            end,
          ),

          orderType: {
            $in: [
              'retail',
              'wholesale',
            ],
          },
        },
      },

      {
        $unwind:
          '$items',
      },

      {
        $match: {
          'items.product': {
            $ne: null,
          },
        },
      },

      {
        $group: {
          _id:
            '$items.product',

          productName: {
            $first:
              '$items.productName',
          },

          revenue: {
            $sum:
              '$items.lineTotal',
          },

          quantitySold: {
            $sum:
              '$items.quantity',
          },

          orderIds: {
            $addToSet:
              '$_id',
          },
        },
      },

      {
        $addFields: {
          orderCount: {
            $size:
              '$orderIds',
          },
        },
      },

      {
        $sort: {
          revenue: -1,
        },
      },

      {
        $limit:
          limit,
      },

      {
        $lookup: {
          from:
            'products',

          localField:
            '_id',

          foreignField:
            '_id',

          as:
            'product',
        },
      },

      {
        $unwind: {
          path:
            '$product',

          preserveNullAndEmptyArrays:
            true,
        },
      },

      {
        $project: {
          _id: 0,

          productId:
            '$_id',

          name: {
            $ifNull: [
              '$product.name',
              '$productName',
            ],
          },

          slug:
            '$product.slug',

          revenue: 1,

          quantitySold: 1,

          orderCount: 1,
        },
      },
    ]);

  const totalTopRevenue =
    result.reduce(
      (sum, item) =>
        sum +
        item.revenue,
      0,
    );

  return {
    products:
      result,

    topProduct:
      result[0] || null,

    totalTopRevenue,
  };
}

/*
|--------------------------------------------------------------------------
| Comparison
|--------------------------------------------------------------------------
*/

function buildComparison({
  currentFinancial,
  previousFinancial,

  currentReturnRate,
  previousReturnRate,
}) {
  return {
    netGmv:
      percentageChange(
        currentFinancial.netGmv,
        previousFinancial.netGmv,
      ),

    aov:
      percentageChange(
        currentFinancial.aov,
        previousFinancial.aov,
      ),

    /*
    |--------------------------------------------------------------------------
    | No checkout funnel tracking yet
    |--------------------------------------------------------------------------
    */

    checkoutConversion:
      null,

    /*
    |--------------------------------------------------------------------------
    | Difference in percentage points.
    |
    | Example:
    | Current 1.8%, previous 2.4%
    | = -0.6 percentage points
    |--------------------------------------------------------------------------
    */

    returnRate:
      Number(
        (
          currentReturnRate.rate -
          previousReturnRate.rate
        ).toFixed(2),
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Complete Analytics Dashboard
|--------------------------------------------------------------------------
*/

async function getAnalyticsDashboard({
  range = '30d',
}) {
  const dateRange =
    getDateRange(
      range,
    );

  const [
    currentFinancial,
    previousFinancial,

    currentReturnRate,
    previousReturnRate,

    revenueShare,
    revenuePerformance,

    topProducts,
  ] =
    await Promise.all([
      getFinancialOverview(
        dateRange.current,
      ),

      getFinancialOverview(
        dateRange.previous,
      ),

      getReturnRate(
        dateRange.current,
      ),

      getReturnRate(
        dateRange.previous,
      ),

      getRevenueByStream(
        dateRange.current,
      ),

      getRevenuePerformance({
        range,

        ...dateRange.current,
      }),

      getTopProducts(
        dateRange.current,
      ),
    ]);

  return {
    range,

    period: {
      start:
        dateRange.current.start,

      end:
        dateRange.current.end,
    },

    previousPeriod: {
      start:
        dateRange.previous.start,

      end:
        dateRange.previous.end,
    },

    overview: {
      netGmv:
        currentFinancial.netGmv,

      grossGmv:
        currentFinancial.grossGmv,

      completedRefunds:
        currentFinancial.completedRefunds,

      aov:
        currentFinancial.aov,

      orderCount:
        currentFinancial.orderCount,

      /*
      |--------------------------------------------------------------------------
      | Intentionally null
      |--------------------------------------------------------------------------
      |
      | Requires real checkout-start/session tracking.
      |--------------------------------------------------------------------------
      */

      checkoutConversion:
        null,

      returnRate:
        currentReturnRate.rate,
    },

    comparison:
      buildComparison({
        currentFinancial,
        previousFinancial,

        currentReturnRate,
        previousReturnRate,
      }),

    returns: {
      deliveredOrders:
        currentReturnRate.deliveredOrders,

      returnedOrders:
        currentReturnRate.returnedOrders,

      rate:
        currentReturnRate.rate,
    },

    revenueShare,

    revenuePerformance,

    topProducts,
  };
}

module.exports = {
  getAnalyticsDashboard,

  /*
  |--------------------------------------------------------------------------
  | Export helpers
  |--------------------------------------------------------------------------
  |
  | Useful later for Financial PDF without duplicating calculations.
  |--------------------------------------------------------------------------
  */

  getDateRange,
  getFinancialOverview,
  getReturnRate,
  getRevenueByStream,
  getRevenuePerformance,
  getTopProducts,
};