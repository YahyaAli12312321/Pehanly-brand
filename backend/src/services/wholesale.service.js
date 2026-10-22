'use strict';

const mongoose = require('mongoose');

const Wholesale = require('../models/Wholesale');
const Sku = require('../models/Sku');
const Product = require('../models/Product');
const ProductVariant = require('../models/ProductVariant');

const ApiError = require('../utils/ApiError');

const {
  WHOLESALE_REQUEST_STATUSES,
  WHOLESALE_REQUEST_TYPES,
} = require('../constants/Wholesale');

const {
  nextWholesaleRequestNumber,
} = require('./wholesaleNumber.service');

const adminNotificationEvents = require('./adminNotificationEvents.service');
  /*
  |--------------------------------------------------------------------------
  | Helpers
  |--------------------------------------------------------------------------
  */

  function calculateRequestedVolume(items) {
    return items.reduce(
      (total, item) => total + item.quantity,
      0,
    );
  }

  function calculatePricing(items) {
    const subtotal = items.reduce(
      (sum, item) => sum + item.lineTotal,
      0,
    );

    return {
      subtotal,
      estimatedTotal: subtotal,
    };
  }

  function ensureUniqueSkus(items) {
    const seen = new Set();

    for (const item of items) {
      const key = String(item.sku);

      if (seen.has(key)) {
        throw ApiError.badRequest(
          'Duplicate SKUs are not allowed',
          'DUPLICATE_WHOLESALE_SKU',
        );
      }

      seen.add(key);
    }
  }

  function escapeRegex(value) {
    return String(value).replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
  }

  function buildPaginationMeta({
    page,
    limit,
    total,
  }) {
    return {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Validate Wholesale Items
  |--------------------------------------------------------------------------
  |
  | Rules:
  | - SKU must exist.
  | - SKU must be enabled.
  | - Product must be wholesale enabled.
  | - Retail-only products cannot enter Wholesale.
  | - Wholesale price must exist.
  | - Retail price is NEVER used as fallback.
  | - MOQ applies at Product level across all selected SKUs.
  |--------------------------------------------------------------------------
  */

  async function buildValidatedItems(
    requestedItems,
    session = null,
  ) {
    ensureUniqueSkus(requestedItems);

    const skuIds = requestedItems.map(
      (item) => item.sku,
    );

    const skuQuery = Sku.find({
      _id: {
        $in: skuIds,
      },
    });

    if (session) {
      skuQuery.session(session);
    }

    const skus = await skuQuery.lean();

    if (skus.length !== skuIds.length) {
      throw ApiError.badRequest(
        'One or more wholesale SKUs are invalid',
        'INVALID_WHOLESALE_SKU',
      );
    }

    const skuMap = new Map(
      skus.map((sku) => [
        String(sku._id),
        sku,
      ]),
    );

    const productIds = [
      ...new Set(
        skus.map((sku) =>
          String(sku.product),
        ),
      ),
    ];

    const variantIds = [
      ...new Set(
        skus.map((sku) =>
          String(sku.variant),
        ),
      ),
    ];

    const productQuery = Product.find({
      _id: {
        $in: productIds,
      },
    });

    const variantQuery = ProductVariant.find({
      _id: {
        $in: variantIds,
      },
    });

    if (session) {
      productQuery.session(session);
      variantQuery.session(session);
    }

    const [products, variants] =
      await Promise.all([
        productQuery.lean(),
        variantQuery.lean(),
      ]);

    const productMap = new Map(
      products.map((product) => [
        String(product._id),
        product,
      ]),
    );

    const variantMap = new Map(
      variants.map((variant) => [
        String(variant._id),
        variant,
      ]),
    );

    /*
    |--------------------------------------------------------------------------
    | Calculate combined Product quantities
    |--------------------------------------------------------------------------
    |
    | Example:
    | Black M = 5
    | Black L = 5
    |
    | Product MOQ = 10
    |
    | Combined Product quantity = 10
    |--------------------------------------------------------------------------
    */

    const productQuantities = new Map();

    for (const requestedItem of requestedItems) {
      const sku = skuMap.get(
        String(requestedItem.sku),
      );

      if (!sku) {
        throw ApiError.badRequest(
          'Invalid wholesale SKU',
          'INVALID_WHOLESALE_SKU',
        );
      }

      const productKey =
        String(sku.product);

      const currentQuantity =
        productQuantities.get(productKey) || 0;

      productQuantities.set(
        productKey,
        currentQuantity +
          requestedItem.quantity,
      );
    }

    const result = [];

    for (const requestedItem of requestedItems) {
      const sku = skuMap.get(
        String(requestedItem.sku),
      );

      const product = productMap.get(
        String(sku.product),
      );

      const variant = variantMap.get(
        String(sku.variant),
      );

      if (!product || !variant) {
        throw ApiError.badRequest(
          'Wholesale product information is invalid',
          'INVALID_WHOLESALE_PRODUCT',
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Wholesale Eligibility
      |--------------------------------------------------------------------------
      |
      | This automatically keeps retail-only products
      | such as Ladies Shoes out of Wholesale.
      |--------------------------------------------------------------------------
      */

      if (!product.wholesale?.isEnabled) {
        throw ApiError.badRequest(
          `${product.name} is not available for wholesale`,
          'PRODUCT_NOT_WHOLESALE_ENABLED',
        );
      }

      if (!sku.isEnabled) {
        throw ApiError.badRequest(
          `${sku.sku} is not available`,
          'WHOLESALE_SKU_DISABLED',
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Wholesale Price
      |--------------------------------------------------------------------------
      |
      | Never fall back to retail price.
      |--------------------------------------------------------------------------
      */

      const wholesalePrice =
        Number(sku.wholesalePrice);

      if (
        !Number.isFinite(wholesalePrice) ||
        wholesalePrice <= 0
      ) {
        throw ApiError.badRequest(
          `Wholesale price is not configured for ${sku.sku}`,
          'WHOLESALE_PRICE_NOT_CONFIGURED',
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Product MOQ
      |--------------------------------------------------------------------------
      */

      const moq =
        Number(product.wholesale?.moq) || 0;

      const totalProductQuantity =
        productQuantities.get(
          String(product._id),
        ) || 0;

      if (
        moq > 0 &&
        totalProductQuantity < moq
      ) {
        throw ApiError.badRequest(
          `Minimum wholesale quantity for ${product.name} is ${moq}`,
          'WHOLESALE_MOQ_NOT_MET',
        );
      }

      const quantity =
        requestedItem.quantity;

      const lineTotal =
        wholesalePrice * quantity;

      /*
      |--------------------------------------------------------------------------
      | Snapshot
      |--------------------------------------------------------------------------
      |
      | Product/SKU names and price are snapshotted so future catalog
      | changes do not rewrite historical Wholesale requests.
      |--------------------------------------------------------------------------
      */

      result.push({
        product: product._id,
        variant: variant._id,
        sku: sku._id,

        productName: product.name,

        colorName:
          variant.color?.name ||
          variant.colorName ||
          undefined,

        size: sku.size,
        skuCode: sku.sku,

        wholesalePrice,

        quantity,
        lineTotal,
      });
    }

    return result;
  }

  /*
  |--------------------------------------------------------------------------
  | Create Custom / Build Your Own Wholesale Request
  |--------------------------------------------------------------------------
  */

  async function createCustomRequest({
  userId = null,
  customer,
  items,
  partnershipProposal,
  customerNotes,
}) {
  const session =
    await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(
      async () => {
        const validatedItems =
          await buildValidatedItems(
            items,
            session,
          );

        const pricing =
          calculatePricing(
            validatedItems,
          );

        const requestedVolume =
          calculateRequestedVolume(
            validatedItems,
          );

        const requestNumber =
          await nextWholesaleRequestNumber(
            session,
          );

        const [created] =
          await Wholesale.create(
            [
              {
                documentType:
                  'request',

                requestNumber,

                user:
                  userId,

                customer,

                requestType:
                  WHOLESALE_REQUEST_TYPES
                    .CUSTOM,

                sourcePack:
                  null,

                items:
                  validatedItems,

                requestedVolume,

                partnershipProposal,

                pricing,

                status:
                  WHOLESALE_REQUEST_STATUSES
                    .PENDING,

                customerNotes,
              },
            ],
            {
              session,
            },
          );

        result =
          created.toObject();
      },
    );

    /*
    |--------------------------------------------------------------------------
    | Post-Commit Admin Notification
    |--------------------------------------------------------------------------
    |
    | MongoDB transaction successful hone ke baad hi notification create hogi.
    |
    | Agar request creation rollback ho:
    | → notification nahi jayegi.
    |
    | Agar notification/FCM fail ho:
    | → valid wholesale request rollback nahi hogi.
    |--------------------------------------------------------------------------
    */

    if (result) {
      await adminNotificationEvents
        .newWholesaleRequest(
          result,
        );
    }

    return result;
  } finally {
    await session.endSession();
  }
}

  /*
  |--------------------------------------------------------------------------
  | Create Request From Ready Pack
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  | We do not blindly trust the price/data stored when the Pack was created.
  |
  | Current SKU:
  | - eligibility
  | - wholesale price
  | - MOQ
  | - enabled state
  |
  | are revalidated when customer submits the request.
  |--------------------------------------------------------------------------
  */

 async function createPackRequest({
  packId,
  userId = null,
  customer,
  partnershipProposal,
  customerNotes,
}) {
  const session =
    await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(
      async () => {
        const pack =
          await Wholesale.findOne({
            _id:
              packId,

            documentType:
              'pack',

            isActive:
              true,
          }).session(
            session,
          );

        if (!pack) {
          throw ApiError.notFound(
            'Wholesale pack not found',
            'WHOLESALE_PACK_NOT_FOUND',
          );
        }

        const requestedItems =
          pack.items.map(
            (item) => ({
              sku:
                item.sku,

              quantity:
                item.quantity,
            }),
          );

        if (
          !requestedItems.length
        ) {
          throw ApiError.conflict(
            'Wholesale pack has no items',
            'WHOLESALE_PACK_EMPTY',
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Revalidate Pack Items
        |--------------------------------------------------------------------------
        |
        | Ready Pack ke stored price/data ko blindly trust nahi karte.
        |
        | Current:
        | - SKU availability/configuration
        | - Wholesale eligibility
        | - Wholesale pricing
        | - MOQ
        |
        | dobara validate hota hai.
        |--------------------------------------------------------------------------
        */

        const validatedItems =
          await buildValidatedItems(
            requestedItems,
            session,
          );

        const pricing =
          calculatePricing(
            validatedItems,
          );

        const requestedVolume =
          calculateRequestedVolume(
            validatedItems,
          );

        const requestNumber =
          await nextWholesaleRequestNumber(
            session,
          );

        const [created] =
          await Wholesale.create(
            [
              {
                documentType:
                  'request',

                requestNumber,

                user:
                  userId,

                customer,

                requestType:
                  WHOLESALE_REQUEST_TYPES
                    .READY_PACK,

                sourcePack:
                  pack._id,

                items:
                  validatedItems,

                requestedVolume,

                partnershipProposal,

                pricing,

                status:
                  WHOLESALE_REQUEST_STATUSES
                    .PENDING,

                customerNotes,
              },
            ],
            {
              session,
            },
          );

        result =
          created.toObject();
      },
    );

    /*
    |--------------------------------------------------------------------------
    | Post-Commit Admin Notification
    |--------------------------------------------------------------------------
    |
    | Ready Pack request successfully commit hone ke baad hi admin
    | notification + FCM trigger hoga.
    |--------------------------------------------------------------------------
    */

    if (result) {
      await adminNotificationEvents
        .newWholesaleRequest(
          result,
        );
    }

    return result;
  } finally {
    await session.endSession();
  }
}

  /*
  |--------------------------------------------------------------------------
  | Public Ready Packs
  |--------------------------------------------------------------------------
  */

  async function listActivePacks({
    page = 1,
    limit = 20,
  }) {
    const filter = {
      documentType: 'pack',
      isActive: true,
    };

    const skip =
      (page - 1) * limit;

    const [packs, total] =
      await Promise.all([
        Wholesale.find(filter)
          .sort({
            sortOrder: 1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Wholesale.countDocuments(
          filter,
        ),
      ]);

    return {
      packs,

      meta: buildPaginationMeta({
        page,
        limit,
        total,
      }),
    };
  }

  async function getActivePackBySlug(slug) {
    const pack =
      await Wholesale.findOne({
        documentType: 'pack',
        slug,
        isActive: true,
      }).lean();

    if (!pack) {
      throw ApiError.notFound(
        'Wholesale pack not found',
        'WHOLESALE_PACK_NOT_FOUND',
      );
    }

    return pack;
  }

  /*
  |--------------------------------------------------------------------------
  | Customer Wholesale Requests
  |--------------------------------------------------------------------------
  */

  async function listMyRequests({
    userId,
    status,
    page = 1,
    limit = 20,
  }) {
    const filter = {
      documentType: 'request',
      user: userId,
    };

    if (status) {
      filter.status = status;
    }

    const skip =
      (page - 1) * limit;

    const [requests, total] =
      await Promise.all([
        Wholesale.find(filter)
          .populate(
            'sourcePack',
            'name slug',
          )
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Wholesale.countDocuments(
          filter,
        ),
      ]);

    return {
      requests,

      meta: buildPaginationMeta({
        page,
        limit,
        total,
      }),
    };
  }

  async function getMyRequest({
    requestId,
    userId,
  }) {
    const request =
      await Wholesale.findOne({
        _id: requestId,
        documentType: 'request',
        user: userId,
      })
        .populate(
          'sourcePack',
          'name slug',
        )
        .lean();

    if (!request) {
      throw ApiError.notFound(
        'Wholesale request not found',
        'WHOLESALE_REQUEST_NOT_FOUND',
      );
    }

    return request;
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Wholesale Request Listing
  |--------------------------------------------------------------------------
  |
  | Filters:
  | - search
  | - status
  | - requestType
  | - pagination
  |--------------------------------------------------------------------------
  */

  async function listAdminRequests({
    search,
    status,
    requestType,
    page = 1,
    limit = 10,
  }) {
    const filter = {
      documentType: 'request',
    };

    if (status) {
      filter.status = status;
    }

    if (requestType) {
      filter.requestType =
        requestType;
    }

    if (search) {
      const safeSearch =
        escapeRegex(search);

      const regex =
        new RegExp(
          safeSearch,
          'i',
        );

      filter.$or = [
        {
          requestNumber: regex,
        },
        {
          'customer.businessName':
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
        {
          'customer.taxNtn':
            regex,
        },
      ];
    }

    const skip =
      (page - 1) * limit;

    const [requests, total] =
      await Promise.all([
        Wholesale.find(filter)
          .populate(
            'user',
            'name email phone',
          )
          .populate(
            'sourcePack',
            'name slug',
          )
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Wholesale.countDocuments(
          filter,
        ),
      ]);

    return {
      requests,

      meta: buildPaginationMeta({
        page,
        limit,
        total,
      }),
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Wholesale Request Detail
  |--------------------------------------------------------------------------
  */

  async function getAdminRequest(
    requestId,
  ) {
    const request =
      await Wholesale.findOne({
        _id: requestId,
        documentType: 'request',
      })
        .populate(
          'user',
          'name email phone',
        )
        .populate(
          'sourcePack',
          'name slug',
        )
        .populate(
          'reviewedBy',
          'name email',
        )
        .populate(
          'approvedBy',
          'name email',
        )
        .lean();

    if (!request) {
      throw ApiError.notFound(
        'Wholesale request not found',
        'WHOLESALE_REQUEST_NOT_FOUND',
      );
    }

    return request;
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Wholesale Dashboard Stats
  |--------------------------------------------------------------------------
  */

  async function getAdminStats() {
    const [
      totalInquiries,
      underReview,
      approvedPartners,
      volumeResult,
    ] = await Promise.all([
      Wholesale.countDocuments({
        documentType: 'request',
      }),

      Wholesale.countDocuments({
        documentType: 'request',

        status:
          WHOLESALE_REQUEST_STATUSES
            .UNDER_REVIEW,
      }),

      Wholesale.countDocuments({
        documentType: 'request',

        status: {
          $in: [
            WHOLESALE_REQUEST_STATUSES
              .APPROVED,

            WHOLESALE_REQUEST_STATUSES
              .QUOTED,

            WHOLESALE_REQUEST_STATUSES
              .ACCEPTED,

            WHOLESALE_REQUEST_STATUSES
              .CONVERTED_TO_ORDER,
          ],
        },
      }),

      Wholesale.aggregate([
        {
          $match: {
            documentType: 'request',

            status: {
              $nin: [
                WHOLESALE_REQUEST_STATUSES
                  .REJECTED,

                WHOLESALE_REQUEST_STATUSES
                  .CANCELLED,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,

            totalRequestedVolume: {
              $sum: {
                $ifNull: [
                  '$requestedVolume',
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    return {
      totalInquiries,
      underReview,
      approvedPartners,

      requestedVolume:
        volumeResult[0]
          ?.totalRequestedVolume || 0,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Review / Reject Wholesale Request
  |--------------------------------------------------------------------------
  |
  | Allowed:
  |
  | pending -> under_review
  | pending -> rejected
  | under_review -> rejected
  |--------------------------------------------------------------------------
  */

  async function reviewRequest({
    requestId,
    adminUserId,
    action,
    adminNotes,
  }) {
    const request =
      await Wholesale.findOne({
        _id: requestId,
        documentType: 'request',
      });

    if (!request) {
      throw ApiError.notFound(
        'Wholesale request not found',
        'WHOLESALE_REQUEST_NOT_FOUND',
      );
    }

    const reviewableStatuses = [
      WHOLESALE_REQUEST_STATUSES
        .PENDING,

      WHOLESALE_REQUEST_STATUSES
        .UNDER_REVIEW,
    ];

    if (
      !reviewableStatuses.includes(
        request.status,
      )
    ) {
      throw ApiError.conflict(
        'Wholesale request cannot be reviewed in its current status',
        'INVALID_WHOLESALE_REQUEST_STATUS',
      );
    }

    const now = new Date();

    if (action === 'review') {
      request.status =
        WHOLESALE_REQUEST_STATUSES
          .UNDER_REVIEW;

      request.reviewedBy =
        adminUserId;

      request.reviewedAt =
        request.reviewedAt || now;
    }

    if (action === 'reject') {
      request.status =
        WHOLESALE_REQUEST_STATUSES
          .REJECTED;

      request.reviewedBy =
        adminUserId;

      request.reviewedAt =
        request.reviewedAt || now;

      request.rejectedAt = now;
    }

    if (adminNotes !== undefined) {
      request.adminNotes =
        adminNotes;
    }

    await request.save();

    return request.toObject();
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Approve Wholesale Request
  |--------------------------------------------------------------------------
  |
  | IMPORTANT:
  | Rejected requests are intentionally NOT directly approvable.
  |
  | If we ever need to reopen a rejected request,
  | it should have its own explicit reopen workflow.
  |--------------------------------------------------------------------------
  */

  async function approveRequest({
    requestId,
    adminUserId,
    adminNotes,
    discountScheme,
  }) {
    const request =
      await Wholesale.findOne({
        _id: requestId,
        documentType: 'request',
      });

    if (!request) {
      throw ApiError.notFound(
        'Wholesale request not found',
        'WHOLESALE_REQUEST_NOT_FOUND',
      );
    }

    const approvableStatuses = [
      WHOLESALE_REQUEST_STATUSES
        .PENDING,

      WHOLESALE_REQUEST_STATUSES
        .UNDER_REVIEW,
    ];

    if (
      !approvableStatuses.includes(
        request.status,
      )
    ) {
      throw ApiError.conflict(
        'Wholesale request cannot be approved in its current status',
        'INVALID_WHOLESALE_APPROVAL_STATUS',
      );
    }

    const now = new Date();

    request.status =
      WHOLESALE_REQUEST_STATUSES
        .APPROVED;

    request.reviewedBy =
      request.reviewedBy ||
      adminUserId;

    request.reviewedAt =
      request.reviewedAt ||
      now;

    request.approvedBy =
      adminUserId;

    request.approvedAt = now;

    /*
    * Defensive cleanup in case legacy data
    * contains a rejection timestamp.
    */
    request.rejectedAt =
      undefined;

    if (adminNotes !== undefined) {
      request.adminNotes =
        adminNotes;
    }

    if (discountScheme !== undefined) {
      request.discountScheme =
        discountScheme;
    }

    await request.save();

    return request.toObject();
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Create Ready Pack
  |--------------------------------------------------------------------------
  */

  async function createPack(data) {
    ensureUniqueSkus(data.items);

    /*
    * Validate eligibility, SKU configuration,
    * MOQ and wholesale pricing before allowing
    * the Pack to be created.
    */
    const validatedItems =
      await buildValidatedItems(
        data.items,
      );

    const existing =
      await Wholesale.exists({
        documentType: 'pack',
        slug: data.slug,
      });

    if (existing) {
      throw ApiError.conflict(
        'Wholesale pack slug already exists',
        'WHOLESALE_PACK_SLUG_EXISTS',
      );
    }

    const pack =
      await Wholesale.create({
        documentType: 'pack',

        name: data.name,
        slug: data.slug,

        description:
          data.description,

        image:
          data.image,

        items:
          validatedItems.map(
            (item) => ({
              product:
                item.product,

              variant:
                item.variant,

              sku:
                item.sku,

              quantity:
                item.quantity,
            }),
          ),

        isActive:
          data.isActive,

        sortOrder:
          data.sortOrder,
      });

    return pack.toObject();
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Ready Pack Listing
  |--------------------------------------------------------------------------
  */

  async function listAdminPacks({
    page = 1,
    limit = 20,
  }) {
    const filter = {
      documentType: 'pack',
    };

    const skip =
      (page - 1) * limit;

    const [packs, total] =
      await Promise.all([
        Wholesale.find(filter)
          .sort({
            sortOrder: 1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Wholesale.countDocuments(
          filter,
        ),
      ]);

    return {
      packs,

      meta: buildPaginationMeta({
        page,
        limit,
        total,
      }),
    };
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Ready Pack Detail
  |--------------------------------------------------------------------------
  */

  async function getAdminPack(
    packId,
  ) {
    const pack =
      await Wholesale.findOne({
        _id: packId,
        documentType: 'pack',
      }).lean();

    if (!pack) {
      throw ApiError.notFound(
        'Wholesale pack not found',
        'WHOLESALE_PACK_NOT_FOUND',
      );
    }

    return pack;
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Update Ready Pack
  |--------------------------------------------------------------------------
  */

  async function updatePack({
    packId,
    data,
  }) {
    const pack =
      await Wholesale.findOne({
        _id: packId,
        documentType: 'pack',
      });

    if (!pack) {
      throw ApiError.notFound(
        'Wholesale pack not found',
        'WHOLESALE_PACK_NOT_FOUND',
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Slug uniqueness
    |--------------------------------------------------------------------------
    */

    if (
      data.slug !== undefined &&
      data.slug !== pack.slug
    ) {
      const existing =
        await Wholesale.exists({
          _id: {
            $ne: pack._id,
          },

          documentType: 'pack',
          slug: data.slug,
        });

      if (existing) {
        throw ApiError.conflict(
          'Wholesale pack slug already exists',
          'WHOLESALE_PACK_SLUG_EXISTS',
        );
      }

      pack.slug =
        data.slug;
    }

    /*
    |--------------------------------------------------------------------------
    | Pack Items
    |--------------------------------------------------------------------------
    |
    | Revalidate every changed item.
    |--------------------------------------------------------------------------
    */

    if (data.items !== undefined) {
      ensureUniqueSkus(
        data.items,
      );

      const validatedItems =
        await buildValidatedItems(
          data.items,
        );

      pack.items =
        validatedItems.map(
          (item) => ({
            product:
              item.product,

            variant:
              item.variant,

            sku:
              item.sku,

            quantity:
              item.quantity,
          }),
        );
    }

    if (data.name !== undefined) {
      pack.name =
        data.name;
    }

    if (
      data.description !== undefined
    ) {
      pack.description =
        data.description;
    }

    if (data.image !== undefined) {
      pack.image =
        data.image;
    }

    if (data.isActive !== undefined) {
      pack.isActive =
        data.isActive;
    }

    if (data.sortOrder !== undefined) {
      pack.sortOrder =
        data.sortOrder;
    }

    await pack.save();

    return pack.toObject();
  }

  /*
  |--------------------------------------------------------------------------
  | Admin Activate / Deactivate Ready Pack
  |--------------------------------------------------------------------------
  */

  async function setPackStatus({
    packId,
    isActive,
  }) {
    const pack =
      await Wholesale.findOne({
        _id: packId,
        documentType: 'pack',
      });

    if (!pack) {
      throw ApiError.notFound(
        'Wholesale pack not found',
        'WHOLESALE_PACK_NOT_FOUND',
      );
    }

    /*
    * When activating an existing pack,
    * revalidate its current SKU/product setup.
    *
    * This prevents an old Pack from becoming public
    * after its Product was made retail-only,
    * SKU was disabled, MOQ changed, etc.
    */
    if (isActive && !pack.isActive) {
      if (!pack.items?.length) {
        throw ApiError.conflict(
          'Wholesale pack has no items',
          'WHOLESALE_PACK_EMPTY',
        );
      }

      await buildValidatedItems(
        pack.items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
        })),
      );
    }

    pack.isActive =
      isActive;

    await pack.save();

    return pack.toObject();
  }

  /*
  |--------------------------------------------------------------------------
  | Exports
  |--------------------------------------------------------------------------
  */

  module.exports = {
    /*
    * Shared/internal helper
    */
    buildValidatedItems,

    /*
    * Customer Requests
    */
    createCustomRequest,
    createPackRequest,

    /*
    * Public Packs
    */
    listActivePacks,
    getActivePackBySlug,

    /*
    * Customer Request History
    */
    listMyRequests,
    getMyRequest,

    /*
    * Admin Requests
    */
    listAdminRequests,
    getAdminRequest,
    getAdminStats,

    reviewRequest,
    approveRequest,

    /*
    * Admin Ready Packs
    */
    createPack,
    listAdminPacks,
    getAdminPack,
    updatePack,
    setPackStatus,
  };