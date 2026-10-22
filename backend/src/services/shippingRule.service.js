'use strict';

const ShippingRule =
  require('../models/ShippingRule');

const ApiError =
  require('../utils/ApiError');

const {
  SHIPPING_RULE_TYPES,
} = require('../constants/ShippingRule');

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function escapeRegex(value = '') {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function buildMeta(
  page,
  limit,
  total,
) {
  return {
    page,
    limit,
    total,

    totalPages:
      total === 0
        ? 0
        : Math.ceil(
            total / limit,
          ),
  };
}

function cleanRuleData(input) {
  const data = {
    ...input,
  };

  /*
   * Keep irrelevant fields empty.
   *
   * This prevents stale configuration
   * when rule type changes.
   */
  if (data.type === 'flat') {
    data.cityRates = [];

    data.minimumOrderAmount =
      null;
  }

  if (
    data.type ===
    'city_based'
  ) {
    data.flatRate = null;

    data.minimumOrderAmount =
      null;
  }

  if (
    data.type ===
    'free_shipping'
  ) {
    data.flatRate = null;

    data.cityRates = [];
  }

  return data;
}

function validateCompleteRule(
  rule,
) {
  if (
    !SHIPPING_RULE_TYPES.includes(
      rule.type,
    )
  ) {
    throw ApiError.badRequest(
      'Invalid shipping rule type',
      'INVALID_SHIPPING_RULE_TYPE',
    );
  }

  if (
    rule.type === 'flat' &&
    (
      rule.flatRate === null ||
      rule.flatRate ===
        undefined
    )
  ) {
    throw ApiError.badRequest(
      'Flat rate is required',
      'SHIPPING_FLAT_RATE_REQUIRED',
    );
  }

  if (
    rule.type ===
      'city_based' &&
    (
      !Array.isArray(
        rule.cityRates,
      ) ||
      rule.cityRates.length ===
        0
    )
  ) {
    throw ApiError.badRequest(
      'At least one city rate is required',
      'SHIPPING_CITY_RATE_REQUIRED',
    );
  }

  if (
    rule.type ===
      'free_shipping' &&
    (
      rule.minimumOrderAmount ===
        null ||
      rule.minimumOrderAmount ===
        undefined
    )
  ) {
    throw ApiError.badRequest(
      'Minimum order amount is required',
      'SHIPPING_MINIMUM_REQUIRED',
    );
  }

  if (
    Array.isArray(
      rule.cityRates,
    )
  ) {
    const cities =
      rule.cityRates.map(
        (item) =>
          normalizeText(
            item.city,
          ),
      );

    if (
      new Set(cities).size !==
      cities.length
    ) {
      throw ApiError.badRequest(
        'Duplicate cities are not allowed',
        'DUPLICATE_SHIPPING_CITY',
      );
    }
  }
}

/*
|--------------------------------------------------------------------------
| Admin List
|--------------------------------------------------------------------------
*/

async function list(
  query = {},
) {
  const page =
    Math.max(
      1,
      Number(query.page) ||
        1,
    );

  const limit =
    Math.min(
      100,
      Math.max(
        1,
        Number(
          query.limit,
        ) || 20,
      ),
    );

  const filter = {};

  if (query.currency) {
    // Legacy rules (no stored currency) are PKR.
    filter.currency =
      query.currency === 'PKR'
        ? { $in: ['PKR', null] }
        : query.currency;
  }

  if (query.type) {
    filter.type =
      query.type;
  }

  if (
    typeof query.isActive ===
    'boolean'
  ) {
    filter.isActive =
      query.isActive;
  }

  if (query.search) {
    const regex =
      new RegExp(
        escapeRegex(
          query.search,
        ),
        'i',
      );

    filter.$or = [
      {
        name: regex,
      },

      {
        country: regex,
      },

      {
        'cityRates.city':
          regex,
      },
    ];
  }

  const [
    items,
    total,
  ] = await Promise.all([
    ShippingRule.find(
      filter,
    )
      .sort({
        priority: 1,
        createdAt: -1,
      })
      .skip(
        (page - 1) *
          limit,
      )
      .limit(limit)
      .lean(),

    ShippingRule.countDocuments(
      filter,
    ),
  ]);

  return {
    items,

    meta:
      buildMeta(
        page,
        limit,
        total,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Get
|--------------------------------------------------------------------------
*/

async function getById(id) {
  const rule =
    await ShippingRule.findById(
      id,
    ).lean();

  if (!rule) {
    throw ApiError.notFound(
      'Shipping rule not found',
      'SHIPPING_RULE_NOT_FOUND',
    );
  }

  return rule;
}

/*
|--------------------------------------------------------------------------
| Create
|--------------------------------------------------------------------------
*/

async function create(input) {
  const data =
    cleanRuleData(
      input,
    );

  validateCompleteRule(
    data,
  );

  const rule =
    await ShippingRule.create(
      data,
    );

  return rule.toObject();
}

/*
|--------------------------------------------------------------------------
| Update
|--------------------------------------------------------------------------
*/

async function update(
  id,
  input,
) {
  const rule =
    await ShippingRule.findById(
      id,
    );

  if (!rule) {
    throw ApiError.notFound(
      'Shipping rule not found',
      'SHIPPING_RULE_NOT_FOUND',
    );
  }

  /*
   * Merge current + incoming first.
   *
   * This is important when type changes.
   */
  const merged = {
    name:
      input.name ??
      rule.name,

    type:
      input.type ??
      rule.type,

    flatRate:
      input.flatRate !==
      undefined
        ? input.flatRate
        : rule.flatRate,

    cityRates:
      input.cityRates !==
      undefined
        ? input.cityRates
        : rule.cityRates.map(
            (item) => ({
              city:
                item.city,

              rate:
                item.rate,
            }),
          ),

    minimumOrderAmount:
      input.minimumOrderAmount !==
      undefined
        ? input.minimumOrderAmount
        : rule.minimumOrderAmount,

    country:
      input.country ??
      rule.country,

    currency:
      input.currency ??
      rule.currency ??
      'PKR',

    isActive:
      input.isActive ??
      rule.isActive,

    priority:
      input.priority ??
      rule.priority,
  };

  const data =
    cleanRuleData(
      merged,
    );

  validateCompleteRule(
    data,
  );

  rule.name =
    data.name;

  rule.type =
    data.type;

  rule.flatRate =
    data.flatRate;

  rule.cityRates =
    data.cityRates;

  rule.minimumOrderAmount =
    data.minimumOrderAmount;

  rule.country =
    data.country;

  rule.currency =
    data.currency;

  rule.isActive =
    data.isActive;

  rule.priority =
    data.priority;

  await rule.save();

  return rule.toObject();
}

/*
|--------------------------------------------------------------------------
| Set Status
|--------------------------------------------------------------------------
*/

async function setStatus(
  id,
  isActive,
) {
  const rule =
    await ShippingRule.findById(
      id,
    );

  if (!rule) {
    throw ApiError.notFound(
      'Shipping rule not found',
      'SHIPPING_RULE_NOT_FOUND',
    );
  }

  rule.isActive =
    isActive;

  await rule.save();

  return rule.toObject();
}

/*
|--------------------------------------------------------------------------
| Delete
|--------------------------------------------------------------------------
|
| ShippingRule is configuration data.
| Existing Orders already contain shipping
| price snapshots, so deleting a rule does
| not modify historical Orders.
|--------------------------------------------------------------------------
*/

async function remove(id) {
  const rule =
    await ShippingRule.findById(
      id,
    );

  if (!rule) {
    throw ApiError.notFound(
      'Shipping rule not found',
      'SHIPPING_RULE_NOT_FOUND',
    );
  }

  await rule.deleteOne();

  return {
    id:
      String(rule._id),
  };
}

/*
|--------------------------------------------------------------------------
| Calculate Shipping
|--------------------------------------------------------------------------
|
| Priority:
|
| 1. Free shipping
| 2. City based
| 3. Flat rate
|
| Within same type:
| lower `priority` wins.
|--------------------------------------------------------------------------
*/

/*
 * Legacy rules (no currency stored) are PKR. A rule only applies to orders
 * in its own currency; amounts are never converted.
 */
function ruleCurrency(rule) {
  return rule.currency || 'PKR';
}

async function calculateShipping({
  subtotal,
  city,
  country = 'Pakistan',
  currency = 'PKR',
}) {
  const numericSubtotal =
    Number(subtotal);

  if (
    !Number.isFinite(
      numericSubtotal,
    ) ||
    numericSubtotal < 0
  ) {
    throw ApiError.badRequest(
      'Invalid subtotal',
      'INVALID_SHIPPING_SUBTOTAL',
    );
  }

  const normalizedCity =
    normalizeText(city);

  const normalizedCountry =
    normalizeText(country);

  if (!normalizedCity) {
    throw ApiError.badRequest(
      'Shipping city is required',
      'SHIPPING_CITY_REQUIRED',
    );
  }

  /*
   * We intentionally compare country
   * case-insensitively.
   */
  const rules =
    await ShippingRule.find({
      isActive: true,
    })
      .sort({
        priority: 1,
        createdAt: 1,
      })
      .lean();

  const applicableRules =
    rules.filter(
      (rule) =>
        normalizeText(
          rule.country,
        ) ===
          normalizedCountry &&
        ruleCurrency(rule) ===
          currency,
    );

  /*
   * 1. FREE SHIPPING
   */
  const freeRule =
    applicableRules.find(
      (rule) =>
        rule.type ===
          'free_shipping' &&
        typeof rule.minimumOrderAmount ===
          'number' &&
        numericSubtotal >=
          rule.minimumOrderAmount,
    );

  if (freeRule) {
    return {
      amount: 0,

      ruleId:
        freeRule._id,

      ruleName:
        freeRule.name,

      ruleType:
        freeRule.type,

      reason:
        'free_shipping',
    };
  }

  /*
   * 2. CITY BASED
   */
  const cityRules =
    applicableRules.filter(
      (rule) =>
        rule.type ===
        'city_based',
    );

  for (
    const rule of cityRules
  ) {
    const cityRate =
      (
        rule.cityRates ||
        []
      ).find(
        (item) =>
          normalizeText(
            item.city,
          ) ===
          normalizedCity,
      );

    if (cityRate) {
      return {
        amount:
          cityRate.rate,

        ruleId:
          rule._id,

        ruleName:
          rule.name,

        ruleType:
          rule.type,

        city:
          cityRate.city,

        reason:
          'city_rate',
      };
    }
  }

  /*
   * 3. FLAT FALLBACK
   */
  const flatRule =
    applicableRules.find(
      (rule) =>
        rule.type ===
          'flat' &&
        typeof rule.flatRate ===
          'number',
    );

  if (flatRule) {
    return {
      amount:
        flatRule.flatRate,

      ruleId:
        flatRule._id,

      ruleName:
        flatRule.name,

      ruleType:
        flatRule.type,

      reason:
        'flat_rate',
    };
  }

  /*
   * IMPORTANT:
   *
   * Do not silently return Rs. 0.
   * That could create accidental free shipping.
   */
  throw ApiError.badRequest(
    'Shipping is not available for this location',
    'SHIPPING_NOT_AVAILABLE',
  );
}

/*
|--------------------------------------------------------------------------
| Public Free-Shipping Information
|--------------------------------------------------------------------------
|
| Read-only helper for the storefront ("Add Rs. X more to unlock free
| shipping"). It reports the LOWEST minimum order amount among ACTIVE
| `free_shipping` rules for the country. It never decides eligibility:
| calculateShipping() remains the single authority at quote/checkout time.
|--------------------------------------------------------------------------
*/
async function getFreeShippingInfo({
  country,
  currency = 'PKR',
} = {}) {
  /*
   * PKR keeps the original behaviour (default country Pakistan).
   * USD without a country considers USD rules of any country; the rule's own
   * amount is returned as-is (never converted from PKR).
   */
  const effectiveCountry =
    country ||
    (currency === 'PKR'
      ? 'Pakistan'
      : null);

  const normalizedCountry =
    effectiveCountry
      ? normalizeText(
          effectiveCountry,
        )
      : null;

  const rules =
    await ShippingRule.find({
      isActive: true,
      type: 'free_shipping',
    })
      .sort({
        priority: 1,
        createdAt: 1,
      })
      .select(
        'name country currency minimumOrderAmount',
      )
      .lean();

  const candidates = rules.filter(
    (rule) =>
      ruleCurrency(rule) ===
        currency &&
      (normalizedCountry === null ||
        normalizeText(rule.country) ===
          normalizedCountry) &&
      typeof rule.minimumOrderAmount ===
        'number' &&
      rule.minimumOrderAmount >= 0,
  );

  if (!candidates.length) {
    return {
      available: false,
      country: effectiveCountry,
      currency,
      minimumOrderAmount: null,
      ruleName: null,
    };
  }

  const best = candidates.reduce(
    (min, rule) =>
      rule.minimumOrderAmount <
      min.minimumOrderAmount
        ? rule
        : min,
  );

  return {
    available: true,
    country: effectiveCountry,
    currency,
    minimumOrderAmount:
      best.minimumOrderAmount,
    ruleName: best.name,
  };
}

module.exports = {
  getFreeShippingInfo,
  list,
  getById,
  create,
  update,
  setStatus,
  remove,
  calculateShipping,
};