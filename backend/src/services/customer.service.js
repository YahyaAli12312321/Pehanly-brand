'use strict';

const mongoose = require('mongoose');

const User = require('../models/User');
const Order = require('../models/order.model');
const ApiError = require('../utils/ApiError');
const { escapeRegex } = require('../utils/slugify');
const { normalizePhone } = require('../utils/identity');
const audit = require('./audit.service');

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function normalizePaging(query = {}) {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit)) || 20));

  return { page, limit };
}

function paginationMeta(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function customerNumberFallback(id) {
  return `CUST-${String(id).slice(-6).toUpperCase()}`;
}

function defaultAddress(addresses = []) {
  if (!addresses.length) {
    return null;
  }

  return addresses.find((address) => address.isDefault) || addresses[0];
}

/*
 * Phones are stored canonical (+92XXXXXXXXXX). Admins usually type local
 * formats (03001234567), so search also tries the canonical forms.
 */
function buildPhoneSearchTerms(search) {
  const raw = String(search).trim();
  const terms = new Set();

  if (!raw) {
    return [];
  }

  terms.add(raw);

  const cleaned = raw.replace(/[\s\-().]/g, '');

  if (cleaned) {
    terms.add(cleaned);

    if (/^0\d+$/.test(cleaned)) {
      terms.add(`+92${cleaned.slice(1)}`);
    } else if (/^92\d+$/.test(cleaned)) {
      terms.add(`+${cleaned}`);
    } else if (/^0092\d+$/.test(cleaned)) {
      terms.add(`+${cleaned.slice(2)}`);
    }
  }

  const normalized = normalizePhone(raw);

  if (normalized) {
    terms.add(normalized);
  }

  return [...terms];
}

function buildStatusResponse(customer) {
  return {
    id: customer._id,

    customerNumber:
      customer.customerNumber || customerNumberFallback(customer._id),

    status: customer.isActive ? 'active' : 'suspended',

    suspendedAt: customer.suspendedAt ?? null,

    suspensionReason: customer.suspensionReason ?? null,
  };
}

/*
|--------------------------------------------------------------------------
| List Customers
|--------------------------------------------------------------------------
*/

async function list(query = {}) {
  const {
    search,
    status = 'all',
    tier = 'all',
    sortBy = 'createdAt',
    sortDir = 'desc',
  } = query;

  const { page, limit } = normalizePaging(query);

  const match = {
    role: 'customer',
  };

  if (status === 'active') {
    match.isActive = true;
  }

  if (status === 'suspended') {
    match.isActive = false;
  }

  if (tier !== 'all') {
    match.accountTier = tier;
  }

  if (search && String(search).trim()) {
    const term = String(search).trim();
    const regex = new RegExp(escapeRegex(term), 'i');

    match.$or = [
      { name: regex },
      { email: regex },
      { customerNumber: regex },
      ...buildPhoneSearchTerms(term).map((phoneTerm) => ({
        phone: new RegExp(escapeRegex(phoneTerm), 'i'),
      })),
    ];
  }

  const sortDirection = sortDir === 'asc' ? 1 : -1;

  const sortMap = {
    createdAt: 'createdAt',
    name: 'name',
    orders: 'totalOrders',
    ltv: 'lifetimeValue',
  };

  const sortStage = {
    $sort: {
      [sortMap[sortBy] || 'createdAt']: sortDirection,
      _id: sortDirection,
    },
  };

  /*
   * Order statistics per customer.
   * LTV: only delivered orders contribute.
   */
  const orderStatsStages = [
    {
      $lookup: {
        from: Order.collection.name,

        let: {
          customerId: '$_id',
        },

        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ['$user', '$$customerId'],
              },
            },
          },

          {
            $group: {
              _id: null,

              totalOrders: {
                $sum: 1,
              },

              lifetimeValue: {
                $sum: {
                  $cond: [
                    { $eq: ['$orderStatus', 'delivered'] },
                    '$pricing.total',
                    0,
                  ],
                },
              },

              lastOrderAt: {
                $max: '$placedAt',
              },
            },
          },
        ],

        as: 'orderStats',
      },
    },

    {
      $addFields: {
        orderStats: {
          $ifNull: [
            { $arrayElemAt: ['$orderStats', 0] },
            {
              totalOrders: 0,
              lifetimeValue: 0,
              lastOrderAt: null,
            },
          ],
        },
      },
    },

    {
      $addFields: {
        totalOrders: {
          $ifNull: ['$orderStats.totalOrders', 0],
        },

        lifetimeValue: {
          $ifNull: ['$orderStats.lifetimeValue', 0],
        },

        lastOrderAt: '$orderStats.lastOrderAt',
      },
    },
  ];

  /*
   * Same rule as the detail view: default address first, otherwise first.
   */
  const addressStage = {
    $addFields: {
      primaryAddress: {
        $ifNull: [
          {
            $arrayElemAt: [
              {
                $filter: {
                  input: { $ifNull: ['$addresses', []] },
                  as: 'address',
                  cond: { $eq: ['$$address.isDefault', true] },
                },
              },
              0,
            ],
          },
          {
            $ifNull: [
              { $arrayElemAt: [{ $ifNull: ['$addresses', []] }, 0] },
              null,
            ],
          },
        ],
      },
    },
  };

  const projectStage = {
    $project: {
      name: 1,
      email: 1,
      phone: 1,
      customerNumber: 1,
      accountTier: 1,
      isActive: 1,
      addresses: 1,
      primaryAddress: 1,
      totalOrders: 1,
      lifetimeValue: 1,
      lastOrderAt: 1,
      createdAt: 1,
    },
  };

  /*
   * Sorting by orders/ltv needs the statistics before sorting.
   * Every other sort paginates first and only then looks up orders
   * for the customers on the requested page.
   */
  const statsBeforeSort = sortBy === 'orders' || sortBy === 'ltv';

  const pipeline = statsBeforeSort
    ? [
        { $match: match },
        ...orderStatsStages,
        sortStage,
        {
          $facet: {
            items: [
              { $skip: (page - 1) * limit },
              { $limit: limit },
              addressStage,
              projectStage,
            ],
            meta: [{ $count: 'total' }],
          },
        },
      ]
    : [
        { $match: match },
        sortStage,
        {
          $facet: {
            items: [
              { $skip: (page - 1) * limit },
              { $limit: limit },
              ...orderStatsStages,
              addressStage,
              projectStage,
            ],
            meta: [{ $count: 'total' }],
          },
        },
      ];

  const [result] = await User.aggregate(pipeline).allowDiskUse(true);

  const items = (result?.items || []).map((customer) => ({
    ...customer,

    customerNumber:
      customer.customerNumber || customerNumberFallback(customer._id),

    status: customer.isActive ? 'active' : 'suspended',

    city: customer.primaryAddress?.city || null,

    region:
      customer.primaryAddress?.province ||
      customer.primaryAddress?.country ||
      null,
  }));

  const total = result?.meta?.[0]?.total || 0;

  return {
    items,
    meta: paginationMeta(page, limit, total),
  };
}

/*
|--------------------------------------------------------------------------
| Summary
|--------------------------------------------------------------------------
*/

async function summary() {
  const [accountStats, revenueStats] = await Promise.all([
    User.aggregate([
      {
        $match: {
          role: 'customer',
        },
      },

      {
        $group: {
          _id: null,

          totalAccounts: {
            $sum: 1,
          },

          activeAccounts: {
            $sum: {
              $cond: ['$isActive', 1, 0],
            },
          },

          suspendedAccounts: {
            $sum: {
              $cond: ['$isActive', 0, 1],
            },
          },

          b2bWholesaleAccounts: {
            $sum: {
              $cond: [{ $eq: ['$accountTier', 'wholesale'] }, 1, 0],
            },
          },

          retailVipPatrons: {
            $sum: {
              $cond: [{ $eq: ['$accountTier', 'vip'] }, 1, 0],
            },
          },
        },
      },
    ]),

    Order.aggregate([
      {
        $match: {
          user: { $ne: null },
          orderStatus: 'delivered',
        },
      },

      {
        $group: {
          _id: null,

          cumulativeLtv: {
            $sum: '$pricing.total',
          },
        },
      },
    ]),
  ]);

  return {
    totalAccounts: accountStats[0]?.totalAccounts || 0,
    activeAccounts: accountStats[0]?.activeAccounts || 0,
    suspendedAccounts: accountStats[0]?.suspendedAccounts || 0,
    b2bWholesaleAccounts: accountStats[0]?.b2bWholesaleAccounts || 0,
    retailVipPatrons: accountStats[0]?.retailVipPatrons || 0,
    cumulativeLtv: revenueStats[0]?.cumulativeLtv || 0,
  };
}

/*
|--------------------------------------------------------------------------
| Customer Detail
|--------------------------------------------------------------------------
*/

async function getById(id) {
  const customer = await User.findOne({
    _id: id,
    role: 'customer',
  })
    .select({
      name: 1,
      email: 1,
      phone: 1,
      customerNumber: 1,
      accountTier: 1,
      avatar: 1,
      addresses: 1,
      isActive: 1,
      suspendedAt: 1,
      suspendedBy: 1,
      suspensionReason: 1,
      lastLoginAt: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .populate({
      path: 'suspendedBy',
      select: 'name email',
      strictPopulate: false,
    })
    .lean();

  if (!customer) {
    throw ApiError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  const [totalOrders, lifetime, latestOrder] = await Promise.all([
    Order.countDocuments({
      user: id,
    }),

    Order.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(id),
          orderStatus: 'delivered',
        },
      },

      {
        $group: {
          _id: null,

          total: {
            $sum: '$pricing.total',
          },
        },
      },
    ]),

    Order.findOne({
      user: id,
    })
      .sort({
        placedAt: -1,
      })
      .select({
        orderNumber: 1,
        orderStatus: 1,
        pricing: 1,
        currency: 1,
        placedAt: 1,
      })
      .lean(),
  ]);

  const primaryAddress = defaultAddress(customer.addresses);

  return {
    ...customer,

    customerNumber:
      customer.customerNumber || customerNumberFallback(customer._id),

    status: customer.isActive ? 'active' : 'suspended',

    primaryAddress,

    totalOrders,

    lifetimeValue: lifetime[0]?.total || 0,

    latestOrder,
  };
}

/*
|--------------------------------------------------------------------------
| Customer Order History (admin view of one customer's orders)
|--------------------------------------------------------------------------
*/

async function orderHistory(customerId, query = {}) {
  const customerExists = await User.exists({
    _id: customerId,
    role: 'customer',
  });

  if (!customerExists) {
    throw ApiError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
  }

  const { page, limit } = normalizePaging(query);

  const filter = {
    user: customerId,
  };

  const [total, items] = await Promise.all([
    Order.countDocuments(filter),

    Order.find(filter)
      .select({
        orderNumber: 1,
        orderType: 1,
        items: 1,
        pricing: 1,
        currency: 1,
        paymentStatus: 1,
        orderStatus: 1,
        placedAt: 1,
        createdAt: 1,
      })
      .sort({
        placedAt: -1,
        _id: -1,
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const normalizedItems = items.map((order) => ({
    _id: order._id,

    orderNumber: order.orderNumber,

    orderType: order.orderType,

    itemCount: (order.items || []).reduce(
      (totalItems, item) => totalItems + (item.quantity || 0),
      0,
    ),

    total: order.pricing?.total || 0,

    paymentStatus: order.paymentStatus,

    orderStatus: order.orderStatus,

    placedAt: order.placedAt,

    createdAt: order.createdAt,
  }));

  return {
    items: normalizedItems,
    meta: paginationMeta(page, limit, total),
  };
}

/*
|--------------------------------------------------------------------------
| Suspend / Reactivate Customer
|--------------------------------------------------------------------------
|
| Atomic and idempotent:
| - the update only matches a customer that is NOT already in the requested
|   state, so repeating the request changes nothing (no session logout, no
|   overwritten suspension data, no duplicate audit row);
| - tokenVersion is bumped in the same update, invalidating live sessions.
|--------------------------------------------------------------------------
*/

async function setStatus(customerId, input, actor, req) {
  const actorId = actor?.id || actor?._id || null;
  const suspend = input.status === 'suspended';

  const update = suspend
    ? {
        $set: {
          isActive: false,
          suspendedAt: new Date(),
          suspendedBy: actorId,
          suspensionReason: input.reason || null,
        },

        $inc: {
          tokenVersion: 1,
        },
      }
    : {
        $set: {
          isActive: true,
          suspendedAt: null,
          suspendedBy: null,
          suspensionReason: null,
        },

        $inc: {
          tokenVersion: 1,
        },
      };

  const customer = await User.findOneAndUpdate(
    {
      _id: customerId,
      role: 'customer',
      isActive: suspend,
    },
    update,
    {
      new: true,
    },
  );

  if (!customer) {
    const current = await User.findOne({
      _id: customerId,
      role: 'customer',
    }).select('customerNumber isActive suspendedAt suspensionReason');

    if (!current) {
      throw ApiError.notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
    }

    /*
     * Already in the requested state: nothing to change.
     */
    return buildStatusResponse(current);
  }

  await audit.record(
    actor,

    suspend ? 'customer.suspended' : 'customer.reactivated',

    'User',

    customer._id,

    {
      previousStatus: suspend ? 'active' : 'suspended',

      newStatus: input.status,

      reason: input.reason || null,
    },

    req,
  );

  return buildStatusResponse(customer);
}

module.exports = {
  list,
  summary,
  getById,
  orderHistory,
  setStatus,
};
