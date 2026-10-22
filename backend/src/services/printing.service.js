'use strict';

const mongoose = require('mongoose');

const Printing = require('../models/Printing');
const ApiError = require('../utils/ApiError');

const {
  PRINTING_DOCUMENT_TYPES,
  PRINTING_REQUEST_STATUSES,
} = require('../constants/Printing');

const {
  nextPrintingRequestNumber,
} = require('./printingNumber.service');
const adminNotificationEvents = require('./adminNotificationEvents.service');

function escapeRegex(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

function buildPagination(page, limit, total) {
  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}

/*
|--------------------------------------------------------------------------
| Public Services
|--------------------------------------------------------------------------
*/

async function listPublicServices({
  search,
  page = 1,
  limit = 20,
}) {
  const filter = {
    documentType:
      PRINTING_DOCUMENT_TYPES.SERVICE,
    isActive: true,
  };

  if (search) {
    const regex =
      new RegExp(
        escapeRegex(search),
        'i',
      );

    filter.$or = [
      { name: regex },
      { description: regex },
    ];
  }

  const skip =
    (page - 1) * limit;

  const [services, total] =
    await Promise.all([
      Printing.find(filter)
        .sort({
          sortOrder: 1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Printing.countDocuments(filter),
    ]);

  return {
    services,
    meta: buildPagination(
      page,
      limit,
      total,
    ),
  };
}

async function getPublicService(id) {
  const service =
    await Printing.findOne({
      _id: id,

      documentType:
        PRINTING_DOCUMENT_TYPES.SERVICE,

      isActive: true,
    }).lean();

  if (!service) {
    throw ApiError.notFound(
      'Printing service not found',
      'PRINTING_SERVICE_NOT_FOUND',
    );
  }

  return service;
}

/*
|--------------------------------------------------------------------------
| Create Request
|--------------------------------------------------------------------------
*/

async function createRequest({
  userId = null,
  serviceId,
  customer,
  garmentSource,
  garmentDetails,
  colors,
  quantity,
  requirements,
  placements,
  artwork,
  customerNotes,
}) {
  const session =
    await mongoose.startSession();

  try {
    let requestId;

    /*
    |--------------------------------------------------------------------------
    | Create Printing Request Transaction
    |--------------------------------------------------------------------------
    */

    await session.withTransaction(
      async () => {
        /*
        |--------------------------------------------------------------------------
        | Validate Printing Service
        |--------------------------------------------------------------------------
        */

        const service =
          await Printing.findOne({
            _id: serviceId,

            documentType:
              PRINTING_DOCUMENT_TYPES.SERVICE,

            isActive: true,
          }).session(session);

        if (!service) {
          throw ApiError.notFound(
            'Printing service not found',
            'PRINTING_SERVICE_NOT_FOUND',
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Generate Request Number
        |--------------------------------------------------------------------------
        */

        const requestNumber =
          await nextPrintingRequestNumber(
            session,
          );

        /*
        |--------------------------------------------------------------------------
        | Create Printing Request
        |--------------------------------------------------------------------------
        */

        const [request] =
          await Printing.create(
            [
              {
                documentType:
                  PRINTING_DOCUMENT_TYPES.REQUEST,

                requestNumber,

                user:
                  userId || null,

                customer,

                /*
                |--------------------------------------------------------------------------
                | Printing Service Snapshot
                |--------------------------------------------------------------------------
                |
                | Service name/slug snapshot preserve kiye ja rahe hain taake
                | future service changes historical request ko affect na karein.
                |--------------------------------------------------------------------------
                */

                selection: {
                  service:
                    service._id,

                  serviceName:
                    service.name,

                  serviceSlug:
                    service.slug,
                },

                garmentSource,

                garmentDetails,

                /*
                |--------------------------------------------------------------------------
                | Colors
                |--------------------------------------------------------------------------
                |
                | Duplicate colors remove kiye jaate hain.
                |--------------------------------------------------------------------------
                */

                colors:
                  colors?.length
                    ? [
                        ...new Set(
                          colors.map(
                            (color) =>
                              color.trim(),
                          ),
                        ),
                      ]
                    : undefined,

                quantity,

                requirements,

                placements:
                  placements?.length
                    ? placements
                    : undefined,

                artwork:
                  artwork?.length
                    ? artwork
                    : undefined,

                customerNotes,

                status:
                  PRINTING_REQUEST_STATUSES
                    .PENDING,
              },
            ],
            {
              session,
            },
          );

        requestId =
          request._id;
      },
    );

    /*
    |--------------------------------------------------------------------------
    | Transaction Successfully Committed
    |--------------------------------------------------------------------------
    |
    | Request ko transaction ke baad read karte hain.
    |--------------------------------------------------------------------------
    */

    const createdRequest =
      await Printing.findById(
        requestId,
      ).lean();

    /*
    |--------------------------------------------------------------------------
    | Post-Commit Admin Notification
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | NEW_PRINTING_REQUEST notification transaction ke andar nahi chalti.
    |
    | Flow:
    |
    | Printing request created
    |        ↓
    | MongoDB transaction COMMIT
    |        ↓
    | Request fetch
    |        ↓
    | newPrintingRequest()
    |        ↓
    | Admin Notification DB
    |        +
    | Admin FCM Push
    |
    | Iska benefit:
    |
    | - transaction fail hui to false notification nahi jayegi
    | - notification/FCM failure valid printing request ko rollback nahi karegi
    |--------------------------------------------------------------------------
    */

    if (createdRequest) {
      await adminNotificationEvents
        .newPrintingRequest(
          createdRequest,
        );
    }

    return createdRequest;
  } finally {
    await session.endSession();
  }
}
/*
|--------------------------------------------------------------------------
| Customer Requests
|--------------------------------------------------------------------------
*/

async function listMyRequests({
  userId,
  status,
  page = 1,
  limit = 20,
}) {
  const filter = {
    documentType:
      PRINTING_DOCUMENT_TYPES.REQUEST,

    user: userId,
  };

  if (status) {
    filter.status = status;
  }

  const skip =
    (page - 1) * limit;

  const [requests, total] =
    await Promise.all([
      Printing.find(filter)
        .populate(
          'quote',
          'quoteNumber status pricing validUntil',
        )
        .populate(
          'order',
          'orderNumber orderType orderStatus paymentStatus pricing',
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Printing.countDocuments(filter),
    ]);

  return {
    requests,

    meta: buildPagination(
      page,
      limit,
      total,
    ),
  };
}

async function getMyRequest({
  requestId,
  userId,
}) {
  const request =
    await Printing.findOne({
      _id: requestId,

      documentType:
        PRINTING_DOCUMENT_TYPES.REQUEST,

      user: userId,
    })
      .populate(
        'quote',
        'quoteNumber status pricing validUntil customerNotes terms sentAt acceptedAt',
      )
      .populate(
        'order',
        'orderNumber orderType orderStatus paymentStatus pricing shippingAddress',
      )
      .lean();

  if (!request) {
    throw ApiError.notFound(
      'Printing request not found',
      'PRINTING_REQUEST_NOT_FOUND',
    );
  }

  return request;
}

/*
|--------------------------------------------------------------------------
| Admin Service - Create
|--------------------------------------------------------------------------
*/

async function createService({
  name,
  slug,
  description,
  media,
  isActive = true,
  sortOrder = 0,
}) {
  try {
    const service =
      await Printing.create({
        documentType:
          PRINTING_DOCUMENT_TYPES.SERVICE,

        name,
        slug: slug.toLowerCase(),
        description,

        media:
          media?.length
            ? media
            : undefined,

        isActive,
        sortOrder,
      });

    return service.toObject();
  } catch (error) {
    if (error?.code === 11000) {
      throw ApiError.conflict(
        'A printing service with this slug already exists',
        'PRINTING_SERVICE_SLUG_EXISTS',
      );
    }

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| Admin Service - List
|--------------------------------------------------------------------------
*/

async function listAdminServices({
  search,
  isActive,
  page = 1,
  limit = 20,
}) {
  const filter = {
    documentType:
      PRINTING_DOCUMENT_TYPES.SERVICE,
  };

  if (isActive !== undefined) {
    filter.isActive =
      isActive === true ||
      isActive === 'true';
  }

  if (search) {
    const regex =
      new RegExp(
        escapeRegex(search),
        'i',
      );

    filter.$or = [
      { name: regex },
      { slug: regex },
      { description: regex },
    ];
  }

  const skip =
    (page - 1) * limit;

  const [services, total] =
    await Promise.all([
      Printing.find(filter)
        .sort({
          sortOrder: 1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Printing.countDocuments(filter),
    ]);

  return {
    services,

    meta: buildPagination(
      page,
      limit,
      total,
    ),
  };
}

async function getAdminService(
  serviceId,
) {
  const service =
    await Printing.findOne({
      _id: serviceId,

      documentType:
        PRINTING_DOCUMENT_TYPES.SERVICE,
    }).lean();

  if (!service) {
    throw ApiError.notFound(
      'Printing service not found',
      'PRINTING_SERVICE_NOT_FOUND',
    );
  }

  return service;
}

async function updateService({
  serviceId,
  data,
}) {
  const service =
    await Printing.findOne({
      _id: serviceId,

      documentType:
        PRINTING_DOCUMENT_TYPES.SERVICE,
    });

  if (!service) {
    throw ApiError.notFound(
      'Printing service not found',
      'PRINTING_SERVICE_NOT_FOUND',
    );
  }

  const allowedFields = [
    'name',
    'slug',
    'description',
    'media',
    'isActive',
    'sortOrder',
  ];

  for (
    const field of
    allowedFields
  ) {
    if (
      data[field] !== undefined
    ) {
      service[field] =
        data[field];
    }
  }

  if (data.slug) {
    service.slug =
      data.slug.toLowerCase();
  }

  try {
    await service.save();

    return service.toObject();
  } catch (error) {
    if (error?.code === 11000) {
      throw ApiError.conflict(
        'A printing service with this slug already exists',
        'PRINTING_SERVICE_SLUG_EXISTS',
      );
    }

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| Soft Delete / Disable Service
|--------------------------------------------------------------------------
*/

async function deleteService(
  serviceId,
) {
  const service =
    await Printing.findOne({
      _id: serviceId,

      documentType:
        PRINTING_DOCUMENT_TYPES.SERVICE,
    });

  if (!service) {
    throw ApiError.notFound(
      'Printing service not found',
      'PRINTING_SERVICE_NOT_FOUND',
    );
  }

  service.isActive = false;

  await service.save();

  return {
    message:
      'Printing service disabled successfully',
  };
}

/*
|--------------------------------------------------------------------------
| Admin Requests
|--------------------------------------------------------------------------
*/

async function listAdminRequests({
  search,
  status,
  garmentSource,
  page = 1,
  limit = 20,
}) {
  const filter = {
    documentType:
      PRINTING_DOCUMENT_TYPES.REQUEST,
  };

  if (status) {
    filter.status = status;
  }

  if (garmentSource) {
    filter.garmentSource =
      garmentSource;
  }

  if (search) {
    const regex =
      new RegExp(
        escapeRegex(search),
        'i',
      );

    filter.$or = [
      {
        requestNumber:
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
        'customer.businessName':
          regex,
      },
      {
        'selection.serviceName':
          regex,
      },
      {
        garmentDetails:
          regex,
      },
      {
        colors:
          regex,
      },
    ];
  }

  const skip =
    (page - 1) * limit;

  const [requests, total] =
    await Promise.all([
      Printing.find(filter)
        .populate(
          'user',
          'name email phone',
        )
        .populate(
          'quote',
          'quoteNumber status pricing validUntil',
        )
        .populate(
          'order',
          'orderNumber orderType orderStatus paymentStatus pricing',
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Printing.countDocuments(filter),
    ]);

  return {
    requests,

    meta: buildPagination(
      page,
      limit,
      total,
    ),
  };
}

async function getAdminRequest(
  requestId,
) {
  const request =
    await Printing.findOne({
      _id: requestId,

      documentType:
        PRINTING_DOCUMENT_TYPES.REQUEST,
    })
      .populate(
        'user',
        'name email phone',
      )
      .populate(
        'reviewedBy',
        'name email',
      )
      .populate(
        'approvedBy',
        'name email',
      )
      .populate(
        'quote',
        'quoteNumber sourceType status pricing validUntil sentAt acceptedAt convertedAt',
      )
      .populate(
        'order',
        'orderNumber orderType orderStatus paymentStatus pricing shippingAddress',
      )
      .lean();

  if (!request) {
    throw ApiError.notFound(
      'Printing request not found',
      'PRINTING_REQUEST_NOT_FOUND',
    );
  }

  return request;
}

/*
|--------------------------------------------------------------------------
| Review Request
|--------------------------------------------------------------------------
*/

async function reviewRequest({
  requestId,
  adminUserId,
  adminNotes,
}) {
  const update = {
    status:
      PRINTING_REQUEST_STATUSES.UNDER_REVIEW,

    reviewedBy:
      adminUserId,

    reviewedAt:
      new Date(),
  };

  if (
    adminNotes !== undefined
  ) {
    update.adminNotes =
      adminNotes;
  }

  const request =
    await Printing.findOneAndUpdate(
      {
        _id: requestId,

        documentType:
          PRINTING_DOCUMENT_TYPES.REQUEST,

        status:
          PRINTING_REQUEST_STATUSES.PENDING,
      },
      {
        $set: update,
      },
      {
        new: true,
        runValidators: true,
      },
    ).lean();

  if (!request) {
    const exists =
      await Printing.exists({
        _id: requestId,

        documentType:
          PRINTING_DOCUMENT_TYPES.REQUEST,
      });

    if (!exists) {
      throw ApiError.notFound(
        'Printing request not found',
        'PRINTING_REQUEST_NOT_FOUND',
      );
    }

    throw ApiError.conflict(
      'Only pending printing requests can be moved under review',
      'PRINTING_REQUEST_NOT_REVIEWABLE',
    );
  }

  return request;
}

/*
|--------------------------------------------------------------------------
| Approve Request
|--------------------------------------------------------------------------
*/

async function approveRequest({
  requestId,
  adminUserId,
  adminNotes,
}) {
  const now =
    new Date();

  const update = {
    status:
      PRINTING_REQUEST_STATUSES.APPROVED,

    approvedBy:
      adminUserId,

    approvedAt:
      now,
  };

  if (
    adminNotes !== undefined
  ) {
    update.adminNotes =
      adminNotes;
  }

  const request =
    await Printing.findOneAndUpdate(
      {
        _id: requestId,

        documentType:
          PRINTING_DOCUMENT_TYPES.REQUEST,

        status: {
          $in: [
            PRINTING_REQUEST_STATUSES.PENDING,
            PRINTING_REQUEST_STATUSES.UNDER_REVIEW,
          ],
        },
      },
      {
        $set: update,

        $setOnInsert: {},
      },
      {
        new: true,
        runValidators: true,
      },
    );

  if (!request) {
    const exists =
      await Printing.exists({
        _id: requestId,

        documentType:
          PRINTING_DOCUMENT_TYPES.REQUEST,
      });

    if (!exists) {
      throw ApiError.notFound(
        'Printing request not found',
        'PRINTING_REQUEST_NOT_FOUND',
      );
    }

    throw ApiError.conflict(
      'Printing request cannot be approved from its current status',
      'PRINTING_REQUEST_NOT_APPROVABLE',
    );
  }

  /*
   * Preserve original reviewer when already reviewed.
   * If directly approved from pending, admin becomes reviewer too.
   */
  if (!request.reviewedBy) {
    request.reviewedBy =
      adminUserId;

    request.reviewedAt =
      now;

    await request.save();
  }

  return request.toObject();
}

/*
|--------------------------------------------------------------------------
| Reject Request
|--------------------------------------------------------------------------
*/

async function rejectRequest({
  requestId,
  adminUserId,
  adminNotes,
}) {
  const now =
    new Date();

  const request =
    await Printing.findOneAndUpdate(
      {
        _id: requestId,

        documentType:
          PRINTING_DOCUMENT_TYPES.REQUEST,

        status: {
          $in: [
            PRINTING_REQUEST_STATUSES.PENDING,
            PRINTING_REQUEST_STATUSES.UNDER_REVIEW,
          ],
        },
      },
      {
        $set: {
          status:
            PRINTING_REQUEST_STATUSES.REJECTED,

          reviewedBy:
            adminUserId,

          reviewedAt:
            now,

          rejectedAt:
            now,

          adminNotes,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    ).lean();

  if (!request) {
    const exists =
      await Printing.exists({
        _id: requestId,

        documentType:
          PRINTING_DOCUMENT_TYPES.REQUEST,
      });

    if (!exists) {
      throw ApiError.notFound(
        'Printing request not found',
        'PRINTING_REQUEST_NOT_FOUND',
      );
    }

    throw ApiError.conflict(
      'Printing request cannot be rejected from its current status',
      'PRINTING_REQUEST_NOT_REJECTABLE',
    );
  }

  return request;
}

module.exports = {
  listPublicServices,
  getPublicService,

  createRequest,
  listMyRequests,
  getMyRequest,

  createService,
  listAdminServices,
  getAdminService,
  updateService,
  deleteService,

  listAdminRequests,
  getAdminRequest,

  reviewRequest,
  approveRequest,
  rejectRequest,
};