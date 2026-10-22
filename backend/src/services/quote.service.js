'use strict';

const mongoose = require('mongoose');

const Quote = require('../models/Quote');
const Wholesale = require('../models/Wholesale');
const Manufacturing = require('../models/Manufacturing');
const Printing = require('../models/Printing');
const Order = require('../models/order.model');
const Sku = require('../models/Sku');
const adminNotificationEvents = require('./adminNotificationEvents.service');
const ApiError = require('../utils/ApiError');

const {
  QUOTE_STATUSES,
  QUOTE_SOURCE_TYPES,
} = require('../constants/Quote');

const {
  WHOLESALE_REQUEST_STATUSES,
} = require('../constants/Wholesale');

const {
  MANUFACTURING_DOCUMENT_TYPES,
  MANUFACTURING_REQUEST_STATUSES,
} = require('../constants/Manufacturing');

const {
  PRINTING_DOCUMENT_TYPES,
  PRINTING_REQUEST_STATUSES,
} = require('../constants/Printing');

const {
  nextQuoteNumber,
} = require('./quoteNumber.service');

const {
  generateOrderNumber,
} = require('./orderNumber.service');

const stockReservation =
  require('./stockReservation.service');

const stockNotification =
  require('./stockNotification.service');

const logger = require('../config/logger');

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function escapeRegex(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

function calculateQuotePricing({
  items,
  discount = 0,
  shipping = 0,
  additionalCharges = 0,
}) {
  const subtotal =
    items.reduce(
      (sum, item) =>
        sum + Number(item.lineTotal || 0),
      0,
    );

  if (discount > subtotal) {
    throw ApiError.badRequest(
      'Discount cannot exceed quote subtotal',
      'INVALID_QUOTE_DISCOUNT',
    );
  }

  const total =
    subtotal -
    discount +
    shipping +
    additionalCharges;

  if (total < 0) {
    throw ApiError.badRequest(
      'Quote total cannot be negative',
      'INVALID_QUOTE_TOTAL',
    );
  }

  return {
    subtotal,
    discount,
    shipping,
    additionalCharges,
    total,
  };
}

function calculateVolume(items) {
  return items.reduce(
    (total, item) =>
      total + Number(item.quantity || 0),
    0,
  );
}

function isQuoteExpired(quote) {
  return Boolean(
    quote.validUntil &&
      new Date(quote.validUntil).getTime() <
        Date.now(),
  );
}

/*
 * When a quote can no longer be accepted (expired / rejected) its source
 * request must not stay stuck in "quoted": move it back to "approved" so the
 * admin can issue a replacement quote. Runs inside the caller's transaction.
 */
async function reopenSourceRequest(quote, session) {
  let Model;
  let id;
  let documentType;
  let fromStatus;
  let toStatus;

  if (quote.sourceType === QUOTE_SOURCE_TYPES.WHOLESALE) {
    Model = Wholesale;
    id = quote.wholesaleRequest;
    documentType = 'request';
    fromStatus = WHOLESALE_REQUEST_STATUSES.QUOTED;
    toStatus = WHOLESALE_REQUEST_STATUSES.APPROVED;
  } else if (quote.sourceType === QUOTE_SOURCE_TYPES.MANUFACTURING) {
    Model = Manufacturing;
    id = quote.manufacturingRequest;
    documentType = MANUFACTURING_DOCUMENT_TYPES.REQUEST;
    fromStatus = MANUFACTURING_REQUEST_STATUSES.QUOTED;
    toStatus = MANUFACTURING_REQUEST_STATUSES.APPROVED;
  } else if (quote.sourceType === QUOTE_SOURCE_TYPES.PRINTING) {
    Model = Printing;
    id = quote.printingRequest;
    documentType = PRINTING_DOCUMENT_TYPES.REQUEST;
    fromStatus = PRINTING_REQUEST_STATUSES.QUOTED;
    toStatus = PRINTING_REQUEST_STATUSES.APPROVED;
  } else {
    return;
  }

  if (!id) {
    return;
  }

  await Model.updateOne(
    { _id: id, documentType, status: fromStatus },
    { $set: { status: toStatus, quote: null } },
    { session },
  );
}

async function markQuoteExpired(quoteId) {
  const session = await mongoose.startSession();

  try {
    let result = null;

    await session.withTransaction(async () => {
      const now = new Date();

      const expired = await Quote.findOneAndUpdate(
        {
          _id: quoteId,
          status: {
            $in: [
              QUOTE_STATUSES.DRAFT,
              QUOTE_STATUSES.SENT,
            ],
          },
          validUntil: {
            $ne: null,
            $lt: now,
          },
        },
        {
          $set: {
            status: QUOTE_STATUSES.EXPIRED,
            expiredAt: now,
          },
          $push: {
            auditTrail: {
              action: 'Quote Expired',
              note: 'Quotation validity period expired',
              actorType: 'system',
              createdAt: now,
            },
          },
        },
        { new: true, session },
      );

      if (expired) {
        await reopenSourceRequest(expired, session);
      }

      result = expired ? expired.toObject() : null;
    });

    return result;
  } finally {
    await session.endSession();
  }
}

function addComputedFields(quote) {
  if (!quote) return quote;

  return {
    ...quote,

    volume:
      calculateVolume(
        quote.items || [],
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Source Synchronization
|--------------------------------------------------------------------------
*/

async function syncSourceOnQuoteSent(
  quote,
  session,
) {
  const now = new Date();

  if (
    quote.sourceType ===
    QUOTE_SOURCE_TYPES.WHOLESALE
  ) {
    await Wholesale.updateOne(
      {
        _id: quote.wholesaleRequest,
        documentType: 'request',
        status:
          WHOLESALE_REQUEST_STATUSES.APPROVED,
      },
      {
        $set: {
          status:
            WHOLESALE_REQUEST_STATUSES.QUOTED,
          quotedAt: now,
          quote: quote._id,
        },
      },
      { session },
    );

    return;
  }

  if (
    quote.sourceType ===
    QUOTE_SOURCE_TYPES.MANUFACTURING
  ) {
    await Manufacturing.updateOne(
      {
        _id:
          quote.manufacturingRequest,

        documentType:
          MANUFACTURING_DOCUMENT_TYPES.REQUEST,

        status:
          MANUFACTURING_REQUEST_STATUSES.APPROVED,
      },
      {
        $set: {
          status:
            MANUFACTURING_REQUEST_STATUSES.QUOTED,

          quotedAt: now,
          quote: quote._id,
        },
      },
      { session },
    );

    return;
  }

  if (
    quote.sourceType ===
    QUOTE_SOURCE_TYPES.PRINTING
  ) {
    await Printing.updateOne(
      {
        _id: quote.printingRequest,

        documentType:
          PRINTING_DOCUMENT_TYPES.REQUEST,

        status:
          PRINTING_REQUEST_STATUSES.APPROVED,
      },
      {
        $set: {
          status:
            PRINTING_REQUEST_STATUSES.QUOTED,

          quotedAt: now,
          quote: quote._id,
        },
      },
      { session },
    );
  }
}

async function syncSourceOnAccepted(
  quote,
  session,
) {
  const now = new Date();

  if (
    quote.sourceType ===
    QUOTE_SOURCE_TYPES.WHOLESALE
  ) {
    await Wholesale.updateOne(
      {
        _id: quote.wholesaleRequest,
        documentType: 'request',
      },
      {
        $set: {
          status:
            WHOLESALE_REQUEST_STATUSES.ACCEPTED,
          acceptedAt: now,
          quote: quote._id,
        },
      },
      { session },
    );

    return;
  }

  if (
    quote.sourceType ===
    QUOTE_SOURCE_TYPES.MANUFACTURING
  ) {
    await Manufacturing.updateOne(
      {
        _id:
          quote.manufacturingRequest,

        documentType:
          MANUFACTURING_DOCUMENT_TYPES.REQUEST,
      },
      {
        $set: {
          status:
            MANUFACTURING_REQUEST_STATUSES.ACCEPTED,
          acceptedAt: now,
          quote: quote._id,
        },
      },
      { session },
    );

    return;
  }

  if (
    quote.sourceType ===
    QUOTE_SOURCE_TYPES.PRINTING
  ) {
    await Printing.updateOne(
      {
        _id: quote.printingRequest,

        documentType:
          PRINTING_DOCUMENT_TYPES.REQUEST,
      },
      {
        $set: {
          status:
            PRINTING_REQUEST_STATUSES.ACCEPTED,
          acceptedAt: now,
          quote: quote._id,
        },
      },
      { session },
    );
  }
}

/*
|--------------------------------------------------------------------------
| Create Wholesale Quote
|--------------------------------------------------------------------------
*/

async function createWholesaleQuote({
  wholesaleRequestId,
  adminUserId,
  discount = 0,
  shipping = 0,
  additionalCharges = 0,
  validUntil,
  adminNotes,
  terms,
}) {
  const session =
    await mongoose.startSession();

  try {
    let quoteId;

    await session.withTransaction(
      async () => {
        const request =
          await Wholesale.findOne({
            _id: wholesaleRequestId,
            documentType: 'request',
          }).session(session);

        if (!request) {
          throw ApiError.notFound(
            'Wholesale request not found',
            'WHOLESALE_REQUEST_NOT_FOUND',
          );
        }

        if (
          request.status !==
          WHOLESALE_REQUEST_STATUSES.APPROVED
        ) {
          throw ApiError.conflict(
            'Wholesale request must be approved before creating a quote',
            'WHOLESALE_REQUEST_NOT_APPROVED',
          );
        }

        const existing =
          await Quote.exists({
            wholesaleRequest:
              request._id,
          }).session(session);

        if (existing) {
          throw ApiError.conflict(
            'A quote already exists for this wholesale request',
            'WHOLESALE_QUOTE_ALREADY_EXISTS',
          );
        }

        const items =
          request.items.map(
            (item) => ({
              product: item.product,
              variant: item.variant,
              sku: item.sku,

              productName:
                item.productName,

              colorName:
                item.colorName,

              size: item.size,

              skuCode:
                item.skuCode,

              unitPrice:
                item.wholesalePrice,

              quantity:
                item.quantity,

              lineTotal:
                item.wholesalePrice *
                item.quantity,
            }),
          );

        const pricing =
          calculateQuotePricing({
            items,
            discount,
            shipping,
            additionalCharges,
          });

        const quoteNumber =
          await nextQuoteNumber(
            session,
          );

        const [quote] =
          await Quote.create(
            [
              {
                quoteNumber,

                sourceType:
                  QUOTE_SOURCE_TYPES.WHOLESALE,

                wholesaleRequest:
                  request._id,

                manufacturingRequest:
                  null,

                printingRequest:
                  null,

                user:
                  request.user,

                customer:
                  request.customer,

                items,
                pricing,

                status:
                  QUOTE_STATUSES.DRAFT,

                validUntil:
                  validUntil || null,

                adminNotes,
                terms,

                createdBy:
                  adminUserId,

                auditTrail: [
                  {
                    action:
                      'Quote Formulated',

                    note:
                      'Wholesale quotation created',

                    actor:
                      adminUserId,

                    actorType:
                      'admin',
                  },
                ],
              },
            ],
            { session },
          );

        request.quote =
          quote._id;

        await request.save({
          session,
        });

        quoteId =
          quote._id;
      },
    );

    return addComputedFields(
      await Quote.findById(
        quoteId,
      ).lean(),
    );
  } catch (error) {
    if (
      error?.code === 11000 &&
      error?.keyPattern?.wholesaleRequest
    ) {
      throw ApiError.conflict(
        'A quote already exists for this wholesale request',
        'WHOLESALE_QUOTE_ALREADY_EXISTS',
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

/*
|--------------------------------------------------------------------------
| Manufacturing Quote
|--------------------------------------------------------------------------
*/

async function createManufacturingQuote({
  manufacturingRequestId,
  unitPrice,
  adminUserId,
  discount = 0,
  shipping = 0,
  additionalCharges = 0,
  validUntil,
  adminNotes,
  terms,
}) {
  const session =
    await mongoose.startSession();

  try {
    let quoteId;

    await session.withTransaction(
      async () => {
        const request =
          await Manufacturing.findOne({
            _id:
              manufacturingRequestId,

            documentType:
              MANUFACTURING_DOCUMENT_TYPES.REQUEST,
          }).session(session);

        if (!request) {
          throw ApiError.notFound(
            'Manufacturing request not found',
            'MANUFACTURING_REQUEST_NOT_FOUND',
          );
        }

        if (
          request.status !==
          MANUFACTURING_REQUEST_STATUSES.APPROVED
        ) {
          throw ApiError.conflict(
            'Manufacturing request must be approved before creating a quote',
            'MANUFACTURING_REQUEST_NOT_APPROVED',
          );
        }

        const existing =
          await Quote.exists({
            manufacturingRequest:
              request._id,
          }).session(session);

        if (existing) {
          throw ApiError.conflict(
            'A quote already exists for this manufacturing request',
            'MANUFACTURING_QUOTE_ALREADY_EXISTS',
          );
        }

        const lineTotal =
          unitPrice *
          request.quantity;

        const items = [
          {
            manufacturingCategory:
              request.selection?.category,

            manufacturingStyle:
              request.selection?.style,

            manufacturingVariant:
              request.selection?.variant ||
              null,

            productName:
              request.selection?.styleName ||
              'Manufacturing Request',

            colorName:
              request.selection?.colorName,

            description:
              request.requirements,

            manufacturingCategoryName:
              request.selection?.categoryName,

            manufacturingStyleName:
              request.selection?.styleName,

            manufacturingVariantName:
              request.selection?.variantName,

            manufacturingVariantCode:
              request.selection?.variantCode,

            unitPrice,
            quantity:
              request.quantity,

            lineTotal,
          },
        ];

        const pricing =
          calculateQuotePricing({
            items,
            discount,
            shipping,
            additionalCharges,
          });

        const quoteNumber =
          await nextQuoteNumber(
            session,
          );

        const [quote] =
          await Quote.create(
            [
              {
                quoteNumber,

                sourceType:
                  QUOTE_SOURCE_TYPES.MANUFACTURING,

                manufacturingRequest:
                  request._id,

                wholesaleRequest:
                  null,

                printingRequest:
                  null,

                user:
                  request.user,

                customer:
                  request.customer,

                items,
                pricing,

                status:
                  QUOTE_STATUSES.DRAFT,

                validUntil:
                  validUntil || null,

                adminNotes,
                terms,

                createdBy:
                  adminUserId,

                auditTrail: [
                  {
                    action:
                      'Quote Formulated',

                    note:
                      'Manufacturing quotation created',

                    actor:
                      adminUserId,

                    actorType:
                      'admin',
                  },
                ],
              },
            ],
            { session },
          );

        request.quote =
          quote._id;

        await request.save({
          session,
        });

        quoteId =
          quote._id;
      },
    );

    return addComputedFields(
      await Quote.findById(
        quoteId,
      ).lean(),
    );
  } catch (error) {
    if (
      error?.code === 11000 &&
      error?.keyPattern
        ?.manufacturingRequest
    ) {
      throw ApiError.conflict(
        'A quote already exists for this manufacturing request',
        'MANUFACTURING_QUOTE_ALREADY_EXISTS',
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

/*
|--------------------------------------------------------------------------
| Printing Quote
|--------------------------------------------------------------------------
*/

async function createPrintingQuote({
  printingRequestId,
  unitPrice,
  adminUserId,
  discount = 0,
  shipping = 0,
  additionalCharges = 0,
  validUntil,
  adminNotes,
  terms,
}) {
  const session =
    await mongoose.startSession();

  try {
    let quoteId;

    await session.withTransaction(
      async () => {
        const request =
          await Printing.findOne({
            _id:
              printingRequestId,

            documentType:
              PRINTING_DOCUMENT_TYPES.REQUEST,
          }).session(session);

        if (!request) {
          throw ApiError.notFound(
            'Printing request not found',
            'PRINTING_REQUEST_NOT_FOUND',
          );
        }

        if (
          request.status !==
          PRINTING_REQUEST_STATUSES.APPROVED
        ) {
          throw ApiError.conflict(
            'Printing request must be approved before creating a quote',
            'PRINTING_REQUEST_NOT_APPROVED',
          );
        }

        const existing =
          await Quote.exists({
            printingRequest:
              request._id,
          }).session(session);

        if (existing) {
          throw ApiError.conflict(
            'A quote already exists for this printing request',
            'PRINTING_QUOTE_ALREADY_EXISTS',
          );
        }

        const lineTotal =
          unitPrice *
          request.quantity;

        const items = [
          {
            productName:
              request.selection?.name ||
              request.selection?.serviceName ||
              'Printing & Branding',

            printingServiceName:
              request.selection?.name ||
              request.selection?.serviceName,

            printingServiceSlug:
              request.selection?.slug,

            printingRequirements:
              request.requirements,

            description:
              request.requirements,

            unitPrice,

            quantity:
              request.quantity,

            lineTotal,
          },
        ];

        const pricing =
          calculateQuotePricing({
            items,
            discount,
            shipping,
            additionalCharges,
          });

        const quoteNumber =
          await nextQuoteNumber(
            session,
          );

        const [quote] =
          await Quote.create(
            [
              {
                quoteNumber,

                sourceType:
                  QUOTE_SOURCE_TYPES.PRINTING,

                printingRequest:
                  request._id,

                wholesaleRequest:
                  null,

                manufacturingRequest:
                  null,

                user:
                  request.user,

                customer:
                  request.customer,

                items,
                pricing,

                status:
                  QUOTE_STATUSES.DRAFT,

                validUntil:
                  validUntil || null,

                adminNotes,
                terms,

                createdBy:
                  adminUserId,

                auditTrail: [
                  {
                    action:
                      'Quote Formulated',

                    note:
                      'Printing & Branding quotation created',

                    actor:
                      adminUserId,

                    actorType:
                      'admin',
                  },
                ],
              },
            ],
            { session },
          );

        request.quote =
          quote._id;

        await request.save({
          session,
        });

        quoteId =
          quote._id;
      },
    );

    return addComputedFields(
      await Quote.findById(
        quoteId,
      ).lean(),
    );
  } catch (error) {
    if (
      error?.code === 11000 &&
      error?.keyPattern
        ?.printingRequest
    ) {
      throw ApiError.conflict(
        'A quote already exists for this printing request',
        'PRINTING_QUOTE_ALREADY_EXISTS',
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

/*
|--------------------------------------------------------------------------
| Admin Stats
|--------------------------------------------------------------------------
*/

async function getQuoteStats() {
  const [
    totalFormulated,
    activeProposals,
    convertedOrders,
    pipeline,
  ] = await Promise.all([
    Quote.countDocuments(),

    Quote.countDocuments({
      status: {
        $in: [
          QUOTE_STATUSES.SENT,
          QUOTE_STATUSES.ACCEPTED,
        ],
      },
    }),

    Quote.countDocuments({
      status:
        QUOTE_STATUSES.CONVERTED_TO_ORDER,
    }),

    Quote.aggregate([
      {
        $match: {
          status: {
            $in: [
              QUOTE_STATUSES.DRAFT,
              QUOTE_STATUSES.SENT,
              QUOTE_STATUSES.ACCEPTED,
            ],
          },
        },
      },

      {
        $group: {
          _id: null,

          value: {
            $sum:
              '$pricing.total',
          },
        },
      },
    ]),
  ]);

  return {
    totalFormulated,
    activeProposals,
    convertedOrders,

    pipelineValue:
      pipeline[0]?.value || 0,
  };
}

/*
|--------------------------------------------------------------------------
| Admin List
|--------------------------------------------------------------------------
*/

async function listAdminQuotes({
  search,
  status,
  sourceType,
  page = 1,
  limit = 10,
}) {
  const filter = {};

  if (status) {
    filter.status =
      status;
  }

  if (sourceType) {
    filter.sourceType =
      sourceType;
  }

  if (search) {
    const regex =
      new RegExp(
        escapeRegex(search),
        'i',
      );

    filter.$or = [
      { quoteNumber: regex },
      { 'customer.name': regex },
      { 'customer.businessName': regex },
      { 'customer.email': regex },
      { 'customer.phone': regex },
    ];
  }

  const skip =
    (page - 1) * limit;

  const [
    quotes,
    total,
    stats,
  ] = await Promise.all([
    Quote.find(filter)
      .populate(
        'wholesaleRequest',
        'requestNumber status',
      )
      .populate(
        'manufacturingRequest',
        'requestNumber status',
      )
      .populate(
        'printingRequest',
        'requestNumber status',
      )
      .populate(
        'order',
        'orderNumber orderStatus paymentStatus',
      )
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    Quote.countDocuments(filter),

    getQuoteStats(),
  ]);

  return {
    quotes:
      quotes.map(
        addComputedFields,
      ),

    meta: {
      page,
      limit,
      total,
      pages:
        Math.ceil(total / limit),
    },

    stats,
  };
}

/*
|--------------------------------------------------------------------------
| Admin Detail
|--------------------------------------------------------------------------
*/

async function getAdminQuote(
  quoteId,
) {
  let quote =
    await Quote.findById(
      quoteId,
    )
      .populate(
        'wholesaleRequest',
        'requestNumber status',
      )
      .populate(
        'manufacturingRequest',
        'requestNumber status',
      )
      .populate(
        'printingRequest',
        'requestNumber status',
      )
      .populate(
        'order',
        'orderNumber orderStatus paymentStatus',
      )
      .populate(
        'createdBy',
        'name email',
      )
      .populate(
        'sentBy',
        'name email',
      )
      .populate(
        'auditTrail.actor',
        'name email',
      )
      .lean();

  if (!quote) {
    throw ApiError.notFound(
      'Quote not found',
      'QUOTE_NOT_FOUND',
    );
  }

  if (
    isQuoteExpired(quote) &&
    [
      QUOTE_STATUSES.DRAFT,
      QUOTE_STATUSES.SENT,
    ].includes(quote.status)
  ) {
    await markQuoteExpired(
      quote._id,
    );

    quote =
      await Quote.findById(
        quote._id,
      )
        .populate(
          'order',
          'orderNumber orderStatus paymentStatus',
        )
        .populate(
          'auditTrail.actor',
          'name email',
        )
        .lean();
  }

  return addComputedFields(
    quote,
  );
}

/*
|--------------------------------------------------------------------------
| Update Draft
|--------------------------------------------------------------------------
*/

async function updateDraftQuote({
  quoteId,
  data,
}) {
  const quote =
    await Quote.findById(
      quoteId,
    );

  if (!quote) {
    throw ApiError.notFound(
      'Quote not found',
      'QUOTE_NOT_FOUND',
    );
  }

  if (
    quote.status !==
    QUOTE_STATUSES.DRAFT
  ) {
    throw ApiError.conflict(
      'Only draft quotes can be updated',
      'QUOTE_NOT_DRAFT',
    );
  }

  if (isQuoteExpired(quote)) {
    await markQuoteExpired(
      quote._id,
    );

    throw ApiError.conflict(
      'Quote has expired',
      'QUOTE_EXPIRED',
    );
  }

  const discount =
    data.discount ??
    quote.pricing.discount;

  const shipping =
    data.shipping ??
    quote.pricing.shipping;

  const additionalCharges =
    data.additionalCharges ??
    quote.pricing.additionalCharges;

  quote.pricing =
    calculateQuotePricing({
      items: quote.items,
      discount,
      shipping,
      additionalCharges,
    });

  if (
    data.validUntil !==
    undefined
  ) {
    quote.validUntil =
      data.validUntil;
  }

  if (
    data.adminNotes !==
    undefined
  ) {
    quote.adminNotes =
      data.adminNotes;
  }

  if (
    data.terms !==
    undefined
  ) {
    quote.terms =
      data.terms;
  }

  quote.auditTrail.push({
    action:
      'Quote Updated',

    note:
      'Draft quotation commercial terms updated',

    actorType:
      'admin',
  });

  await quote.save();

  return addComputedFields(
    quote.toObject(),
  );
}

/*
|--------------------------------------------------------------------------
| Send
|--------------------------------------------------------------------------
*/

async function sendQuote({
  quoteId,
  adminUserId,
}) {
  const session =
    await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(
      async () => {
        const quote =
          await Quote.findById(
            quoteId,
          ).session(session);

        if (!quote) {
          throw ApiError.notFound(
            'Quote not found',
            'QUOTE_NOT_FOUND',
          );
        }

        if (
          quote.status !==
          QUOTE_STATUSES.DRAFT
        ) {
          throw ApiError.conflict(
            'Only draft quotes can be sent',
            'QUOTE_NOT_DRAFT',
          );
        }

        if (
          quote.validUntil &&
          isQuoteExpired(quote)
        ) {
          throw ApiError.conflict(
            'Cannot send an expired quote',
            'QUOTE_EXPIRED',
          );
        }

        const now =
          new Date();

        quote.status =
          QUOTE_STATUSES.SENT;

        quote.sentBy =
          adminUserId;

        quote.sentAt =
          now;

        quote.auditTrail.push({
          action:
            'Quote Dispatched to Client',

          note:
            'Official quotation sent to customer',

          actor:
            adminUserId,

          actorType:
            'admin',

          createdAt:
            now,
        });

        await quote.save({
          session,
        });

        await syncSourceOnQuoteSent(
          quote,
          session,
        );

        result =
          quote.toObject();
      },
    );

    return addComputedFields(
      result,
    );
  } finally {
    await session.endSession();
  }
}

/*
|--------------------------------------------------------------------------
| Customer List
|--------------------------------------------------------------------------
*/

async function listMyQuotes({
  userId,
  status,
  page = 1,
  limit = 20,
}) {
  const filter = {
    user: userId,

    status: status
      ? status
      : {
          $ne:
            QUOTE_STATUSES.DRAFT,
        },
  };

  /*
   * Customer must never access drafts.
   */
  if (
    status ===
    QUOTE_STATUSES.DRAFT
  ) {
    filter.status = {
      $ne:
        QUOTE_STATUSES.DRAFT,
    };
  }

  const skip =
    (page - 1) * limit;

  const [quotes, total] =
    await Promise.all([
      Quote.find(filter)
        .populate(
          'order',
          'orderNumber orderStatus paymentStatus',
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Quote.countDocuments(
        filter,
      ),
    ]);

  return {
    quotes:
      quotes.map(
        addComputedFields,
      ),

    meta: {
      page,
      limit,
      total,
      pages:
        Math.ceil(total / limit),
    },
  };
}

/*
|--------------------------------------------------------------------------
| Customer Detail
|--------------------------------------------------------------------------
*/

async function getMyQuote({
  quoteId,
  userId,
}) {
  let quote =
    await Quote.findOne({
      _id: quoteId,
      user: userId,

      status: {
        $ne:
          QUOTE_STATUSES.DRAFT,
      },
    })
      .populate(
        'order',
        'orderNumber orderStatus paymentStatus',
      )
      .lean();

  if (!quote) {
    throw ApiError.notFound(
      'Quote not found',
      'QUOTE_NOT_FOUND',
    );
  }

  if (
    isQuoteExpired(quote) &&
    quote.status ===
      QUOTE_STATUSES.SENT
  ) {
    await markQuoteExpired(
      quote._id,
    );

    quote =
      await Quote.findById(
        quote._id,
      ).lean();
  }

  return addComputedFields(
    quote,
  );
}

/*
|--------------------------------------------------------------------------
| Customer Accept
|--------------------------------------------------------------------------
*/
async function acceptQuote({
  quoteId,
  userId,
}) {
  /*
  |--------------------------------------------------------------------------
  | Find Customer Quote
  |--------------------------------------------------------------------------
  */

  const existing =
    await Quote.findOne({
      _id: quoteId,
      user: userId,
    }).lean();

  if (!existing) {
    throw ApiError.notFound(
      'Quote not found',
      'QUOTE_NOT_FOUND',
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Idempotent Accept
  |--------------------------------------------------------------------------
  |
  | Quote pehle hi ACCEPTED hai to simply existing result return karenge.
  |
  | IMPORTANT:
  | QUOTE_ACCEPTED notification dobara trigger nahi hogi.
  |--------------------------------------------------------------------------
  */

  if (
    existing.status ===
    QUOTE_STATUSES.ACCEPTED
  ) {
    return addComputedFields(
      existing,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Only SENT Quote Can Be Accepted
  |--------------------------------------------------------------------------
  */

  if (
    existing.status !==
    QUOTE_STATUSES.SENT
  ) {
    throw ApiError.conflict(
      'Quote cannot be accepted in its current status',
      'QUOTE_NOT_ACCEPTABLE',
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Expiry Check
  |--------------------------------------------------------------------------
  */

  if (
    isQuoteExpired(existing)
  ) {
    await markQuoteExpired(
      existing._id,
    );

    throw ApiError.conflict(
      'Quote has expired',
      'QUOTE_EXPIRED',
    );
  }

  const session =
    await mongoose.startSession();

  try {
    let result;

    /*
    |--------------------------------------------------------------------------
    | Accept Quote Transaction
    |--------------------------------------------------------------------------
    */

    await session.withTransaction(
      async () => {
        const now =
          new Date();

        /*
        |--------------------------------------------------------------------------
        | Atomic SENT -> ACCEPTED Transition
        |--------------------------------------------------------------------------
        */

        const quote =
          await Quote.findOneAndUpdate(
            {
              _id: quoteId,
              user: userId,

              status:
                QUOTE_STATUSES.SENT,
            },
            {
              $set: {
                status:
                  QUOTE_STATUSES.ACCEPTED,

                acceptedAt:
                  now,
              },

              $push: {
                auditTrail: {
                  action:
                    'Quote Accepted by Customer',

                  note:
                    'Customer accepted the quotation',

                  actor:
                    userId,

                  actorType:
                    'customer',

                  createdAt:
                    now,
                },
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        /*
        |--------------------------------------------------------------------------
        | Concurrency Protection
        |--------------------------------------------------------------------------
        |
        | Agar doosri request ne same quote ka state pehle change kar diya ho,
        | atomic update fail hoga.
        |--------------------------------------------------------------------------
        */

        if (!quote) {
          throw ApiError.conflict(
            'Quote state changed before acceptance',
            'QUOTE_ACCEPT_CONFLICT',
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Sync Source Request
        |--------------------------------------------------------------------------
        |
        | Wholesale / Manufacturing / Printing source ko ACCEPTED state ke
        | saath sync karte hain.
        |--------------------------------------------------------------------------
        */

        await syncSourceOnAccepted(
          quote,
          session,
        );

        result =
          quote.toObject();
      },
    );

    /*
    |--------------------------------------------------------------------------
    | Post-Commit QUOTE_ACCEPTED Notification
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | Notification MongoDB transaction ke andar nahi bheji ja rahi.
    |
    | Flow:
    |
    | SENT Quote
    |      ↓
    | Customer Accept
    |      ↓
    | Quote -> ACCEPTED
    |      ↓
    | Source Request Sync
    |      ↓
    | MongoDB COMMIT
    |      ↓
    | QUOTE_ACCEPTED
    |      ↓
    | Admin Bell + FCM
    |
    | Already ACCEPTED quote ke idempotent retry par ye block execute
    | nahi hota.
    |--------------------------------------------------------------------------
    */

    if (result) {
      await adminNotificationEvents
        .quoteAccepted(
          result,
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Return Quote With Computed Fields
    |--------------------------------------------------------------------------
    */

    return addComputedFields(
      result,
    );
  } finally {
    await session.endSession();
  }
}

/*
|--------------------------------------------------------------------------
| Customer Reject
|--------------------------------------------------------------------------
*/

async function rejectQuote({
  quoteId,
  userId,
  customerNotes,
}) {
  /*
  |--------------------------------------------------------------------------
  | Find Customer Quote
  |--------------------------------------------------------------------------
  */

  const existing =
    await Quote.findOne({
      _id: quoteId,
      user: userId,
    }).lean();

  if (!existing) {
    throw ApiError.notFound(
      'Quote not found',
      'QUOTE_NOT_FOUND',
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Idempotent Rejection
  |--------------------------------------------------------------------------
  |
  | Quote already REJECTED hai to existing quote return karo.
  | QUOTE_REJECTED notification dobara fire nahi hogi.
  |--------------------------------------------------------------------------
  */

  if (
    existing.status ===
    QUOTE_STATUSES.REJECTED
  ) {
    return addComputedFields(
      existing,
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Only SENT Quote Can Be Rejected
  |--------------------------------------------------------------------------
  */

  if (
    existing.status !==
    QUOTE_STATUSES.SENT
  ) {
    throw ApiError.conflict(
      'Quote cannot be rejected in its current status',
      'QUOTE_NOT_REJECTABLE',
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Expiry Check
  |--------------------------------------------------------------------------
  */

  if (
    isQuoteExpired(existing)
  ) {
    await markQuoteExpired(
      existing._id,
    );

    throw ApiError.conflict(
      'Quote has expired',
      'QUOTE_EXPIRED',
    );
  }

  const now =
    new Date();

  /*
  |--------------------------------------------------------------------------
  | Atomic SENT -> REJECTED Transition
  |--------------------------------------------------------------------------
  */

  /*
   * Rejection and the source-request reset commit together, so a rejected
   * quote can never leave its request stuck in "quoted".
   */
  let quote = null;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
    quote = await Quote.findOneAndUpdate(
      {
        _id: quoteId,
        user: userId,

        status:
          QUOTE_STATUSES.SENT,
      },
      {
        $set: {
          status:
            QUOTE_STATUSES.REJECTED,

          rejectedAt:
            now,

          ...(customerNotes !==
          undefined
            ? {
                customerNotes,
              }
            : {}),
        },

        $push: {
          auditTrail: {
            action:
              'Quote Rejected by Customer',

            note:
              customerNotes ||
              'Customer rejected the quotation',

            actor:
              userId,

            actorType:
              'customer',

            createdAt:
              now,
          },
        },
      },
      {
        new: true,
        runValidators: true,
        session,
      },
);

      if (quote) {
        await reopenSourceRequest(quote, session);
      }
    });
  } finally {
    await session.endSession();
  }

  /*
  |--------------------------------------------------------------------------
  | Concurrency Protection
  |--------------------------------------------------------------------------
  |
  | Agar quote ka status parallel request ne change kar diya ho,
  | atomic SENT filter match nahi karega.
  |--------------------------------------------------------------------------
  */

  if (!quote) {
    throw ApiError.conflict(
      'Quote state changed before rejection',
      'QUOTE_REJECT_CONFLICT',
    );
  }

  /*
  |--------------------------------------------------------------------------
  | QUOTE_REJECTED Admin Notification
  |--------------------------------------------------------------------------
  |
  | Ye sirf successful SENT -> REJECTED transition ke baad chalegi.
  |
  | Flow:
  |
  | SENT
  |   ↓
  | Customer Reject
  |   ↓
  | REJECTED persisted
  |   ↓
  | QUOTE_REJECTED
  |   ↓
  | Admin Bell + FCM
  |
  | Already REJECTED retry:
  |   → upar idempotent branch se return
  |   → notification dobara nahi
  |--------------------------------------------------------------------------
  */

  await adminNotificationEvents
    .quoteRejected(
      quote,
    );

  /*
  |--------------------------------------------------------------------------
  | Return Quote
  |--------------------------------------------------------------------------
  */

  return addComputedFields(
    quote.toObject(),
  );
}

/*
|--------------------------------------------------------------------------
| Convert Accepted Quote To Order
|--------------------------------------------------------------------------
*/

async function convertQuoteToOrder({
  quoteId,
  adminUserId,
  shippingAddress,
}) {
  const existing =
    await Quote.findById(
      quoteId,
    ).lean();

  if (!existing) {
    throw ApiError.notFound(
      'Quote not found',
      'QUOTE_NOT_FOUND',
    );
  }

  /*
   * Idempotency.
   */
  if (
    existing.status ===
      QUOTE_STATUSES.CONVERTED_TO_ORDER &&
    existing.order
  ) {
    return Order.findById(
      existing.order,
    ).lean();
  }

  if (
    existing.status !==
    QUOTE_STATUSES.ACCEPTED
  ) {
    throw ApiError.conflict(
      'Only accepted quotes can be converted to an order',
      'QUOTE_NOT_ACCEPTED',
    );
  }

  const session =
    await mongoose.startSession();

  try {
    let orderId;

    await session.withTransaction(
      async () => {
        const quote =
          await Quote.findOne({
            _id: quoteId,

            status:
              QUOTE_STATUSES.ACCEPTED,

            order: null,
          }).session(session);

        if (!quote) {
          throw ApiError.conflict(
            'Quote is already being converted or has already been converted',
            'QUOTE_CONVERSION_CONFLICT',
          );
        }

        let orderType;

        if (
          quote.sourceType ===
          QUOTE_SOURCE_TYPES.WHOLESALE
        ) {
          orderType =
            'wholesale';
        } else if (
          quote.sourceType ===
          QUOTE_SOURCE_TYPES.MANUFACTURING
        ) {
          orderType =
            'manufacturing';
        } else if (
          quote.sourceType ===
          QUOTE_SOURCE_TYPES.PRINTING
        ) {
          orderType =
            'printing';
        } else {
          throw ApiError.conflict(
            'Unsupported quote source',
            'UNSUPPORTED_QUOTE_SOURCE',
          );
        }

        /*
         * Copy the complete item snapshot (wholesale SKU fields,
         * manufacturing / printing snapshots). Fields the Order item schema
         * does not know are dropped by Mongoose strict mode.
         * The Quote stores the price as unitPrice, which is also the Order
         * item's field name.
         */
        const orderItems =
          quote.items.map((item) => {
            const plain =
              typeof item.toObject === 'function'
                ? item.toObject()
                : { ...item };

            delete plain._id;

            return plain;
          });

        /*
         * Wholesale orders reserve real SKU inventory at conversion.
         * Reserve in a stable SKU order (deadlock-friendly).
         * Notifications are sent after commit.
         */
        const attemptStockTransitions = [];

        if (
          quote.sourceType ===
          QUOTE_SOURCE_TYPES.WHOLESALE
        ) {
          const lines = new Map();

          for (const item of quote.items) {
            if (!item.sku) {
              throw ApiError.conflict(
                'Wholesale quote contains an invalid SKU',
                'INVALID_WHOLESALE_QUOTE_SKU',
              );
            }

            const key = String(item.sku);
            lines.set(
              key,
              (lines.get(key) || 0) +
                Number(item.quantity),
            );
          }

          for (const [skuId, quantity] of [
            ...lines.entries(),
          ].sort(([x], [y]) =>
            x.localeCompare(y),
          )) {
            const reservation =
              await stockReservation.reserveSku(
                skuId,
                quantity,
                session,
              );

            if (
              reservation?.stockTransition
                ?.before &&
              reservation?.stockTransition
                ?.after
            ) {
              attemptStockTransitions.push(
                reservation.stockTransition,
              );
            }
          }
        }

        const orderNumber =
          await generateOrderNumber({
            session,
          });

        const [order] =
          await Order.create(
            [
              {
                orderNumber,

                user:
                  quote.user,

                customer: {
                  name:
                    quote.customer.name,

                  email:
                    quote.customer.email,

                  phone:
                    quote.customer.phone,
                },

                orderType,

                items:
                  orderItems,

                shippingAddress,

                pricing: {
                  subtotal:
                    quote.pricing.subtotal,

                  discount:
                    quote.pricing.discount,

                  shipping:
                    quote.pricing.shipping,

                  additionalCharges:
                    quote.pricing.additionalCharges,

                  total:
                    quote.pricing.total,
                },

                paymentStatus:
                  'pending',

                orderStatus:
                  'pending',

                quote:
                  quote._id,

                statusHistory: [
                  {
                    status:
                      'pending',

                    note:
                      `Created from quote ${quote.quoteNumber}`,

                    changedBy:
                      adminUserId,
                  },
                ],

                customerNotes:
                  quote.customerNotes,

                placedAt:
                  new Date(),
              },
            ],
            { session },
          );

        const now =
          new Date();

        const convertedQuote =
          await Quote.findOneAndUpdate(
            {
              _id:
                quote._id,

              status:
                QUOTE_STATUSES.ACCEPTED,

              order:
                null,
            },
            {
              $set: {
                status:
                  QUOTE_STATUSES.CONVERTED_TO_ORDER,

                order:
                  order._id,

                convertedAt:
                  now,
              },

              $push: {
                auditTrail: {
                  action:
                    'Quote Converted to Order',

                  note:
                    `Converted to order ${orderNumber}`,

                  actor:
                    adminUserId,

                  actorType:
                    'admin',

                  createdAt:
                    now,
                },
              },
            },
            {
              new: true,
              session,
              runValidators: true,
            },
          );

        if (!convertedQuote) {
          throw ApiError.conflict(
            'Quote conversion conflict',
            'QUOTE_CONVERSION_CONFLICT',
          );
        }

        if (
          quote.sourceType ===
          QUOTE_SOURCE_TYPES.WHOLESALE
        ) {
          await Wholesale.updateOne(
            {
              _id:
                quote.wholesaleRequest,

              documentType:
                'request',
            },
            {
              $set: {
                status:
                  WHOLESALE_REQUEST_STATUSES.CONVERTED_TO_ORDER,

                order:
                  order._id,

                quote:
                  quote._id,

                convertedAt:
                  now,
              },
            },
            { session },
          );
        }

        if (
          quote.sourceType ===
          QUOTE_SOURCE_TYPES.MANUFACTURING
        ) {
          await Manufacturing.updateOne(
            {
              _id:
                quote.manufacturingRequest,

              documentType:
                MANUFACTURING_DOCUMENT_TYPES.REQUEST,
            },
            {
              $set: {
                status:
                  MANUFACTURING_REQUEST_STATUSES.CONVERTED_TO_ORDER,

                order:
                  order._id,

                quote:
                  quote._id,

                convertedAt:
                  now,
              },
            },
            { session },
          );
        }

        if (
          quote.sourceType ===
          QUOTE_SOURCE_TYPES.PRINTING
        ) {
          await Printing.updateOne(
            {
              _id:
                quote.printingRequest,

              documentType:
                PRINTING_DOCUMENT_TYPES.REQUEST,
            },
            {
              $set: {
                status:
                  PRINTING_REQUEST_STATUSES.CONVERTED_TO_ORDER,

                order:
                  order._id,

                quote:
                  quote._id,

                convertedAt:
                  now,
              },
            },
            { session },
          );
        }

        orderId =
          order._id;

        stockTransitions =
          attemptStockTransitions;
      },
    );

    for (const transition of stockTransitions) {
      try {
        await stockNotification.handleStockTransition({
          before: transition.before,
          after: transition.after,
        });
      } catch (error) {
        logger.error(
          { err: error },
          'Stock notification after quote conversion failed (ignored)',
        );
      }
    }

    return Order.findById(
      orderId,
    ).lean();
  } catch (error) {
    if (
      error?.code ===
      'QUOTE_CONVERSION_CONFLICT'
    ) {
      const converted =
        await Quote.findById(
          quoteId,
        ).lean();

      if (
        converted?.status ===
          QUOTE_STATUSES.CONVERTED_TO_ORDER &&
        converted?.order
      ) {
        return Order.findById(
          converted.order,
        ).lean();
      }
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  markQuoteExpired,
  createWholesaleQuote,
  createManufacturingQuote,
  createPrintingQuote,

  listAdminQuotes,
  getAdminQuote,
  getQuoteStats,

  updateDraftQuote,
  sendQuote,

  listMyQuotes,
  getMyQuote,
  acceptQuote,
  rejectQuote,

  convertQuoteToOrder,
};