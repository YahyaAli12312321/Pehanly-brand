'use strict';

const mongoose = require('mongoose');

const {
  PRINTING_DOCUMENT_TYPES,
  PRINTING_REQUEST_STATUSES,
  PRINTING_GARMENT_SOURCES,
} = require('../constants/Printing');

/*
|--------------------------------------------------------------------------
| Service Media
|--------------------------------------------------------------------------
*/

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

    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: true,
  },
);

/*
|--------------------------------------------------------------------------
| Customer Snapshot
|--------------------------------------------------------------------------
*/

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
  {
    _id: false,
  },
);

/*
|--------------------------------------------------------------------------
| Selected Printing Service Snapshot
|--------------------------------------------------------------------------
|
| We snapshot the service name so future admin edits to the service catalog
| do not change historical customer requests.
|--------------------------------------------------------------------------
*/

const serviceSelectionSchema = new mongoose.Schema(
  {
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Printing',
      required: true,
    },

    serviceName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    serviceSlug: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 180,
    },
  },
  {
    _id: false,
  },
);

/*
|--------------------------------------------------------------------------
| Artwork / Logo
|--------------------------------------------------------------------------
|
| Actual files live in Cloudinary.
| MongoDB stores metadata only.
|--------------------------------------------------------------------------
*/

const artworkSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    publicId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },

    resourceType: {
      type: String,
      trim: true,
      maxlength: 50,
    },

    originalName: {
      type: String,
      trim: true,
      maxlength: 255,
    },

    format: {
      type: String,
      trim: true,
      maxlength: 30,
    },

    bytes: {
      type: Number,
      min: 0,
    },
  },
  {
    _id: true,
  },
);

/*
|--------------------------------------------------------------------------
| Printing Placement
|--------------------------------------------------------------------------
|
| No hard-coded front/back/sleeve enum.
| This keeps the system flexible for:
|
| Front
| Back
| Chest
| Sleeve
| Neck Label
| Pocket
| Packaging
| etc.
|--------------------------------------------------------------------------
*/

const placementSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    _id: true,
  },
);

/*
|--------------------------------------------------------------------------
| Main Printing Schema
|--------------------------------------------------------------------------
*/

const printingSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      enum: Object.values(
        PRINTING_DOCUMENT_TYPES,
      ),
      required: true,
      immutable: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Common / Service Catalog Fields
    |--------------------------------------------------------------------------
    */

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

    media: {
      type: [mediaSchema],
      default: undefined,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
    },

    /*
    |--------------------------------------------------------------------------
    | Printing Request
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | Service Snapshot
    |--------------------------------------------------------------------------
    */

    selection: {
      type: serviceSelectionSchema,
      default: undefined,
    },

    /*
    |--------------------------------------------------------------------------
    | Garment (who supplies the items to print on)
    |--------------------------------------------------------------------------
    |
    | The request validator, the create service and the admin filter already use
    | these fields. They were missing from the schema, so Mongoose silently
    | dropped them on save and ignored the garmentSource filter.
    |--------------------------------------------------------------------------
    */

    garmentSource: {
      type: String,
      enum: Object.values(PRINTING_GARMENT_SOURCES),
    },

    garmentDetails: {
      type: String,
      trim: true,
      maxlength: 3000,
    },

    colors: {
      type: [{ type: String, trim: true, maxlength: 80 }],
      default: undefined,
    },

    /*
    |--------------------------------------------------------------------------
    | Quantity
    |--------------------------------------------------------------------------
    */

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

        message:
          'Printing quantity must be an integer',
      },
    },

    /*
    |--------------------------------------------------------------------------
    | Customer Requirements
    |--------------------------------------------------------------------------
    |
    | Flexible instead of inventing fixed printing attributes.
    |--------------------------------------------------------------------------
    */

    requirements: {
      type: String,
      trim: true,
      maxlength: 10000,
    },

    /*
    |--------------------------------------------------------------------------
    | Printing Placements
    |--------------------------------------------------------------------------
    */

    placements: {
      type: [placementSchema],
      default: undefined,
    },

    /*
    |--------------------------------------------------------------------------
    | Artwork / Logo Files
    |--------------------------------------------------------------------------
    */

    artwork: {
      type: [artworkSchema],
      default: undefined,
    },

    /*
    |--------------------------------------------------------------------------
    | Notes
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | Request Status
    |--------------------------------------------------------------------------
    */

    status: {
      type: String,
      enum: Object.values(
        PRINTING_REQUEST_STATUSES,
      ),
    },

    /*
    |--------------------------------------------------------------------------
    | Quote / Order
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | Review Information
    |--------------------------------------------------------------------------
    */

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    quotedAt: {
      type: Date,
      default: null,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    convertedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

/*
|--------------------------------------------------------------------------
| Conditional Validation
|--------------------------------------------------------------------------
*/

printingSchema.pre(
  'validate',
  function validatePrintingDocument() {
    const types =
      PRINTING_DOCUMENT_TYPES;

    /*
    |--------------------------------------------------------------------------
    | Service
    |--------------------------------------------------------------------------
    */

    if (
      this.documentType ===
      types.SERVICE
    ) {
      if (!this.name) {
        this.invalidate(
          'name',
          'Printing service name is required',
        );
      }

      if (!this.slug) {
        this.invalidate(
          'slug',
          'Printing service slug is required',
        );
      }

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Request
    |--------------------------------------------------------------------------
    */

    if (
      this.documentType ===
      types.REQUEST
    ) {
      if (!this.requestNumber) {
        this.invalidate(
          'requestNumber',
          'Printing request number is required',
        );
      }

      if (!this.customer) {
        this.invalidate(
          'customer',
          'Customer information is required',
        );
      }

      if (!this.selection) {
        this.invalidate(
          'selection',
          'Printing service selection is required',
        );
      }

      if (
        !this.quantity ||
        this.quantity < 1
      ) {
        this.invalidate(
          'quantity',
          'Printing quantity is required',
        );
      }

      if (!this.requirements) {
        this.invalidate(
          'requirements',
          'Printing requirements are required',
        );
      }

      if (!this.status) {
        this.invalidate(
          'status',
          'Printing request status is required',
        );
      }
    }
  },
);

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

/*
 * Unique service slug.
 */

printingSchema.index(
  {
    documentType: 1,
    slug: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      documentType: 'service',

      slug: {
        $type: 'string',
      },
    },
  },
);

/*
 * Unique human-readable request number.
 */

printingSchema.index(
  {
    requestNumber: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      documentType: 'request',

      requestNumber: {
        $type: 'string',
      },
    },
  },
);

/*
 * Public/Admin service catalog.
 */

printingSchema.index({
  documentType: 1,
  isActive: 1,
  sortOrder: 1,
});

/*
 * Admin request listing.
 */

printingSchema.index({
  documentType: 1,
  status: 1,
  createdAt: -1,
});

/*
 * Customer request history.
 */

printingSchema.index({
  documentType: 1,
  user: 1,
  createdAt: -1,
});

/*
 * B2B customer lookup.
 */

printingSchema.index({
  documentType: 1,
  'customer.businessName': 1,
  createdAt: -1,
});

/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports = mongoose.model(
  'Printing',
  printingSchema,
);