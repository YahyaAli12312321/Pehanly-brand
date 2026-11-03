'use strict';

const Coupon = require('../models/Coupon');
const CouponRedemption =
  require('../models/CouponRedemption');

const ApiError = require('../utils/ApiError');

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function escapeRegex(value = '') {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

function buildMeta(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages:
      total === 0 ? 0 : Math.ceil(total / limit),
  };
}

/*
 * Resolve the coupon terms that apply in a currency.
 *
 * PKR: the coupon exactly as stored (zero behaviour change).
 * USD: only merchant-entered USD terms are used. Nothing is converted from PKR;
 * a coupon lacking a USD term it needs is refused for USD orders.
 */
function termsForCurrency(coupon, currency = 'PKR') {
  if (!coupon || currency === 'PKR') {
    return coupon;
  }

  const unsupported = () =>
    ApiError.badRequest(
      'This coupon is not available for USD orders',
      'COUPON_CURRENCY_UNSUPPORTED',
    );

  const has = (v) =>
    v !== null && v !== undefined;

  let discountValue = coupon.discountValue;

  if (coupon.discountType === 'fixed') {
    if (!has(coupon.discountValueUSD)) {
      throw unsupported();
    }

    discountValue = coupon.discountValueUSD;
  }

  let minimumOrderAmount = 0;

  if (has(coupon.minimumOrderAmountUSD)) {
    minimumOrderAmount = coupon.minimumOrderAmountUSD;
  } else if (coupon.minimumOrderAmount > 0) {
    throw unsupported();
  }

  let maximumDiscountAmount = null;

  if (has(coupon.maximumDiscountAmountUSD)) {
    maximumDiscountAmount = coupon.maximumDiscountAmountUSD;
  } else if (has(coupon.maximumDiscountAmount)) {
    throw unsupported();
  }

  return {
    ...coupon,
    discountValue,
    minimumOrderAmount,
    maximumDiscountAmount,
  };
}

function calculateDiscount(coupon, subtotal) {
  let amount;

  if (coupon.discountType === 'percentage') {
    amount =
      (subtotal * coupon.discountValue) / 100;

    if (
      coupon.maximumDiscountAmount !== null &&
      coupon.maximumDiscountAmount !== undefined
    ) {
      amount = Math.min(
        amount,
        coupon.maximumDiscountAmount,
      );
    }
  } else {
    amount = coupon.discountValue;
  }

  /*
   * Discount can never exceed subtotal.
   */
  amount = Math.min(amount, subtotal);

  /*
   * PKR checkout:
   * Keep amount at 2 decimal precision.
   */
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function assertCouponConfiguration(coupon) {
  if (
    coupon.discountType === 'percentage' &&
    coupon.discountValue > 100
  ) {
    throw ApiError.badRequest(
      'Percentage discount cannot exceed 100',
      'INVALID_COUPON_PERCENTAGE',
    );
  }

  if (
    coupon.startsAt &&
    coupon.expiresAt &&
    new Date(coupon.expiresAt) <=
      new Date(coupon.startsAt)
  ) {
    throw ApiError.badRequest(
      'Coupon expiry must be after its start date',
      'INVALID_COUPON_DATES',
    );
  }

  if (
    coupon.usageLimit !== null &&
    coupon.usageLimit !== undefined &&
    coupon.usedCount > coupon.usageLimit
  ) {
    throw ApiError.badRequest(
      'Usage limit cannot be lower than current usage',
      'INVALID_COUPON_USAGE_LIMIT',
    );
  }
}

function assertCouponAvailable(coupon, subtotal, now = new Date()) {
  if (!coupon || !coupon.isActive) {
    throw ApiError.badRequest(
      'Coupon is invalid or unavailable',
      'COUPON_INVALID',
    );
  }

  if (
    coupon.startsAt &&
    now < new Date(coupon.startsAt)
  ) {
    throw ApiError.badRequest(
      'Coupon is not active yet',
      'COUPON_NOT_STARTED',
    );
  }

  if (
    coupon.expiresAt &&
    now > new Date(coupon.expiresAt)
  ) {
    throw ApiError.badRequest(
      'Coupon has expired',
      'COUPON_EXPIRED',
    );
  }

  if (
    coupon.usageLimit !== null &&
    coupon.usageLimit !== undefined &&
    coupon.usedCount >= coupon.usageLimit
  ) {
    throw ApiError.badRequest(
      'Coupon usage limit has been reached',
      'COUPON_EXHAUSTED',
    );
  }

  if (subtotal < coupon.minimumOrderAmount) {
    throw ApiError.badRequest(
      `Minimum order amount for this coupon is ${coupon.minimumOrderAmount}`,
      'COUPON_MINIMUM_NOT_MET',
    );
  }
}

/*
|--------------------------------------------------------------------------
| Admin List
|--------------------------------------------------------------------------
*/

async function list(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);

  const limit = Math.min(
    100,
    Math.max(1, Number(query.limit) || 20),
  );

  const filter = {};

  if (query.discountType) {
    filter.discountType = query.discountType;
  }

  if (typeof query.isActive === 'boolean') {
    filter.isActive = query.isActive;
  }

  if (query.search) {
    const regex = new RegExp(
      escapeRegex(query.search),
      'i',
    );

    filter.$or = [
      { code: regex },
      { name: regex },
      { description: regex },
    ];
  }

  const [items, total] = await Promise.all([
    Coupon.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),

    Coupon.countDocuments(filter),
  ]);

  return {
    items,
    meta: buildMeta(page, limit, total),
  };
}

async function getById(id) {
  const coupon = await Coupon.findById(id).lean();

  if (!coupon) {
    throw ApiError.notFound(
      'Coupon not found',
      'COUPON_NOT_FOUND',
    );
  }

  return coupon;
}

async function create(input) {
  const data = {
    ...input,
    code: normalizeCode(input.code),
  };

  assertCouponConfiguration({
    ...data,
    usedCount: 0,
  });

  const existing = await Coupon.exists({
    code: data.code,
  });

  if (existing) {
    throw ApiError.conflict(
      'Coupon code already exists',
      'COUPON_CODE_EXISTS',
    );
  }

  try {
    const coupon = await Coupon.create(data);
    return coupon.toObject();
  } catch (error) {
    if (error?.code === 11000) {
      throw ApiError.conflict(
        'Coupon code already exists',
        'COUPON_CODE_EXISTS',
      );
    }

    throw error;
  }
}

async function update(id, input) {
  const coupon = await Coupon.findById(id);

  if (!coupon) {
    throw ApiError.notFound(
      'Coupon not found',
      'COUPON_NOT_FOUND',
    );
  }

  const merged = {
    code:
      input.code !== undefined
        ? normalizeCode(input.code)
        : coupon.code,

    name:
      input.name !== undefined
        ? input.name
        : coupon.name,

    description:
      input.description !== undefined
        ? input.description
        : coupon.description,

    discountType:
      input.discountType !== undefined
        ? input.discountType
        : coupon.discountType,

    discountValue:
      input.discountValue !== undefined
        ? input.discountValue
        : coupon.discountValue,

    minimumOrderAmount:
      input.minimumOrderAmount !== undefined
        ? input.minimumOrderAmount
        : coupon.minimumOrderAmount,

    maximumDiscountAmount:
      input.maximumDiscountAmount !== undefined
        ? input.maximumDiscountAmount
        : coupon.maximumDiscountAmount,

    discountValueUSD:
      input.discountValueUSD !== undefined
        ? input.discountValueUSD
        : coupon.discountValueUSD,

    minimumOrderAmountUSD:
      input.minimumOrderAmountUSD !== undefined
        ? input.minimumOrderAmountUSD
        : coupon.minimumOrderAmountUSD,

    maximumDiscountAmountUSD:
      input.maximumDiscountAmountUSD !== undefined
        ? input.maximumDiscountAmountUSD
        : coupon.maximumDiscountAmountUSD,

    startsAt:
      input.startsAt !== undefined
        ? input.startsAt
        : coupon.startsAt,

    expiresAt:
      input.expiresAt !== undefined
        ? input.expiresAt
        : coupon.expiresAt,

    usageLimit:
      input.usageLimit !== undefined
        ? input.usageLimit
        : coupon.usageLimit,

    usageLimitPerCustomer:
      input.usageLimitPerCustomer !== undefined
        ? input.usageLimitPerCustomer
        : coupon.usageLimitPerCustomer,

    isActive:
      input.isActive !== undefined
        ? input.isActive
        : coupon.isActive,

    usedCount: coupon.usedCount,
  };

  assertCouponConfiguration(merged);

  if (merged.code !== coupon.code) {
    const duplicate = await Coupon.exists({
      code: merged.code,
      _id: { $ne: coupon._id },
    });

    if (duplicate) {
      throw ApiError.conflict(
        'Coupon code already exists',
        'COUPON_CODE_EXISTS',
      );
    }
  }

  coupon.code = merged.code;
  coupon.name = merged.name;
  coupon.description = merged.description;
  coupon.discountType = merged.discountType;
  coupon.discountValue = merged.discountValue;
  coupon.minimumOrderAmount =
    merged.minimumOrderAmount;
  coupon.maximumDiscountAmount =
    merged.maximumDiscountAmount;
  // null clears the USD term (unset); undefined leaves it untouched.
  coupon.discountValueUSD =
    merged.discountValueUSD === null
      ? undefined
      : merged.discountValueUSD;
  coupon.minimumOrderAmountUSD =
    merged.minimumOrderAmountUSD === null
      ? undefined
      : merged.minimumOrderAmountUSD;
  coupon.maximumDiscountAmountUSD =
    merged.maximumDiscountAmountUSD === null
      ? undefined
      : merged.maximumDiscountAmountUSD;
  coupon.startsAt = merged.startsAt;
  coupon.expiresAt = merged.expiresAt;
  coupon.usageLimit = merged.usageLimit;
  coupon.usageLimitPerCustomer =
    merged.usageLimitPerCustomer;
  coupon.isActive = merged.isActive;

  try {
    await coupon.save();
    return coupon.toObject();
  } catch (error) {
    if (error?.code === 11000) {
      throw ApiError.conflict(
        'Coupon code already exists',
        'COUPON_CODE_EXISTS',
      );
    }

    throw error;
  }
}

async function setStatus(id, isActive) {
  const coupon = await Coupon.findById(id);

  if (!coupon) {
    throw ApiError.notFound(
      'Coupon not found',
      'COUPON_NOT_FOUND',
    );
  }

  coupon.isActive = isActive;
  await coupon.save();

  return coupon.toObject();
}

async function remove(id) {
  const coupon = await Coupon.findById(id);

  if (!coupon) {
    throw ApiError.notFound(
      'Coupon not found',
      'COUPON_NOT_FOUND',
    );
  }

  /*
   * Used coupons should not be physically deleted.
   * Historical orders contain a snapshot, but keeping
   * campaign/redemption records is useful for audit.
   */
  if (coupon.usedCount > 0) {
    throw ApiError.conflict(
      'Used coupons cannot be deleted. Disable the coupon instead.',
      'COUPON_ALREADY_USED',
    );
  }

  await CouponRedemption.deleteMany({
    coupon: coupon._id,
  });

  await coupon.deleteOne();

  return {
    id: String(coupon._id),
  };
}

/*
|--------------------------------------------------------------------------
| Customer Validation
|--------------------------------------------------------------------------
|
| Used for checkout preview.
| Final checkout MUST validate again.
|--------------------------------------------------------------------------
*/

async function validateForCustomer({
  code,
  subtotal,
  userId,
  session = null,
  currency = 'PKR',
}) {
  if (!userId) {
    throw ApiError.unauthorized(
      'Login is required to use a coupon',
      'COUPON_AUTH_REQUIRED',
    );
  }

  const numericSubtotal = Number(subtotal);

  if (
    !Number.isFinite(numericSubtotal) ||
    numericSubtotal < 0
  ) {
    throw ApiError.badRequest(
      'Invalid subtotal',
      'INVALID_COUPON_SUBTOTAL',
    );
  }

  let couponQuery = Coupon.findOne({
    code: normalizeCode(code),
  });

  if (session) {
    couponQuery = couponQuery.session(session);
  }

  const storedCoupon = await couponQuery.lean();

  // Terms in the transaction currency (USD never converts from PKR).
  const coupon =
    termsForCurrency(
      storedCoupon,
      currency,
    );

  assertCouponAvailable(
    coupon,
    numericSubtotal,
  );

  if (
    coupon.usageLimitPerCustomer !== null &&
    coupon.usageLimitPerCustomer !== undefined
  ) {
    let redemptionQuery =
      CouponRedemption.findOne({
        coupon: coupon._id,
        user: userId,
      });

    if (session) {
      redemptionQuery =
        redemptionQuery.session(session);
    }

    const redemption =
      await redemptionQuery.lean();

    if (
      redemption &&
      redemption.usageCount >=
        coupon.usageLimitPerCustomer
    ) {
      throw ApiError.badRequest(
        'You have already reached the usage limit for this coupon',
        'COUPON_CUSTOMER_LIMIT_REACHED',
      );
    }
  }

  const discountAmount =
    calculateDiscount(
      coupon,
      numericSubtotal,
    );

  return {
    couponId: coupon._id,
    code: coupon.code,
    currency,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount,

    minimumOrderAmount:
      coupon.minimumOrderAmount,

    maximumDiscountAmount:
      coupon.maximumDiscountAmount,
  };
}

/*
|--------------------------------------------------------------------------
| Atomic Redemption
|--------------------------------------------------------------------------
|
| Must run inside the same MongoDB transaction
| used to create the Order.
|--------------------------------------------------------------------------
*/

async function redeem({
  couponId,
  userId,
  orderId,
  subtotal,
  session,
  currency = 'PKR',
}) {
  if (!session) {
    throw new Error(
      'Coupon redemption requires a MongoDB session',
    );
  }

  if (!userId) {
    throw ApiError.unauthorized(
      'Login is required to use a coupon',
      'COUPON_AUTH_REQUIRED',
    );
  }

  const numericSubtotal = Number(subtotal);

  if (
    !Number.isFinite(numericSubtotal) ||
    numericSubtotal < 0
  ) {
    throw ApiError.badRequest(
      'Invalid subtotal',
      'INVALID_COUPON_SUBTOTAL',
    );
  }

  /*
   * Read coupon again inside the same transaction.
   * This gives us the latest coupon rules before
   * consuming the usage slot.
   */
  const couponForValidation =
    await Coupon.findById(couponId)
      .session(session)
      .lean();

  /*
   * Re-check:
   * - active
   * - start date
   * - expiry
   * - global usage limit
   * - minimum order amount
   */
  assertCouponAvailable(
    termsForCurrency(
      couponForValidation,
      currency,
    ),
    numericSubtotal,
  );

  /*
   * Atomically consume one GLOBAL usage slot.
   */
  const coupon = await Coupon.findOneAndUpdate(
    {
      _id: couponId,
      isActive: true,

      $expr: {
        $or: [
          { $eq: ['$usageLimit', null] },
          { $lt: ['$usedCount', '$usageLimit'] },
        ],
      },
    },
    {
      $inc: {
        usedCount: 1,
      },
    },
    {
      new: true,
      session,
    },
  );

  if (!coupon) {
    throw ApiError.conflict(
      'Coupon is no longer available',
      'COUPON_EXHAUSTED',
    );
  }

  const perCustomerLimit =
    coupon.usageLimitPerCustomer;

  /*
   * Unlimited per-customer usage.
   */
  if (
    perCustomerLimit === null ||
    perCustomerLimit === undefined
  ) {
    await CouponRedemption.findOneAndUpdate(
      {
        coupon: coupon._id,
        user: userId,
      },
      {
        $inc: {
          usageCount: 1,
        },

        $set: {
          lastOrder: orderId,
          lastUsedAt: new Date(),
        },

        $setOnInsert: {
          coupon: coupon._id,
          user: userId,
        },
      },
      {
        upsert: true,
        new: true,
        session,
      },
    );

    return;
  }

  /*
   * Existing customer redemption counter.
   */
  const existing =
    await CouponRedemption.findOneAndUpdate(
      {
        coupon: coupon._id,
        user: userId,

        usageCount: {
          $lt: perCustomerLimit,
        },
      },
      {
        $inc: {
          usageCount: 1,
        },

        $set: {
          lastOrder: orderId,
          lastUsedAt: new Date(),
        },
      },
      {
        new: true,
        session,
      },
    );

  if (existing) {
    return;
  }

  /*
   * First redemption for this customer.
   */
  try {
    await CouponRedemption.create(
      [
        {
          coupon: coupon._id,
          user: userId,
          usageCount: 1,
          lastOrder: orderId,
          lastUsedAt: new Date(),
        },
      ],
      {
        session,
      },
    );
  } catch (error) {
    /*
     * Unique index race.
     *
     * Transaction rollback will also undo
     * the global usedCount increment.
     */
    if (error?.code === 11000) {
      throw ApiError.conflict(
        'Coupon customer usage limit has been reached',
        'COUPON_CUSTOMER_LIMIT_REACHED',
      );
    }

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| Release a redemption (order cancelled before fulfilment)
|--------------------------------------------------------------------------
|
| Gives back the global usage slot and the customer's usage slot consumed
| by redeem(). Never goes below zero. Must run inside the caller's
| transaction.
|--------------------------------------------------------------------------
*/

async function release({
  couponId,
  userId,
  session,
}) {
  if (!session) {
    throw new Error(
      'Coupon release requires a MongoDB session',
    );
  }

  if (!couponId || !userId) {
    return false;
  }

  const coupon =
    await Coupon.findOneAndUpdate(
      {
        _id: couponId,
        usedCount: { $gt: 0 },
      },
      { $inc: { usedCount: -1 } },
      { new: true, session },
    );

  await CouponRedemption.findOneAndUpdate(
    {
      coupon: couponId,
      user: userId,
      usageCount: { $gt: 0 },
    },
    { $inc: { usageCount: -1 } },
    { session },
  );

  return Boolean(coupon);
}

module.exports = {
  release,
  list,
  getById,
  create,
  update,
  setStatus,
  remove,

  validateForCustomer,
  redeem,

  // exported for tests
  _internals: { termsForCurrency, calculateDiscount },
};