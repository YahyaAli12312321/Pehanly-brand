'use strict';

const mongoose = require('mongoose');

const Order = require('../models/order.model');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');
const Sku = require('../models/Sku');
const adminNotificationEvents = require('./adminNotificationEvents.service');
const shippingRuleService = require('./shippingRule.service');
const stockNotification = require('./stockNotification.service');
const couponService =
  require('./coupon.service');

const ApiError = require('../utils/ApiError');

const {
  normalizeEmail,
  normalizePhone,
} = require('../utils/identity');

const {
  generateOrderNumber,
} = require('./orderNumber.service');

const stockReservation =
  require('./stockReservation.service');

const orderLifecycle =
  require('./orderLifecycle.service');

const paymentService =
  require('./payment.service');

const {
  ORDER_STATUS_TRANSITIONS,
} = require('../constants/Order');

const logger = require('../config/logger');

const {
  DEFAULT_CURRENCY,
  normalizeCurrency,
  paymentMethodsFor,
  roundMoney,
  sumMoney,
} = require('../constants/Currency');

/*
 * Notifications are best-effort. A failed FCM/notification call must never
 * turn an already-committed order operation into an error response.
 */
async function bestEffort(label, fn) {
  try {
    await fn();
  } catch (error) {
    logger.error(
      { err: error, label },
      'Post-commit notification failed (ignored)',
    );
  }
}

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const ORDER_STATUSES = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
});

const ORDER_TYPES = Object.freeze([
  'retail',
  'wholesale',
  'manufacturing',
  'printing',
]);

const PAYMENT_STATUSES = Object.freeze([
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded',
]);

const STATUS_TRANSITIONS = ORDER_STATUS_TRANSITIONS;

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

function getActorId(actor) {
  return (
    actor?.id ||
    actor?._id ||
    null
  );
}

function buildPaginationMeta(
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

function assertValidOrderType(type) {
  if (
    type &&
    !ORDER_TYPES.includes(type)
  ) {
    throw ApiError.badRequest(
      'Invalid order type',
      'INVALID_ORDER_TYPE',
    );
  }
}

function assertValidOrderStatus(
  status,
) {
  if (
    status &&
    !Object.values(
      ORDER_STATUSES,
    ).includes(status)
  ) {
    throw ApiError.badRequest(
      'Invalid order status',
      'INVALID_ORDER_STATUS',
    );
  }
}

function assertValidPaymentStatus(
  status,
) {
  if (
    status &&
    !PAYMENT_STATUSES.includes(
      status,
    )
  ) {
    throw ApiError.badRequest(
      'Invalid payment status',
      'INVALID_PAYMENT_STATUS',
    );
  }
}

function trackingFailed() {
  return ApiError.notFound(
    'Unable to verify order details',
    'ORDER_TRACKING_FAILED',
  );
}

/*
|--------------------------------------------------------------------------
| Normalize Checkout Items
|--------------------------------------------------------------------------
*/

function normalizeCheckoutItems(
  items,
) {
  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    throw ApiError.badRequest(
      'Cart must contain at least one item',
      'EMPTY_CART',
    );
  }

  const itemMap =
    new Map();

  for (const item of items) {
    if (!item?.sku) {
      throw ApiError.badRequest(
        'Every cart item must contain a SKU',
        'INVALID_CART_ITEM',
      );
    }

    if (
      !mongoose.isValidObjectId(
        item.sku,
      )
    ) {
      throw ApiError.badRequest(
        'One or more cart SKUs are invalid',
        'INVALID_CART_ITEM',
      );
    }

    const quantity =
      Number(
        item.quantity,
      );

    if (
      !Number.isInteger(
        quantity,
      ) ||
      quantity < 1
    ) {
      throw ApiError.badRequest(
        'Cart item quantity must be a positive integer',
        'INVALID_CART_QUANTITY',
      );
    }

    const key =
      String(item.sku);

    const existing =
      itemMap.get(key);

    if (existing) {
      existing.quantity +=
        quantity;
    } else {
      itemMap.set(key, {
        sku:
          item.sku,

        quantity,
      });
    }
  }

  return [
    ...itemMap.values(),
  ];
}

/*
|--------------------------------------------------------------------------
| Load Checkout Items
|--------------------------------------------------------------------------
*/

async function loadCheckoutItems(
  items,
  session,
) {
  const normalizedItems =
    normalizeCheckoutItems(
      items,
    );

  const skuIds =
    normalizedItems.map(
      (item) =>
        item.sku,
    );

  const skus =
    await Sku.find({
      _id: {
        $in:
          skuIds,
      },
    })
      .session(session)
      .lean();

  if (
    skus.length !==
    skuIds.length
  ) {
    throw ApiError.badRequest(
      'One or more selected items are invalid',
      'INVALID_CART_ITEM',
    );
  }

  const skuMap =
    new Map(
      skus.map(
        (sku) => [
          String(
            sku._id,
          ),

          sku,
        ],
      ),
    );

  for (const sku of skus) {
    if (
      !sku.product ||
      !sku.variant
    ) {
      throw ApiError.badRequest(
        'One or more selected items have invalid product references',
        'INVALID_CART_ITEM',
      );
    }
  }

  const productIds = [
    ...new Set(
      skus.map(
        (sku) =>
          String(
            sku.product,
          ),
      ),
    ),
  ];

  const variantIds = [
    ...new Set(
      skus.map(
        (sku) =>
          String(
            sku.variant,
          ),
      ),
    ),
  ];

  const [
    products,
    variants,
  ] = await Promise.all([
    Product.find({
      _id: {
        $in:
          productIds,
      },
    })
      .session(session)
      .lean(),

    ProductVariant.find({
      _id: {
        $in:
          variantIds,
      },
    })
      .session(session)
      .lean(),
  ]);

  const productMap =
    new Map(
      products.map(
        (product) => [
          String(
            product._id,
          ),

          product,
        ],
      ),
    );

  const variantMap =
    new Map(
      variants.map(
        (variant) => [
          String(
            variant._id,
          ),

          variant,
        ],
      ),
    );

  return normalizedItems.map(
    (requested) => {
      const sku =
        skuMap.get(
          String(
            requested.sku,
          ),
        );

      if (!sku) {
        throw ApiError.badRequest(
          'One or more selected items are invalid',
          'INVALID_CART_ITEM',
        );
      }

      const product =
        productMap.get(
          String(
            sku.product,
          ),
        );

      const variant =
        variantMap.get(
          String(
            sku.variant,
          ),
        );

      if (
        !product ||
        !variant
      ) {
        throw ApiError.badRequest(
          'One or more selected items are unavailable',
          'ITEM_UNAVAILABLE',
        );
      }

      if (
        String(
          variant.product,
        ) !==
        String(
          product._id,
        )
      ) {
        throw ApiError.badRequest(
          'Product variant relationship is invalid',
          'INVALID_PRODUCT_VARIANT',
        );
      }

      if (
        product.status !==
        'active'
      ) {
        throw ApiError.badRequest(
          `${product.name} is currently unavailable`,
          'ITEM_UNAVAILABLE',
        );
      }

      if (
        variant.isEnabled !==
        true
      ) {
        throw ApiError.badRequest(
          `${product.name} selected variant is unavailable`,
          'ITEM_UNAVAILABLE',
        );
      }

      if (
        sku.isEnabled !==
        true
      ) {
        throw ApiError.badRequest(
          `SKU ${
            sku.sku ||
            sku._id
          } is unavailable`,
          'ITEM_UNAVAILABLE',
        );
      }

      if (
        typeof sku.price !==
          'number' ||
        !Number.isFinite(
          sku.price,
        ) ||
        sku.price <= 0
      ) {
        throw ApiError.badRequest(
          `SKU ${
            sku.sku ||
            sku._id
          } has an invalid price`,
          'INVALID_SKU_PRICE',
        );
      }

      if (
        typeof sku.available !==
          'number' ||
        sku.available <
          requested.quantity
      ) {
        throw ApiError.conflict(
          `Insufficient stock for SKU ${
            sku.sku ||
            sku._id
          }`,
          'INSUFFICIENT_STOCK',
        );
      }

      return {
        requested,
        sku,
        product,
        variant,
      };
    },
  );
}

/*
|--------------------------------------------------------------------------
| Image Snapshot
|--------------------------------------------------------------------------
*/

function buildImageSnapshot(
  image,
) {
  if (!image?.url) {
    return undefined;
  }

  return {
    url:
      image.url,

    publicId:
      image.publicId ||
      undefined,

    alt:
      image.alt ||
      undefined,
  };
}

/*
|--------------------------------------------------------------------------
| Build Retail Order Items
|--------------------------------------------------------------------------
*/

function buildOrderItems(
  rows,
  currency = DEFAULT_CURRENCY,
) {
  return rows.map(
    (row) => {
      const {
        requested,
        sku,
        product,
        variant,
      } = row;

      /*
       * One transaction = one currency. USD uses the merchant-entered USD
       * price on the SKU; there is NO conversion from PKR. A size without a
       * USD price is simply not purchasable in USD.
       */
      const unitPrice =
        currency === 'USD'
          ? sku.priceUSD
          : sku.price;

      if (
        currency === 'USD' &&
        !(
          typeof unitPrice === 'number' &&
          Number.isFinite(unitPrice) &&
          unitPrice > 0
        )
      ) {
        throw ApiError.badRequest(
          `${product.name} (${sku.sku}) is not available in USD`,
          'SKU_NOT_AVAILABLE_IN_CURRENCY',
        );
      }

      const quantity =
        requested.quantity;

      const image =
        variant.images?.[0] ||
        product.generalImages?.[0] ||
        undefined;

      return {
        product:
          product._id,

        variant:
          variant._id,

        sku:
          sku._id,

        manufacturingCategory:
          null,

        manufacturingStyle:
          null,

        manufacturingVariant:
          null,

        productName:
          product.name,

        colorName:
          variant.color?.name ||
          undefined,

        size:
          sku.size,

        skuCode:
          sku.sku,

        image:
          buildImageSnapshot(
            image,
          ),

        unitPrice,

        quantity,

        lineTotal:
          roundMoney(
            unitPrice *
              quantity,
          ),
      };
    },
  );
}

/*
|--------------------------------------------------------------------------
| Calculate Retail Pricing
|--------------------------------------------------------------------------
*/

async function calculatePricing({
  items,
  shippingAddress,
  couponCode,
  userId,
  session,
  currency = DEFAULT_CURRENCY,
}) {
  const subtotal =
    sumMoney(
      items.map(
        (item) =>
          item.lineTotal,
      ),
    );

  let coupon = null;
  let discount = 0;

  if (couponCode) {
    if (!userId) {
      throw ApiError.unauthorized(
        'Login is required to use a coupon',
        'COUPON_AUTH_REQUIRED',
      );
    }

    coupon =
      await couponService
        .validateForCustomer({
          code:
            couponCode,

          subtotal,

          userId,

          session,

          currency,
        });

    discount =
      coupon.discountAmount;
  }

  const discountedSubtotal =
    roundMoney(
      subtotal -
        discount,
    );

  const shippingResult =
    await shippingRuleService
      .calculateShipping({
        subtotal:
          discountedSubtotal,

        city:
          shippingAddress.city,

        country:
          shippingAddress.country ||
          'Pakistan',

        currency,
      });

  const shipping =
    shippingResult.amount;

  const additionalCharges = 0;

  const total =
    sumMoney([
      discountedSubtotal,
      shipping,
      additionalCharges,
    ]);

  if (
    !Number.isFinite(total) ||
    total < 0
  ) {
    throw ApiError.badRequest(
      'Invalid order total',
      'INVALID_ORDER_TOTAL',
    );
  }

  return {
    pricing: {
      subtotal,
      discount,
      shipping,
      additionalCharges,
      total,
    },

    coupon,
  };
}

/*
|--------------------------------------------------------------------------
| Create Retail Order
|--------------------------------------------------------------------------
*/

async function createRetailOrder(
  input,
  user = null,
) {
  /*
   * Currency + payment eligibility are decided BEFORE anything is reserved.
   * PKR keeps the existing COD flow untouched. USD has no approved payment
   * method yet (JazzCash is PKR-only and COD for international orders is not
   * approved), so a USD order is refused rather than faked or silently
   * converted to PKR.
   */
  const currency =
    normalizeCurrency(
      input.currency,
    );

  if (!currency) {
    throw ApiError.badRequest(
      'Unsupported currency',
      'UNSUPPORTED_CURRENCY',
    );
  }

  if (
    !paymentMethodsFor(
      currency,
    ).includes(
      input.paymentMethod,
    )
  ) {
    throw ApiError.conflict(
      currency === 'USD'
        ? 'USD checkout is not available yet: no international payment method is enabled. Please check out in PKR.'
        : 'This payment method is not available for the selected currency',
      currency === 'USD'
        ? 'USD_PAYMENT_UNAVAILABLE'
        : 'PAYMENT_METHOD_UNAVAILABLE_FOR_CURRENCY',
    );
  }

  const session =
    await mongoose.startSession();

  /*
  |--------------------------------------------------------------------------
  | Successful Transaction Stock Transitions
  |--------------------------------------------------------------------------
  |
  | reserveSku() transaction ke andar notification send nahi karta.
  | Wo before + after snapshots return karta hai.
  |
  | MongoDB transaction successfully commit hone ke BAAD hi in
  | transitions ko notification service ko diya jayega.
  |--------------------------------------------------------------------------
  */

  let stockTransitions = [];

  try {
    let createdOrderId;

    await session.withTransaction(
      async () => {
        /*
        |--------------------------------------------------------------------------
        | IMPORTANT: Transaction Retry Safety
        |--------------------------------------------------------------------------
        |
        | withTransaction callback retry ho sakta hai.
        |
        | Isliye har attempt ke liye fresh array banate hain aur successful
        | callback ka result outer stockTransitions mein replace karte hain.
        |--------------------------------------------------------------------------
        */

        const attemptStockTransitions = [];

        const userId =
          getActorId(user);

        const rows =
          await loadCheckoutItems(
            input.items,
            session,
          );

        const items =
          buildOrderItems(
            rows,
            currency,
          );

        const {
          pricing,
          coupon,
        } =
          await calculatePricing({
            items,

            shippingAddress:
              input.shippingAddress,

            couponCode:
              input.couponCode,

            userId,

            session,

            currency,
          });

        /*
        |--------------------------------------------------------------------------
        | Stock Reservation
        |--------------------------------------------------------------------------
        |
        | reserveSku() now returns:
        |
        | {
        |   sku,
        |   stockTransition: {
        |     before,
        |     after
        |   }
        | }
        |
        | Notification yahan nahi bhejni.
        |--------------------------------------------------------------------------
        */

        const rowsBySku = [...rows].sort((x, y) =>
          String(x.sku._id).localeCompare(String(y.sku._id)),
        );

        for (const row of rowsBySku) {
          const reservation =
            await stockReservation
              .reserveSku(
                row.sku._id,

                row.requested
                  .quantity,

                session,
              );

          if (
            reservation
              ?.stockTransition
              ?.before &&
            reservation
              ?.stockTransition
              ?.after
          ) {
            attemptStockTransitions.push(
              reservation
                .stockTransition,
            );
          }
        }

        const orderNumber =
          await generateOrderNumber({
            session,
          });

        const couponSnapshot =
          coupon
            ? {
                couponId:
                  coupon.couponId,
                code:
                  coupon.code,

                discountType:
                  coupon.discountType,

                discountValue:
                  coupon.discountValue,

                discountAmount:
                  coupon.discountAmount,
              }
            : undefined;

        /*
        |--------------------------------------------------------------------------
        | Create Order
        |--------------------------------------------------------------------------
        */

        const [order] =
          await Order.create(
            [
              {
                orderNumber,

                user:
                  userId,

                customer:
                  input.customer,

                orderType:
                  'retail',

                currency,

                items,

                shippingAddress:
                  input.shippingAddress,

                pricing,

                paymentStatus:
                  'pending',

                orderStatus:
                  'pending',

                quote:
                  null,

                coupon:
                  couponSnapshot,

                statusHistory: [
                  {
                    status:
                      'pending',

                    note:
                      'Order placed',

                    changedBy:
                      userId,
                  },
                ],

                customerNotes:
                  input.customerNotes,

                placedAt:
                  new Date(),
              },
            ],
            {
              session,
            },
          );

        createdOrderId =
          order._id;

        /*
        |--------------------------------------------------------------------------
        | Coupon Redemption
        |--------------------------------------------------------------------------
        */

        if (coupon) {
          await couponService.redeem({
            couponId:
              coupon.couponId,

            userId,

            subtotal:
              pricing.subtotal,

            orderId:
              order._id,

            session,

            currency,
          });
        }

        /*
        | V1 payment is COD. The payment ledger row is created in the SAME
        | transaction as the order: an order never exists without it.
        */
        await paymentService
          .createCodPaymentInSession(
            order,
            session,
          );

        /*
        |--------------------------------------------------------------------------
        | Save Current Transaction Attempt Transitions
        |--------------------------------------------------------------------------
        |
        | Push directly outer array mein nahi kar rahe because
        | withTransaction callback retry ho sakta hai.
        |--------------------------------------------------------------------------
        */

        stockTransitions =
          attemptStockTransitions;
      },
    );

    /*
    |--------------------------------------------------------------------------
    | Transaction Successfully Committed
    |--------------------------------------------------------------------------
    |
    | Ab order + stock reservation permanent ho chuke hain.
    |--------------------------------------------------------------------------
    */

    const createdOrder =
      await Order.findById(
        createdOrderId,
      ).lean();

    /*
    |--------------------------------------------------------------------------
    | Automatic Stock Transition Notifications
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    | Ye transaction ke BAAD run ho raha hai.
    |
    | Examples:
    |
    | OK  -> LOW = LOW_STOCK
    | OK  -> OUT = OUT_OF_STOCK
    | LOW -> OUT = OUT_OF_STOCK
    |
    | Same state:
    |
    | OK  -> OK
    | LOW -> LOW
    | OUT -> OUT
    |
    | = no notification
    |--------------------------------------------------------------------------
    */

    for (
      const transition of
      stockTransitions
    ) {
      await bestEffort(
        'stock-transition',
        () =>
          stockNotification
            .handleStockTransition({
              before:
                transition.before,
              after:
                transition.after,
            }),
      );
    }

    /*
    |--------------------------------------------------------------------------
    | NEW_ORDER Admin Notification
    |--------------------------------------------------------------------------
    |
    | Order notification bhi successful transaction commit ke baad hi.
    |--------------------------------------------------------------------------
    */

    if (createdOrder) {
      await bestEffort(
        'new-order',
        () =>
          adminNotificationEvents
            .newOrder(
              createdOrder,
            ),
      );
    }

    return createdOrder;
  } finally {
    await session.endSession();
  }
}

/*
|--------------------------------------------------------------------------
| Customer - My Orders
|--------------------------------------------------------------------------
*/

async function listMyOrders(
  userId,
  query = {},
) {
  if (!userId) {
    throw ApiError.unauthorized(
      'Authentication required',
      'UNAUTHORIZED',
    );
  }

  const page =
    Math.max(
      1,
      Number(
        query.page,
      ) || 1,
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

  const filter = {
    user:
      userId,
  };

  if (query.status) {
    assertValidOrderStatus(
      query.status,
    );

    filter.orderStatus =
      query.status;
  }

  if (query.type) {
    assertValidOrderType(
      query.type,
    );

    filter.orderType =
      query.type;
  }

  const [
    total,
    items,
  ] = await Promise.all([
    Order.countDocuments(
      filter,
    ),

    Order.find(filter)
      .select({
        orderNumber: 1,
        orderType: 1,
        items: 1,
        pricing: 1,
        currency: 1,
        paymentStatus: 1,
        orderStatus: 1,
        shipment: 1,
        placedAt: 1,
        createdAt: 1,
      })
      .sort({
        createdAt: -1,
        _id: -1,
      })
      .skip(
        (page - 1) *
          limit,
      )
      .limit(limit)
      .lean(),
  ]);

  return {
    items,

    meta:
      buildPaginationMeta(
        page,
        limit,
        total,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Customer - Get My Order
|--------------------------------------------------------------------------
*/

async function getMyOrder(
  orderId,
  userId,
) {
  if (!userId) {
    throw ApiError.unauthorized(
      'Authentication required',
      'UNAUTHORIZED',
    );
  }

  const order =
    await Order.findOne({
      _id:
        orderId,

      user:
        userId,
    })
      .select({
        orderNumber: 1,
        orderType: 1,
        customer: 1,
        items: 1,
        shippingAddress: 1,
        pricing: 1,
        currency: 1,
        paymentStatus: 1,
        orderStatus: 1,
        coupon: 1,
        shipment: 1,
        statusHistory: 1,
        customerNotes: 1,
        placedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .lean();

  if (!order) {
    throw ApiError.notFound(
      'Order not found',
      'ORDER_NOT_FOUND',
    );
  }

  order.statusHistory =
    (
      order.statusHistory ||
      []
    ).map(
      (entry) => ({
        status:
          entry.status,

        note:
          entry.note,

        changedAt:
          entry.changedAt,
      }),
    );

  return order;
}

/*
|--------------------------------------------------------------------------
| Guest Order Tracking
|--------------------------------------------------------------------------
*/

async function trackGuestOrder({
  orderNumber,
  email,
  phone,
}) {
  const number =
    String(
      orderNumber ||
      '',
    )
      .trim()
      .toUpperCase();

  if (!number) {
    throw ApiError.badRequest(
      'Order number is required',
      'ORDER_NUMBER_REQUIRED',
    );
  }

  if (
    !email &&
    !phone
  ) {
    throw ApiError.badRequest(
      'Email or phone is required to track the order',
      'TRACKING_VERIFICATION_REQUIRED',
    );
  }

  const order =
    await Order.findOne({
      orderNumber:
        number,
    })
      .select({
        orderNumber: 1,
        customer: 1,
        orderType: 1,
        items: 1,
        pricing: 1,
        currency: 1,
        paymentStatus: 1,
        orderStatus: 1,
        shipment: 1,
        statusHistory: 1,
        placedAt: 1,
        createdAt: 1,
      })
      .lean();

  if (!order) {
    throw trackingFailed();
  }

  let verified = false;

  if (email) {
    const providedEmail =
      normalizeEmail(
        email,
      );

    const orderEmail =
      normalizeEmail(
        order.customer?.email,
      );

    verified =
      Boolean(
        providedEmail,
      ) &&
      Boolean(
        orderEmail,
      ) &&
      providedEmail ===
        orderEmail;
  }

  if (
    !verified &&
    phone
  ) {
    const providedPhone =
      normalizePhone(
        phone,
      );

    const orderPhone =
      normalizePhone(
        order.customer?.phone,
      );

    verified =
      Boolean(
        providedPhone,
      ) &&
      Boolean(
        orderPhone,
      ) &&
      providedPhone ===
        orderPhone;
  }

  if (!verified) {
    throw trackingFailed();
  }

  return {
    orderNumber:
      order.orderNumber,

    orderType:
      order.orderType,

    currency:
      order.currency ||
      DEFAULT_CURRENCY,

    orderStatus:
      order.orderStatus,

    paymentStatus:
      order.paymentStatus,

    placedAt:
      order.placedAt ||
      order.createdAt,

    customer: {
      name:
        order.customer?.name,
    },

    items:
      (
        order.items ||
        []
      ).map(
        (item) => ({
          productName:
            item.productName,

          colorName:
            item.colorName,

          size:
            item.size,

          quantity:
            item.quantity,

          unitPrice:
            item.unitPrice,

          lineTotal:
            item.lineTotal,

          image:
            item.image,
        }),
      ),

    pricing: {
      subtotal:
        order.pricing
          ?.subtotal,

      discount:
        order.pricing
          ?.discount,

      shipping:
        order.pricing
          ?.shipping,

      additionalCharges:
        order.pricing
          ?.additionalCharges,

      total:
        order.pricing
          ?.total,
    },

    shipment:
      order.shipment
        ? {
            courierName:
              order.shipment
                .courierName,

            trackingNumber:
              order.shipment
                .trackingNumber,

            trackingUrl:
              order.shipment
                .trackingUrl,

            shippedAt:
              order.shipment
                .shippedAt,

            deliveredAt:
              order.shipment
                .deliveredAt,
          }
        : null,

    statusHistory:
      (
        order.statusHistory ||
        []
      ).map(
        (entry) => ({
          status:
            entry.status,

          note:
            entry.note,

          changedAt:
            entry.changedAt,
        }),
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Admin - List Orders
|--------------------------------------------------------------------------
*/

async function listAdminOrders(
  query = {},
) {
  const page =
    Math.max(
      1,
      Number(
        query.page,
      ) || 1,
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

  if (query.status) {
    assertValidOrderStatus(
      query.status,
    );

    filter.orderStatus =
      query.status;
  }

  if (
    query.paymentStatus
  ) {
    assertValidPaymentStatus(
      query.paymentStatus,
    );

    filter.paymentStatus =
      query.paymentStatus;
  }

  if (query.type) {
    assertValidOrderType(
      query.type,
    );

    filter.orderType =
      query.type;
  }

  if (
    query.from ||
    query.to
  ) {
    filter.placedAt = {};

    if (query.from) {
      const from =
        new Date(
          query.from,
        );

      if (
        Number.isNaN(
          from.getTime(),
        )
      ) {
        throw ApiError.badRequest(
          'Invalid from date',
          'INVALID_DATE_RANGE',
        );
      }

      filter.placedAt.$gte =
        from;
    }

    if (query.to) {
      const to =
        new Date(
          query.to,
        );

      if (
        Number.isNaN(
          to.getTime(),
        )
      ) {
        throw ApiError.badRequest(
          'Invalid to date',
          'INVALID_DATE_RANGE',
        );
      }

      filter.placedAt.$lte =
        to;
    }
  }

  if (
    query.search &&
    String(
      query.search,
    ).trim()
  ) {
    const regex =
      new RegExp(
        escapeRegex(
          String(
            query.search,
          ).trim(),
        ),
        'i',
      );

    filter.$or = [
      {
        orderNumber:
          regex,
      },

      {
        'customer.name':
          regex,
      },

      {
        'customer.email':
          regex,
      },

      {
        'customer.phone':
          regex,
      },
    ];
  }

  const [
    total,
    items,
  ] = await Promise.all([
    Order.countDocuments(
      filter,
    ),

    Order.find(filter)
      .sort({
        placedAt: -1,
        _id: -1,
      })
      .skip(
        (page - 1) *
          limit,
      )
      .limit(limit)
      .lean(),
  ]);

  return {
    items,

    meta:
      buildPaginationMeta(
        page,
        limit,
        total,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Admin - Orders Summary
|--------------------------------------------------------------------------
*/

async function getAdminOrdersSummary() {
  const [
    total,
    pending,
    confirmed,
    processing,
    shipped,
    delivered,
    cancelled,
  ] = await Promise.all([
    Order.countDocuments(),

    Order.countDocuments({
      orderStatus:
        ORDER_STATUSES.PENDING,
    }),

    Order.countDocuments({
      orderStatus:
        ORDER_STATUSES.CONFIRMED,
    }),

    Order.countDocuments({
      orderStatus:
        ORDER_STATUSES.PROCESSING,
    }),

    Order.countDocuments({
      orderStatus:
        ORDER_STATUSES.SHIPPED,
    }),

    Order.countDocuments({
      orderStatus:
        ORDER_STATUSES.DELIVERED,
    }),

    Order.countDocuments({
      orderStatus:
        ORDER_STATUSES.CANCELLED,
    }),
  ]);

  return {
    total,
    pending,
    confirmed,
    processing,
    shipped,
    delivered,
    cancelled,
  };
}

/*
|--------------------------------------------------------------------------
| Admin - Get Order
|--------------------------------------------------------------------------
*/

async function getAdminOrder(
  orderId,
) {
  const order =
    await Order.findById(
      orderId,
    )
      .populate(
        'user',
        'name email phone',
      )
      .lean();

  if (!order) {
    throw ApiError.notFound(
      'Order not found',
      'ORDER_NOT_FOUND',
    );
  }

  return order;
}

/*
|--------------------------------------------------------------------------
| Validate Status Transition
|--------------------------------------------------------------------------
*/

function assertStatusTransition(
  currentStatus,
  nextStatus,
) {
  if (
    currentStatus ===
    nextStatus
  ) {
    throw ApiError.conflict(
      `Order is already ${nextStatus}`,
      'ORDER_STATUS_UNCHANGED',
    );
  }

  const allowed =
    STATUS_TRANSITIONS[
      currentStatus
    ] || [];

  if (
    !allowed.includes(
      nextStatus,
    )
  ) {
    throw ApiError.conflict(
      `Order cannot move from ${currentStatus} to ${nextStatus}`,
      'INVALID_ORDER_STATUS_TRANSITION',
    );
  }
}

/*
|--------------------------------------------------------------------------
| Admin - Update Order Status
|--------------------------------------------------------------------------
*/

async function updateOrderStatus({
  orderId,
  status,
  note,
  actor,
}) {
  assertValidOrderStatus(
    status,
  );

  const actorId =
    getActorId(actor);

  const session =
    await mongoose.startSession();

  /*
  |--------------------------------------------------------------------------
  | Post-Commit Stock Transitions
  |--------------------------------------------------------------------------
  |
  | Cancellation ke waqt releaseSku() before + after stock snapshots
  | return karega.
  |
  | Notifications transaction ke andar nahi bhejni.
  |--------------------------------------------------------------------------
  */

  let stockTransitions = [];

  try {
    let updatedOrderId;

    await session.withTransaction(
      async () => {
        /*
        |--------------------------------------------------------------------------
        | Transaction Retry Safety
        |--------------------------------------------------------------------------
        |
        | MongoDB withTransaction callback retry ho sakta hai.
        | Har attempt ka fresh transition collection rakhenge.
        |--------------------------------------------------------------------------
        */

        const attemptStockTransitions = [];

        const order =
          await Order.findById(
            orderId,
          ).session(session);

        if (!order) {
          throw ApiError.notFound(
            'Order not found',
            'ORDER_NOT_FOUND',
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Validate Status Transition
        |--------------------------------------------------------------------------
        */

        assertStatusTransition(
          order.orderStatus,
          status,
        );

        /*
        |--------------------------------------------------------------------------
        | Shipment Requirement
        |--------------------------------------------------------------------------
        */

        if (
          status ===
            ORDER_STATUSES.SHIPPED &&
          !order.shipment
            ?.trackingNumber
        ) {
          throw ApiError.conflict(
            'Add shipment tracking information before marking the order as shipped',
            'SHIPMENT_REQUIRED',
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Order Cancellation → Release Reserved Stock
        |--------------------------------------------------------------------------
        |
        | Current lifecycle allows:
        |
        | pending   -> cancelled
        | confirmed -> cancelled
        |
        | processing/shipped/delivered cancellation is already rejected by
        | STATUS_TRANSITIONS.
        |
        | Retail order items contain SKU + quantity.
        |
        | releaseSku():
        |
        | reservedStock -= quantity
        | available     += quantity
        |
        | Physical stock does NOT increase because reservation had never
        | deducted physical stock.
        |--------------------------------------------------------------------------
        */

        if (
          status ===
          ORDER_STATUSES.CANCELLED
        ) {
          /*
          | Shared cancellation path (also used by the customer
          | cancellation-request approval): releases reservations, gives
          | the coupon redemption back, cancels open payments and appends
          | the status history. Refuses paid orders (REFUND_REQUIRED).
          */
          const { stockTransitions: released } =
            await orderLifecycle
              .cancelOrder({
                order,
                session,
                actorId,
                note,
                recordStatus: false,
              });

          attemptStockTransitions.push(
            ...released,
          );
        }

        /*
        | SHIPPED -> convert reservations into a physical stock deduction
        | (once; guarded by order.stockCommittedAt).
        */
        if (
          status ===
          ORDER_STATUSES.SHIPPED
        ) {
          await orderLifecycle
            .commitOrderStock(
              order,
              session,
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Update Order Status
        |--------------------------------------------------------------------------
        */

        order.orderStatus =
          status;

        /*
        |--------------------------------------------------------------------------
        | Shipped Timestamp
        |--------------------------------------------------------------------------
        */

        if (
          status ===
          ORDER_STATUSES.SHIPPED
        ) {
          if (!order.shipment) {
            order.shipment = {};
          }

          order.shipment.shippedAt =
            order.shipment
              .shippedAt ||
            new Date();
        }

        /*
        |--------------------------------------------------------------------------
        | Delivered Timestamp
        |--------------------------------------------------------------------------
        */

        if (
          status ===
          ORDER_STATUSES.DELIVERED
        ) {
          if (!order.shipment) {
            order.shipment = {};
          }

          order.shipment.deliveredAt =
            order.shipment
              .deliveredAt ||
            new Date();
        }

        /*
        |--------------------------------------------------------------------------
        | Status History
        |--------------------------------------------------------------------------
        */

        if (
          !Array.isArray(
            order.statusHistory,
          )
        ) {
          order.statusHistory = [];
        }

        order.statusHistory.push({
          status,

          note:
            note ||
            `Order status changed to ${status}`,

          changedAt:
            new Date(),

          changedBy:
            actorId,
        });

        /*
        |--------------------------------------------------------------------------
        | Save Order
        |--------------------------------------------------------------------------
        */

        await order.save({
          session,
        });

        updatedOrderId =
          order._id;

        /*
        |--------------------------------------------------------------------------
        | Keep Only Current Transaction Attempt
        |--------------------------------------------------------------------------
        */

        stockTransitions =
          attemptStockTransitions;
      },
    );

    /*
    |--------------------------------------------------------------------------
    | MongoDB Transaction Successfully Committed
    |--------------------------------------------------------------------------
    |
    | Ab cancellation + reservation release permanent hai.
    |
    | Stock notifications ab safely process hongi.
    |--------------------------------------------------------------------------
    */

    for (
      const transition of
      stockTransitions
    ) {
      await bestEffort(
        'stock-transition',
        () =>
          stockNotification
            .handleStockTransition({
              before:
                transition.before,
              after:
                transition.after,
            }),
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Return Updated Order
    |--------------------------------------------------------------------------
    */

    return getAdminOrder(
      updatedOrderId,
    );
  } finally {
    await session.endSession();
  }
}

/*
|--------------------------------------------------------------------------
| Admin - Update Shipment
|--------------------------------------------------------------------------
*/

async function updateShipment({
  orderId,
  shipment,
}) {
  const order =
    await Order.findById(
      orderId,
    );

  if (!order) {
    throw ApiError.notFound(
      'Order not found',
      'ORDER_NOT_FOUND',
    );
  }

  if (
    order.orderStatus ===
      ORDER_STATUSES.DELIVERED ||
    order.orderStatus ===
      ORDER_STATUSES.CANCELLED
  ) {
    throw ApiError.conflict(
      'Shipment cannot be changed for this order',
      'SHIPMENT_UPDATE_NOT_ALLOWED',
    );
  }

  order.shipment = {
    ...(order.shipment?.toObject
      ? order.shipment.toObject()
      : order.shipment || {}),

    ...(shipment.courierName !==
    undefined
      ? {
          courierName:
            shipment.courierName,
        }
      : {}),

    ...(shipment.trackingNumber !==
    undefined
      ? {
          trackingNumber:
            shipment.trackingNumber,
        }
      : {}),

    ...(shipment.trackingUrl !==
    undefined
      ? {
          trackingUrl:
            shipment.trackingUrl,
        }
      : {}),
  };

  await order.save();

  return getAdminOrder(
    order._id,
  );
}

/*
|--------------------------------------------------------------------------
| Admin - Update Admin Notes
|--------------------------------------------------------------------------
*/

async function updateAdminNotes({
  orderId,
  adminNotes,
}) {
  const order =
    await Order.findById(
      orderId,
    );

  if (!order) {
    throw ApiError.notFound(
      'Order not found',
      'ORDER_NOT_FOUND',
    );
  }

  order.adminNotes =
    adminNotes;

  await order.save();

  return getAdminOrder(
    order._id,
  );
}

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  createRetailOrder,

  // exported for tests
  _internals: { buildOrderItems, calculatePricing },

  listMyOrders,
  getMyOrder,

  trackGuestOrder,

  listAdminOrders,
  getAdminOrdersSummary,
  getAdminOrder,

  updateOrderStatus,
  updateShipment,
  updateAdminNotes,
};