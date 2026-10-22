'use strict';

const mongoose = require('mongoose');

const Manufacturing = require('../models/Manufacturing');
const ApiError = require('../utils/ApiError');
const adminNotificationEvents = require('./adminNotificationEvents.service');
const {
  MANUFACTURING_DOCUMENT_TYPES,
  MANUFACTURING_REQUEST_STATUSES,
} = require('../constants/Manufacturing');

const {
  nextManufacturingRequestNumber,
} = require('./manufacturingNumber.service');

function escapeRegex(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

function pagination(page, limit, total) {
  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

async function findActiveCategory(categoryId, session = null) {
  const query = Manufacturing.findOne({
    _id: categoryId,
    documentType: MANUFACTURING_DOCUMENT_TYPES.CATEGORY,
    isActive: true,
  });

  if (session) query.session(session);

  const category = await query;

  if (!category) {
    throw ApiError.badRequest(
      'Manufacturing category is invalid or inactive',
      'INVALID_MANUFACTURING_CATEGORY',
    );
  }

  return category;
}

async function findActiveStyle(styleId, session = null) {
  const query = Manufacturing.findOne({
    _id: styleId,
    documentType: MANUFACTURING_DOCUMENT_TYPES.STYLE,
    isActive: true,
  });

  if (session) query.session(session);

  const style = await query;

  if (!style) {
    throw ApiError.badRequest(
      'Manufacturing style is invalid or inactive',
      'INVALID_MANUFACTURING_STYLE',
    );
  }

  return style;
}

async function findActiveVariant(variantId, session = null) {
  const query = Manufacturing.findOne({
    _id: variantId,
    documentType: MANUFACTURING_DOCUMENT_TYPES.VARIANT,
    isActive: true,
  });

  if (session) query.session(session);

  const variant = await query;

  if (!variant) {
    throw ApiError.badRequest(
      'Manufacturing variant is invalid or inactive',
      'INVALID_MANUFACTURING_VARIANT',
    );
  }

  return variant;
}

/* PUBLIC CATALOG */

async function listCategories({ page = 1, limit = 50 }) {
  const filter = {
    documentType: MANUFACTURING_DOCUMENT_TYPES.CATEGORY,
    isActive: true,
  };

  const skip = (page - 1) * limit;

  const [categories, total] = await Promise.all([
    Manufacturing.find(filter)
      .sort({ sortOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Manufacturing.countDocuments(filter),
  ]);

  return {
    categories,
    meta: pagination(page, limit, total),
  };
}

async function getCategoryBySlug(slug) {
  const category = await Manufacturing.findOne({
    documentType: MANUFACTURING_DOCUMENT_TYPES.CATEGORY,
    slug,
    isActive: true,
  }).lean();

  if (!category) {
    throw ApiError.notFound(
      'Manufacturing category not found',
      'MANUFACTURING_CATEGORY_NOT_FOUND',
    );
  }

  return category;
}

async function listStylesByCategory(categoryId) {
  await findActiveCategory(categoryId);

  return Manufacturing.find({
    documentType: MANUFACTURING_DOCUMENT_TYPES.STYLE,
    category: categoryId,
    isActive: true,
  })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
}

async function getStyleBySlug(slug) {
  const style = await Manufacturing.findOne({
    documentType: MANUFACTURING_DOCUMENT_TYPES.STYLE,
    slug,
    isActive: true,
  }).lean();

  if (!style) {
    throw ApiError.notFound(
      'Manufacturing style not found',
      'MANUFACTURING_STYLE_NOT_FOUND',
    );
  }

  return style;
}

async function listVariantsByStyle(styleId) {
  await findActiveStyle(styleId);

  return Manufacturing.find({
    documentType: MANUFACTURING_DOCUMENT_TYPES.VARIANT,
    style: styleId,
    isActive: true,
  })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
}

/* CUSTOMER REQUEST */

async function createRequest({
  userId,
  customer,
  categoryId,
  styleId,
  variantId,
  quantity,
  requirements,
  customerNotes,
}) {
  const session =
    await mongoose.startSession();

  try {
    let result;

    /*
    |--------------------------------------------------------------------------
    | Create Manufacturing Request Transaction
    |--------------------------------------------------------------------------
    */

    await session.withTransaction(
      async () => {
        /*
        |--------------------------------------------------------------------------
        | Validate Category
        |--------------------------------------------------------------------------
        */

        const category =
          await findActiveCategory(
            categoryId,
            session,
          );

        /*
        |--------------------------------------------------------------------------
        | Validate Style
        |--------------------------------------------------------------------------
        */

        const style =
          await findActiveStyle(
            styleId,
            session,
          );

        /*
        |--------------------------------------------------------------------------
        | Category -> Style Relationship
        |--------------------------------------------------------------------------
        */

        if (
          String(style.category) !==
          String(category._id)
        ) {
          throw ApiError.badRequest(
            'Selected style does not belong to selected category',
            'MANUFACTURING_STYLE_CATEGORY_MISMATCH',
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Optional Variant
        |--------------------------------------------------------------------------
        */

        let variant = null;

        if (variantId) {
          variant =
            await findActiveVariant(
              variantId,
              session,
            );

          /*
          |--------------------------------------------------------------------------
          | Style -> Variant Relationship
          |--------------------------------------------------------------------------
          */

          if (
            String(variant.style) !==
            String(style._id)
          ) {
            throw ApiError.badRequest(
              'Selected variant does not belong to selected style',
              'MANUFACTURING_VARIANT_STYLE_MISMATCH',
            );
          }
        }

        /*
        |--------------------------------------------------------------------------
        | Generate Request Number
        |--------------------------------------------------------------------------
        */

        const requestNumber =
          await nextManufacturingRequestNumber(
            session,
          );

        /*
        |--------------------------------------------------------------------------
        | Create Manufacturing Request
        |--------------------------------------------------------------------------
        */

        const [request] =
          await Manufacturing.create(
            [
              {
                documentType:
                  MANUFACTURING_DOCUMENT_TYPES
                    .REQUEST,

                requestNumber,

                user:
                  userId || null,

                customer,

                /*
                |--------------------------------------------------------------------------
                | Selection Snapshot
                |--------------------------------------------------------------------------
                |
                | Names/codes are snapshotted so future catalog changes do not
                | rewrite the historical Manufacturing request.
                |--------------------------------------------------------------------------
                */

                selection: {
                  category:
                    category._id,

                  style:
                    style._id,

                  variant:
                    variant?._id ||
                    null,

                  categoryName:
                    category.name,

                  styleName:
                    style.name,

                  variantName:
                    variant?.name,

                  variantCode:
                    variant?.variantCode,

                  colorName:
                    variant?.colorName,
                },

                quantity,

                requirements,

                customerNotes,

                status:
                  MANUFACTURING_REQUEST_STATUSES
                    .PENDING,
              },
            ],
            {
              session,
            },
          );

        result =
          request.toObject();
      },
    );

    /*
    |--------------------------------------------------------------------------
    | Post-Commit Admin Notification
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | Notification MongoDB transaction ke andar trigger nahi hoti.
    |
    | Flow:
    |
    | Manufacturing request created
    |        ↓
    | Transaction COMMIT
    |        ↓
    | NEW_MANUFACTURING_REQUEST notification
    |        ↓
    | Admin Notification DB + FCM
    |
    | Isse:
    |
    | - failed transaction par false notification nahi jayegi
    | - FCM/notification failure request ko rollback nahi karegi
    |--------------------------------------------------------------------------
    */

    if (result) {
      await adminNotificationEvents
        .newManufacturingRequest(
          result,
        );
    }

    return result;
  } finally {
    await session.endSession();
  }
}

async function listMyRequests({
  userId,
  status,
  page = 1,
  limit = 20,
}) {
  const filter = {
    documentType: MANUFACTURING_DOCUMENT_TYPES.REQUEST,
    user: userId,
  };

  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const [requests, total] = await Promise.all([
    Manufacturing.find(filter)
      .populate('quote', 'quoteNumber status pricing validUntil')
      .populate('order', 'orderNumber orderStatus paymentStatus')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Manufacturing.countDocuments(filter),
  ]);

  return {
    requests,
    meta: pagination(page, limit, total),
  };
}

async function getMyRequest({ requestId, userId }) {
  const request = await Manufacturing.findOne({
    _id: requestId,
    documentType: MANUFACTURING_DOCUMENT_TYPES.REQUEST,
    user: userId,
  })
    .populate('quote', 'quoteNumber status pricing validUntil')
    .populate('order', 'orderNumber orderStatus paymentStatus')
    .lean();

  if (!request) {
    throw ApiError.notFound(
      'Manufacturing request not found',
      'MANUFACTURING_REQUEST_NOT_FOUND',
    );
  }

  return request;
}

/* CATEGORY */

async function createCategory(data) {
  const existing = await Manufacturing.exists({
    documentType: MANUFACTURING_DOCUMENT_TYPES.CATEGORY,
    slug: data.slug,
  });

  if (existing) {
    throw ApiError.conflict(
      'Manufacturing category slug already exists',
      'MANUFACTURING_CATEGORY_SLUG_EXISTS',
    );
  }

  const category = await Manufacturing.create({
    documentType: MANUFACTURING_DOCUMENT_TYPES.CATEGORY,
    ...data,
  });

  return category.toObject();
}

async function updateCategory({ categoryId, data }) {
  const category = await Manufacturing.findOne({
    _id: categoryId,
    documentType: MANUFACTURING_DOCUMENT_TYPES.CATEGORY,
  });

  if (!category) {
    throw ApiError.notFound(
      'Manufacturing category not found',
      'MANUFACTURING_CATEGORY_NOT_FOUND',
    );
  }

  if (data.slug !== undefined && data.slug !== category.slug) {
    const exists = await Manufacturing.exists({
      _id: { $ne: category._id },
      documentType: MANUFACTURING_DOCUMENT_TYPES.CATEGORY,
      slug: data.slug,
    });

    if (exists) {
      throw ApiError.conflict(
        'Manufacturing category slug already exists',
        'MANUFACTURING_CATEGORY_SLUG_EXISTS',
      );
    }
  }

  const allowed = [
    'name',
    'slug',
    'description',
    'isActive',
    'sortOrder',
  ];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      category[key] = data[key];
    }
  }

  await category.save();

  return category.toObject();
}

/* STYLE */

async function createStyle(data) {
  await findActiveCategory(data.category);

  const existing = await Manufacturing.exists({
    documentType: MANUFACTURING_DOCUMENT_TYPES.STYLE,
    slug: data.slug,
  });

  if (existing) {
    throw ApiError.conflict(
      'Manufacturing style slug already exists',
      'MANUFACTURING_STYLE_SLUG_EXISTS',
    );
  }

  const style = await Manufacturing.create({
    documentType: MANUFACTURING_DOCUMENT_TYPES.STYLE,
    ...data,
  });

  return style.toObject();
}

async function updateStyle({ styleId, data }) {
  const style = await Manufacturing.findOne({
    _id: styleId,
    documentType: MANUFACTURING_DOCUMENT_TYPES.STYLE,
  });

  if (!style) {
    throw ApiError.notFound(
      'Manufacturing style not found',
      'MANUFACTURING_STYLE_NOT_FOUND',
    );
  }

  if (data.category !== undefined) {
    await findActiveCategory(data.category);
  }

  if (data.slug !== undefined && data.slug !== style.slug) {
    const exists = await Manufacturing.exists({
      _id: { $ne: style._id },
      documentType: MANUFACTURING_DOCUMENT_TYPES.STYLE,
      slug: data.slug,
    });

    if (exists) {
      throw ApiError.conflict(
        'Manufacturing style slug already exists',
        'MANUFACTURING_STYLE_SLUG_EXISTS',
      );
    }
  }

  const allowed = [
    'category',
    'name',
    'slug',
    'description',
    'isActive',
    'sortOrder',
  ];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      style[key] = data[key];
    }
  }

  await style.save();

  return style.toObject();
}

/* VARIANT */

async function createVariant(data) {
  await findActiveStyle(data.style);

  const existing = await Manufacturing.exists({
    documentType: MANUFACTURING_DOCUMENT_TYPES.VARIANT,
    variantCode: data.variantCode.toUpperCase(),
  });

  if (existing) {
    throw ApiError.conflict(
      'Manufacturing variant code already exists',
      'MANUFACTURING_VARIANT_CODE_EXISTS',
    );
  }

  const variant = await Manufacturing.create({
    documentType: MANUFACTURING_DOCUMENT_TYPES.VARIANT,
    ...data,
    variantCode: data.variantCode.toUpperCase(),
  });

  return variant.toObject();
}

async function updateVariant({ variantId, data }) {
  const variant = await Manufacturing.findOne({
    _id: variantId,
    documentType: MANUFACTURING_DOCUMENT_TYPES.VARIANT,
  });

  if (!variant) {
    throw ApiError.notFound(
      'Manufacturing variant not found',
      'MANUFACTURING_VARIANT_NOT_FOUND',
    );
  }

  if (data.style !== undefined) {
    await findActiveStyle(data.style);
  }

  if (
    data.variantCode !== undefined &&
    data.variantCode.toUpperCase() !== variant.variantCode
  ) {
    const exists = await Manufacturing.exists({
      _id: { $ne: variant._id },
      documentType: MANUFACTURING_DOCUMENT_TYPES.VARIANT,
      variantCode: data.variantCode.toUpperCase(),
    });

    if (exists) {
      throw ApiError.conflict(
        'Manufacturing variant code already exists',
        'MANUFACTURING_VARIANT_CODE_EXISTS',
      );
    }
  }

  const allowed = [
    'style',
    'name',
    'variantCode',
    'colorName',
    'description',
    'media',
    'isActive',
    'sortOrder',
  ];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      variant[key] =
        key === 'variantCode'
          ? data[key].toUpperCase()
          : data[key];
    }
  }

  await variant.save();

  return variant.toObject();
}

/* STATUS */

async function setCatalogStatus({
  documentId,
  documentType,
  isActive,
}) {
  const allowedTypes = [
    MANUFACTURING_DOCUMENT_TYPES.CATEGORY,
    MANUFACTURING_DOCUMENT_TYPES.STYLE,
    MANUFACTURING_DOCUMENT_TYPES.VARIANT,
  ];

  if (!allowedTypes.includes(documentType)) {
    throw ApiError.badRequest(
      'Invalid manufacturing catalog type',
      'INVALID_MANUFACTURING_CATALOG_TYPE',
    );
  }

  const document = await Manufacturing.findOne({
    _id: documentId,
    documentType,
  });

  if (!document) {
    throw ApiError.notFound(
      'Manufacturing catalog item not found',
      'MANUFACTURING_ITEM_NOT_FOUND',
    );
  }

  document.isActive = isActive;

  await document.save();

  return document.toObject();
}

/* ADMIN CATALOG */

async function listAdminCatalog(documentType) {
  const allowedTypes = [
    MANUFACTURING_DOCUMENT_TYPES.CATEGORY,
    MANUFACTURING_DOCUMENT_TYPES.STYLE,
    MANUFACTURING_DOCUMENT_TYPES.VARIANT,
  ];

  if (!allowedTypes.includes(documentType)) {
    throw ApiError.badRequest(
      'Invalid manufacturing catalog type',
      'INVALID_MANUFACTURING_CATALOG_TYPE',
    );
  }

  return Manufacturing.find({ documentType })
    .populate(
      documentType === MANUFACTURING_DOCUMENT_TYPES.STYLE
        ? 'category'
        : documentType === MANUFACTURING_DOCUMENT_TYPES.VARIANT
          ? 'style'
          : null,
      'name slug',
    )
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
}

/* ADMIN REQUESTS */

async function listAdminRequests({
  search,
  status,
  page = 1,
  limit = 10,
}) {
  const filter = {
    documentType: MANUFACTURING_DOCUMENT_TYPES.REQUEST,
  };

  if (status) filter.status = status;

  if (search) {
    const regex = new RegExp(
      escapeRegex(search),
      'i',
    );

    filter.$or = [
      { requestNumber: regex },
      { 'customer.name': regex },
      { 'customer.businessName': regex },
      { 'customer.email': regex },
      { 'customer.phone': regex },
      { 'selection.categoryName': regex },
      { 'selection.styleName': regex },
      { 'selection.variantName': regex },
      { 'selection.variantCode': regex },
    ];
  }

  const skip = (page - 1) * limit;

  const [requests, total] = await Promise.all([
    Manufacturing.find(filter)
      .populate('user', 'name email phone')
      .populate('quote', 'quoteNumber status pricing validUntil')
      .populate('order', 'orderNumber orderStatus paymentStatus')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    Manufacturing.countDocuments(filter),
  ]);

  return {
    requests,
    meta: pagination(page, limit, total),
  };
}

async function getAdminRequest(requestId) {
  const request = await Manufacturing.findOne({
    _id: requestId,
    documentType: MANUFACTURING_DOCUMENT_TYPES.REQUEST,
  })
    .populate('user', 'name email phone')
    .populate('reviewedBy', 'name email')
    .populate('approvedBy', 'name email')
    .populate('quote', 'quoteNumber status pricing validUntil')
    .populate('order', 'orderNumber orderStatus paymentStatus')
    .lean();

  if (!request) {
    throw ApiError.notFound(
      'Manufacturing request not found',
      'MANUFACTURING_REQUEST_NOT_FOUND',
    );
  }

  return request;
}

/* REVIEW / REJECT */

async function reviewRequest({
  requestId,
  adminUserId,
  action,
  adminNotes,
}) {
  const request = await Manufacturing.findOne({
    _id: requestId,
    documentType: MANUFACTURING_DOCUMENT_TYPES.REQUEST,
  });

  if (!request) {
    throw ApiError.notFound(
      'Manufacturing request not found',
      'MANUFACTURING_REQUEST_NOT_FOUND',
    );
  }

  const now = new Date();

  if (action === 'review') {
    if (
      request.status !==
      MANUFACTURING_REQUEST_STATUSES.PENDING
    ) {
      throw ApiError.conflict(
        'Only pending manufacturing requests can be moved under review',
        'INVALID_MANUFACTURING_REVIEW_STATUS',
      );
    }

    request.status =
      MANUFACTURING_REQUEST_STATUSES.UNDER_REVIEW;

    request.reviewedBy = adminUserId;
    request.reviewedAt = now;
  } else if (action === 'reject') {
    if (
      ![
        MANUFACTURING_REQUEST_STATUSES.PENDING,
        MANUFACTURING_REQUEST_STATUSES.UNDER_REVIEW,
      ].includes(request.status)
    ) {
      throw ApiError.conflict(
        'Manufacturing request cannot be rejected in its current status',
        'INVALID_MANUFACTURING_REJECTION_STATUS',
      );
    }

    request.status =
      MANUFACTURING_REQUEST_STATUSES.REJECTED;

    request.reviewedBy =
      request.reviewedBy || adminUserId;

    request.reviewedAt =
      request.reviewedAt || now;

    request.rejectedAt = now;
  } else {
    throw ApiError.badRequest(
      'Invalid manufacturing review action',
      'INVALID_MANUFACTURING_REVIEW_ACTION',
    );
  }

  if (adminNotes !== undefined) {
    request.adminNotes = adminNotes;
  }

  await request.save();

  return request.toObject();
}

/* APPROVE */

async function approveRequest({
  requestId,
  adminUserId,
  adminNotes,
}) {
  const request = await Manufacturing.findOne({
    _id: requestId,
    documentType: MANUFACTURING_DOCUMENT_TYPES.REQUEST,
  });

  if (!request) {
    throw ApiError.notFound(
      'Manufacturing request not found',
      'MANUFACTURING_REQUEST_NOT_FOUND',
    );
  }

  /*
   * Rejected is intentionally terminal.
   * Reopening should be a separate workflow if added later.
   */
  const allowedStatuses = [
    MANUFACTURING_REQUEST_STATUSES.PENDING,
    MANUFACTURING_REQUEST_STATUSES.UNDER_REVIEW,
  ];

  if (!allowedStatuses.includes(request.status)) {
    throw ApiError.conflict(
      'Manufacturing request cannot be approved in its current status',
      'INVALID_MANUFACTURING_APPROVAL_STATUS',
    );
  }

  const now = new Date();

  request.status =
    MANUFACTURING_REQUEST_STATUSES.APPROVED;

  request.reviewedBy =
    request.reviewedBy || adminUserId;

  request.reviewedAt =
    request.reviewedAt || now;

  request.approvedBy = adminUserId;
  request.approvedAt = now;

  if (adminNotes !== undefined) {
    request.adminNotes = adminNotes;
  }

  await request.save();

  return request.toObject();
}

module.exports = {
  listCategories,
  getCategoryBySlug,
  listStylesByCategory,
  getStyleBySlug,
  listVariantsByStyle,

  createRequest,
  listMyRequests,
  getMyRequest,

  createCategory,
  updateCategory,

  createStyle,
  updateStyle,

  createVariant,
  updateVariant,

  setCatalogStatus,
  listAdminCatalog,

  listAdminRequests,
  getAdminRequest,

  reviewRequest,
  approveRequest,
};