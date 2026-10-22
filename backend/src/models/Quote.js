'use strict';

const mongoose = require('mongoose');

const {
  QUOTE_STATUSES,
  QUOTE_SOURCE_TYPES,
} = require('../constants/Quote');

/*
|--------------------------------------------------------------------------
| Customer Snapshot
|--------------------------------------------------------------------------
*/

const customerSnapshotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },

    businessName: {
      type: String,
      trim: true,
      maxlength: 160,
    },

    businessType: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    taxNtn: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 50,
    },
  },
  {
    _id: false,
  },
);

/*
|--------------------------------------------------------------------------
| Quote Item
|--------------------------------------------------------------------------
*/

const quoteItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },

    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductVariant',
      default: null,
    },

    sku: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sku',
      default: null,
    },

    manufacturingCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Manufacturing',
      default: null,
    },

    manufacturingStyle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Manufacturing',
      default: null,
    },

    manufacturingVariant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Manufacturing',
      default: null,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    colorName: {
      type: String,
      trim: true,
      maxlength: 60,
    },

    size: {
      type: String,
      trim: true,
      maxlength: 40,
    },

    skuCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 60,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 10000,
    },

    manufacturingCategoryName: {
      type: String,
      trim: true,
      maxlength: 160,
    },

    manufacturingStyleName: {
      type: String,
      trim: true,
      maxlength: 160,
    },

    manufacturingVariantName: {
      type: String,
      trim: true,
      maxlength: 160,
    },

    manufacturingVariantCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 60,
    },

    printingServiceName: {
      type: String,
      trim: true,
      maxlength: 160,
    },

    printingServiceSlug: {
      type: String,
      trim: true,
      maxlength: 160,
    },

    printingRequirements: {
      type: String,
      trim: true,
      maxlength: 10000,
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be an integer',
      },
    },

    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: true,
  },
);

/*
|--------------------------------------------------------------------------
| Audit Trail
|--------------------------------------------------------------------------
*/

const auditTrailSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    note: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    actorType: {
      type: String,
      enum: ['admin', 'customer', 'system'],
      required: true,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
  },
);

/*
|--------------------------------------------------------------------------
| Quote
|--------------------------------------------------------------------------
*/

const quoteSchema = new mongoose.Schema(
  {
    quoteNumber: {
      type: String,
      required: true,
      immutable: true,
      uppercase: true,
      trim: true,
      maxlength: 40,
    },

    sourceType: {
      type: String,
      enum: Object.values(QUOTE_SOURCE_TYPES),
      required: true,
      immutable: true,
      index: true,
    },

    wholesaleRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wholesale',
      default: null,
    },

    manufacturingRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Manufacturing',
      default: null,
    },

    printingRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Printing',
      default: null,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    customer: {
      type: customerSnapshotSchema,
      required: true,
    },

    items: {
      type: [quoteItemSchema],
      required: true,
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: 'Quote must contain at least one item',
      },
    },

    pricing: {
      subtotal: {
        type: Number,
        required: true,
        min: 0,
      },

      discount: {
        type: Number,
        default: 0,
        min: 0,
      },

      shipping: {
        type: Number,
        default: 0,
        min: 0,
      },

      additionalCharges: {
        type: Number,
        default: 0,
        min: 0,
      },

      total: {
        type: Number,
        required: true,
        min: 0,
      },
    },

    status: {
      type: String,
      enum: Object.values(QUOTE_STATUSES),
      default: QUOTE_STATUSES.DRAFT,
      required: true,
      index: true,
    },

    validUntil: {
      type: Date,
      default: null,
    },

    customerNotes: {
      type: String,
      trim: true,
      maxlength: 3000,
    },

    adminNotes: {
      type: String,
      trim: true,
      maxlength: 5000,
    },

    terms: {
      type: String,
      trim: true,
      maxlength: 10000,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    sentAt: {
      type: Date,
      default: null,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    expiredAt: {
      type: Date,
      default: null,
    },

    convertedAt: {
      type: Date,
      default: null,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },

    auditTrail: {
      type: [auditTrailSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

/*
|--------------------------------------------------------------------------
| Source Validation
|--------------------------------------------------------------------------
*/

quoteSchema.pre('validate', function validateSource() {
  const isWholesale =
    this.sourceType === QUOTE_SOURCE_TYPES.WHOLESALE;

  const isManufacturing =
    this.sourceType === QUOTE_SOURCE_TYPES.MANUFACTURING;

  const isPrinting =
    this.sourceType === QUOTE_SOURCE_TYPES.PRINTING;

  if (isWholesale && !this.wholesaleRequest) {
    this.invalidate(
      'wholesaleRequest',
      'Wholesale request is required',
    );
  }

  if (isManufacturing && !this.manufacturingRequest) {
    this.invalidate(
      'manufacturingRequest',
      'Manufacturing request is required',
    );
  }

  if (isPrinting && !this.printingRequest) {
    this.invalidate(
      'printingRequest',
      'Printing request is required',
    );
  }

  if (!isWholesale && this.wholesaleRequest) {
    this.invalidate(
      'wholesaleRequest',
      'Wholesale request is only valid for wholesale quotes',
    );
  }

  if (!isManufacturing && this.manufacturingRequest) {
    this.invalidate(
      'manufacturingRequest',
      'Manufacturing request is only valid for manufacturing quotes',
    );
  }

  if (!isPrinting && this.printingRequest) {
    this.invalidate(
      'printingRequest',
      'Printing request is only valid for printing quotes',
    );
  }
});

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

quoteSchema.index(
  { quoteNumber: 1 },
  { unique: true },
);

quoteSchema.index({
  status: 1,
  createdAt: -1,
});

quoteSchema.index({
  sourceType: 1,
  status: 1,
  createdAt: -1,
});

quoteSchema.index({
  user: 1,
  createdAt: -1,
});

quoteSchema.index(
  { wholesaleRequest: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceType: 'wholesale',
      wholesaleRequest: {
        $type: 'objectId',
      },
    },
  },
);

quoteSchema.index(
  { manufacturingRequest: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceType: 'manufacturing',
      manufacturingRequest: {
        $type: 'objectId',
      },
    },
  },
);

quoteSchema.index(
  { printingRequest: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sourceType: 'printing',
      printingRequest: {
        $type: 'objectId',
      },
    },
  },
);

module.exports = mongoose.model(
  'Quote',
  quoteSchema,
);