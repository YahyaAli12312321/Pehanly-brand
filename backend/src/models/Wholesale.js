'use strict';

const mongoose = require('mongoose');

const {
  WHOLESALE_REQUEST_STATUSES,
  WHOLESALE_REQUEST_TYPES,
} = require('../constants/Wholesale');

/*
|--------------------------------------------------------------------------
| Customer Snapshot
|--------------------------------------------------------------------------
| Only used when documentType = "request"
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
| Wholesale Item
|--------------------------------------------------------------------------
| Pack:
|   product / variant / sku / quantity
|
| Request:
|   Same refs + immutable commercial snapshots
|--------------------------------------------------------------------------
*/

const wholesaleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },

    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductVariant',
      required: true,
    },

    sku: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sku',
      required: true,
    },

    productName: {
      type: String,
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
      maxlength: 40,
    },

    wholesalePrice: {
      type: Number,
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
      min: 0,
    },
  },
  {
    _id: true,
  },
);

/*
|--------------------------------------------------------------------------
| Pack Image
|--------------------------------------------------------------------------
*/

const packImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
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
  },
  {
    _id: false,
  },
);

/*
|--------------------------------------------------------------------------
| Discount Scheme Snapshot
|--------------------------------------------------------------------------
| Used when admin approves a B2B / wholesale account.
|--------------------------------------------------------------------------
*/

const discountSchemeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 160,
    },

    discountPercent: {
      type: Number,
      min: 0,
      max: 100,
    },

    minimumOrderQuantity: {
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
          'Minimum order quantity must be an integer',
      },
    },
  },
  {
    _id: false,
  },
);

/*
|--------------------------------------------------------------------------
| Main Wholesale Schema
|--------------------------------------------------------------------------
*/

const wholesaleSchema = new mongoose.Schema(
  {
    /*
    |--------------------------------------------------------------------------
    | Document discriminator
    |--------------------------------------------------------------------------
    |
    | pack    = Ready Wholesale Pack
    | request = Customer Wholesale Request
    |
    */

    documentType: {
      type: String,
      enum: ['pack', 'request'],
      required: true,
      index: true,
      immutable: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Ready Pack Fields
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
      maxlength: 2000,
    },

    image: {
      type: packImageSchema,
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
    | Request Fields
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
      type: customerSnapshotSchema,
      default: undefined,
    },

    /*
     * custom:
     * Customer manually builds wholesale cart.
     *
     * ready_pack:
     * Request originated from a Ready Pack.
     */
    requestType: {
      type: String,
      enum: Object.values(
        WHOLESALE_REQUEST_TYPES,
      ),
    },

    /*
     * When requestType = ready_pack,
     * reference the source Wholesale document.
     *
     * Referenced document must have:
     * documentType = "pack"
     */
    sourcePack: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wholesale',
      default: null,
    },

    /*
    |--------------------------------------------------------------------------
    | Shared Items
    |--------------------------------------------------------------------------
    |
    | Pack:
    | Template SKU quantities.
    |
    | Request:
    | Validated SKU + commercial snapshots.
    |
    */

    items: {
      type: [wholesaleItemSchema],
      required: true,

      validate: {
        validator(value) {
          return (
            Array.isArray(value) &&
            value.length > 0
          );
        },

        message:
          'Wholesale document must contain at least one item',
      },
    },

    /*
    |--------------------------------------------------------------------------
    | Requested Volume
    |--------------------------------------------------------------------------
    |
    | For request documents this is calculated by backend:
    |
    | sum(items.quantity)
    |
    | It powers the Admin Wholesale "Requested Volume" KPI.
    |
    */

    requestedVolume: {
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
          'Requested volume must be an integer',
      },
    },

    /*
    |--------------------------------------------------------------------------
    | Partnership Proposal
    |--------------------------------------------------------------------------
    |
    | Optional B2B / institutional proposal supplied with the request.
    |
    */

    partnershipProposal: {
      type: String,
      trim: true,
      maxlength: 5000,
    },

    /*
    |--------------------------------------------------------------------------
    | Assigned Discount Scheme
    |--------------------------------------------------------------------------
    |
    | Snapshot of B2B commercial terms assigned by admin.
    |
    */

    discountScheme: {
      type: discountSchemeSchema,
      default: undefined,
    },

    /*
    |--------------------------------------------------------------------------
    | Request Pricing Snapshot
    |--------------------------------------------------------------------------
    */

    pricing: {
      subtotal: {
        type: Number,
        min: 0,
      },

      estimatedTotal: {
        type: Number,
        min: 0,
      },
    },

    /*
    |--------------------------------------------------------------------------
    | Request Lifecycle
    |--------------------------------------------------------------------------
    */

    status: {
      type: String,
      enum: Object.values(
        WHOLESALE_REQUEST_STATUSES,
      ),
    },

    customerNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    adminNotes: {
      type: String,
      trim: true,
      maxlength: 5000,
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

    quotedAt: {
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

wholesaleSchema.pre(
  'validate',
  function validateWholesale() {
    /*
     * Ready Pack validation
     */
    if (this.documentType === 'pack') {
      if (!this.name) {
        this.invalidate(
          'name',
          'Pack name is required',
        );
      }

      if (!this.slug) {
        this.invalidate(
          'slug',
          'Pack slug is required',
        );
      }

      return;
    }

    /*
     * Wholesale Request validation
     */
    if (this.documentType === 'request') {
      if (!this.requestNumber) {
        this.invalidate(
          'requestNumber',
          'Request number is required',
        );
      }

      if (!this.customer) {
        this.invalidate(
          'customer',
          'Customer information is required',
        );
      }

      if (!this.requestType) {
        this.invalidate(
          'requestType',
          'Wholesale request type is required',
        );
      }

      if (!this.status) {
        this.invalidate(
          'status',
          'Wholesale request status is required',
        );
      }

      if (
        this.requestType ===
          WHOLESALE_REQUEST_TYPES.READY_PACK &&
        !this.sourcePack
      ) {
        this.invalidate(
          'sourcePack',
          'Source pack is required for ready pack requests',
        );
      }

      if (
        this.requestType ===
          WHOLESALE_REQUEST_TYPES.CUSTOM &&
        this.sourcePack
      ) {
        this.invalidate(
          'sourcePack',
          'Custom wholesale request cannot have a source pack',
        );
      }

      if (
        this.pricing?.subtotal === undefined ||
        this.pricing?.estimatedTotal ===
          undefined
      ) {
        this.invalidate(
          'pricing',
          'Pricing is required for wholesale requests',
        );
      }

      /*
       * requestedVolume is generated by backend
       * from the validated request items.
       */
      if (
        this.requestedVolume === undefined ||
        this.requestedVolume === null ||
        this.requestedVolume < 1
      ) {
        this.invalidate(
          'requestedVolume',
          'Requested volume is required for wholesale requests',
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
 * Pack slug must be unique only among pack documents.
 */
wholesaleSchema.index(
  {
    slug: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      documentType: 'pack',

      slug: {
        $type: 'string',
      },
    },
  },
);

/*
 * Request number unique only for request documents.
 */
wholesaleSchema.index(
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
 * General newest-first listing.
 */
wholesaleSchema.index({
  documentType: 1,
  createdAt: -1,
});

/*
 * Public/Admin Ready Pack listing.
 */
wholesaleSchema.index({
  documentType: 1,
  isActive: 1,
  sortOrder: 1,
});

/*
 * Admin status filtering.
 */
wholesaleSchema.index({
  documentType: 1,
  status: 1,
  createdAt: -1,
});

/*
 * Customer request history.
 */
wholesaleSchema.index({
  documentType: 1,
  user: 1,
  createdAt: -1,
});

/*
 * Customer/business lookup.
 */
wholesaleSchema.index({
  documentType: 1,
  'customer.email': 1,
  createdAt: -1,
});

wholesaleSchema.index({
  documentType: 1,
  'customer.phone': 1,
  createdAt: -1,
});

wholesaleSchema.index({
  documentType: 1,
  'customer.businessName': 1,
  createdAt: -1,
});

/*
 * Admin dashboard approval listing.
 */
wholesaleSchema.index({
  documentType: 1,
  status: 1,
  approvedAt: -1,
});

module.exports = mongoose.model(
  'Wholesale',
  wholesaleSchema,
);