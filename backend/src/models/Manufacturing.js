'use strict';

const mongoose = require('mongoose');

const {
  MANUFACTURING_DOCUMENT_TYPES,
  MANUFACTURING_REQUEST_STATUSES,
} = require('../constants/Manufacturing');

const mediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    publicId: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    alt: {
      type: String,
      trim: true,
      maxlength: 160,
    },

    viewType: {
      type: String,
      enum: ['model', 'mockup', 'other'],
      default: 'other',
    },

    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { _id: true },
);

const customerSchema = new mongoose.Schema(
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
  { _id: false },
);

const requestSelectionSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Manufacturing',
      required: true,
    },

    style: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Manufacturing',
      required: true,
    },

    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Manufacturing',
      default: null,
    },

    categoryName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    styleName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    variantName: {
      type: String,
      trim: true,
      maxlength: 160,
    },

    variantCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 60,
    },

    colorName: {
      type: String,
      trim: true,
      maxlength: 80,
    },
  },
  { _id: false },
);

const manufacturingSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      enum: Object.values(MANUFACTURING_DOCUMENT_TYPES),
      required: true,
      immutable: true,
      index: true,
    },

    /* Catalog */
    name: {
      type: String,
      trim: true,
      maxlength: 160,
    },

    slug: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 180,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 3000,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    /* Style → Category */
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Manufacturing',
      default: null,
    },

    /* Variant → Style */
    style: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Manufacturing',
      default: null,
    },

    variantCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 60,
    },

    colorName: {
      type: String,
      trim: true,
      maxlength: 80,
    },

    media: {
      type: [mediaSchema],
      default: undefined,
    },

    /* Request */
    requestNumber: {
      type: String,
      uppercase: true,
      trim: true,
      maxlength: 40,
      immutable: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    customer: {
      type: customerSchema,
      default: undefined,
    },

    selection: {
      type: requestSelectionSchema,
      default: undefined,
    },

    quantity: {
      type: Number,
      min: 1,
      validate: {
        validator(value) {
          return (
            value === undefined ||
            value === null ||
            Number.isInteger(value)
          );
        },
        message: 'Manufacturing quantity must be an integer',
      },
    },

    requirements: {
      type: String,
      trim: true,
      maxlength: 10000,
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

    status: {
      type: String,
      enum: Object.values(MANUFACTURING_REQUEST_STATUSES),
    },

    quote: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quote',
      default: null,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    reviewedAt: Date,

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    approvedAt: Date,
    rejectedAt: Date,
    quotedAt: Date,
    acceptedAt: Date,
    cancelledAt: Date,
    convertedAt: Date,
  },
  { timestamps: true },
);

manufacturingSchema.pre('validate', function validateDocument() {
  const type = this.documentType;

  if (type === MANUFACTURING_DOCUMENT_TYPES.CATEGORY) {
    if (!this.name) this.invalidate('name', 'Category name is required');
    if (!this.slug) this.invalidate('slug', 'Category slug is required');

    if (this.category || this.style) {
      this.invalidate(
        'documentType',
        'Category cannot have parent category or style',
      );
    }

    return;
  }

  if (type === MANUFACTURING_DOCUMENT_TYPES.STYLE) {
    if (!this.name) this.invalidate('name', 'Style name is required');
    if (!this.slug) this.invalidate('slug', 'Style slug is required');
    if (!this.category) {
      this.invalidate('category', 'Category is required for style');
    }

    return;
  }

  if (type === MANUFACTURING_DOCUMENT_TYPES.VARIANT) {
    if (!this.name) this.invalidate('name', 'Variant name is required');
    if (!this.variantCode) {
      this.invalidate('variantCode', 'Variant code is required');
    }
    if (!this.style) {
      this.invalidate('style', 'Style is required for variant');
    }

    return;
  }

  if (type === MANUFACTURING_DOCUMENT_TYPES.REQUEST) {
    if (!this.requestNumber) {
      this.invalidate('requestNumber', 'Request number is required');
    }

    if (!this.customer) {
      this.invalidate('customer', 'Customer information is required');
    }

    if (!this.selection) {
      this.invalidate('selection', 'Manufacturing selection is required');
    }

    if (!this.quantity || this.quantity < 1) {
      this.invalidate('quantity', 'Manufacturing quantity is required');
    }

    if (!this.requirements) {
      this.invalidate('requirements', 'Manufacturing requirements are required');
    }

    if (!this.status) {
      this.invalidate('status', 'Manufacturing request status is required');
    }
  }
});

manufacturingSchema.index(
  { documentType: 1, slug: 1 },
  {
    unique: true,
    partialFilterExpression: {
      documentType: { $in: ['category', 'style'] },
      slug: { $type: 'string' },
    },
  },
);

manufacturingSchema.index(
  { requestNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      documentType: 'request',
      requestNumber: { $type: 'string' },
    },
  },
);

manufacturingSchema.index(
  { variantCode: 1 },
  {
    unique: true,
    partialFilterExpression: {
      documentType: 'variant',
      variantCode: { $type: 'string' },
    },
  },
);

manufacturingSchema.index({
  documentType: 1,
  isActive: 1,
  sortOrder: 1,
});

manufacturingSchema.index({
  documentType: 1,
  category: 1,
  isActive: 1,
  sortOrder: 1,
});

manufacturingSchema.index({
  documentType: 1,
  style: 1,
  isActive: 1,
  sortOrder: 1,
});

manufacturingSchema.index({
  documentType: 1,
  status: 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  'Manufacturing',
  manufacturingSchema,
);