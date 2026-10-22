'use strict';

const mongoose = require('mongoose');

const {
  CURRENCIES,
  DEFAULT_CURRENCY,
} = require('../constants/Currency');

const {
  ORDER_TYPES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} = require('../constants/Order');

/*
|--------------------------------------------------------------------------
| Media Snapshot
|--------------------------------------------------------------------------
*/

const mediaSnapshotSchema =
  new mongoose.Schema(
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
| Customer Snapshot
|--------------------------------------------------------------------------
*/

const customerSnapshotSchema =
  new mongoose.Schema(
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
    },
    {
      _id: false,
    },
  );

/*
|--------------------------------------------------------------------------
| Printing Placement Snapshot
|--------------------------------------------------------------------------
*/

const printingPlacementSnapshotSchema =
  new mongoose.Schema(
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
      _id: false,
    },
  );

/*
|--------------------------------------------------------------------------
| Printing Artwork Snapshot
|--------------------------------------------------------------------------
*/

const printingArtworkSnapshotSchema =
  new mongoose.Schema(
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
      _id: false,
    },
  );

/*
|--------------------------------------------------------------------------
| Order Item
|--------------------------------------------------------------------------
|
| Retail / Wholesale:
| Product -> ProductVariant -> SKU
|
| Manufacturing:
| Manufacturing Category -> Style -> Variant
|
| Printing:
| Printing Service -> Request Snapshot
|--------------------------------------------------------------------------
*/

const orderItemSchema =
  new mongoose.Schema(
    {
      /*
      |--------------------------------------------------------------------------
      | Retail / Wholesale References
      |--------------------------------------------------------------------------
      */

      product: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: 'Product',

        default: null,
      },

      variant: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: 'ProductVariant',

        default: null,
      },

      sku: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: 'Sku',

        default: null,
      },

      /*
      |--------------------------------------------------------------------------
      | Manufacturing References
      |--------------------------------------------------------------------------
      */

      manufacturingCategory: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: 'Manufacturing',

        default: null,
      },

      manufacturingStyle: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: 'Manufacturing',

        default: null,
      },

      manufacturingVariant: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: 'Manufacturing',

        default: null,
      },

      /*
      |--------------------------------------------------------------------------
      | Printing & Branding Reference
      |--------------------------------------------------------------------------
      */

      printingService: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: 'Printing',

        default: null,
      },

      /*
      |--------------------------------------------------------------------------
      | Common Snapshot
      |--------------------------------------------------------------------------
      */

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
        maxlength: 40,
      },

      image: {
        type:
          mediaSnapshotSchema,

        default: undefined,
      },

      /*
      |--------------------------------------------------------------------------
      | Manufacturing Snapshot
      |--------------------------------------------------------------------------
      */

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

      manufacturingRequirements: {
        type: String,
        trim: true,
        maxlength: 10000,
      },

      /*
      |--------------------------------------------------------------------------
      | Printing & Branding Snapshot
      |--------------------------------------------------------------------------
      */

      printingServiceName: {
        type: String,
        trim: true,
        maxlength: 160,
      },

      printingServiceSlug: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 180,
      },

      printingRequirements: {
        type: String,
        trim: true,
        maxlength: 10000,
      },

      printingPlacements: {
        type: [
          printingPlacementSnapshotSchema,
        ],

        default: undefined,
      },

      printingArtwork: {
        type: [
          printingArtworkSnapshotSchema,
        ],

        default: undefined,
      },

      /*
      |--------------------------------------------------------------------------
      | Pricing
      |--------------------------------------------------------------------------
      */

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
          validator:
            Number.isInteger,

          message:
            'Quantity must be an integer',
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
| Shipping Address
|--------------------------------------------------------------------------
*/

const shippingAddressSchema =
  new mongoose.Schema(
    {
      fullName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },

      phone: {
        type: String,
        required: true,
        trim: true,
        maxlength: 20,
      },

      addressLine1: {
        type: String,
        required: true,
        trim: true,
        maxlength: 250,
      },

      addressLine2: {
        type: String,
        trim: true,
        maxlength: 250,
      },

      city: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },

      province: {
        type: String,
        trim: true,
        maxlength: 100,
      },

      postalCode: {
        type: String,
        trim: true,
        maxlength: 30,
      },

      country: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
        default: 'Pakistan',
      },
    },
    {
      _id: false,
    },
  );

/*
|--------------------------------------------------------------------------
| Pricing Snapshot
|--------------------------------------------------------------------------
*/

const pricingSnapshotSchema =
  new mongoose.Schema(
    {
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
    {
      _id: false,
    },
  );

/*
|--------------------------------------------------------------------------
| Coupon Snapshot
|--------------------------------------------------------------------------
*/

const couponSnapshotSchema =
  new mongoose.Schema(
    {
      couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Coupon',
      },

      code: {
        type: String,
        trim: true,
        uppercase: true,
        maxlength: 60,
      },

      discountType: {
        type: String,

        enum: [
          'percentage',
          'fixed',
        ],
      },

      discountValue: {
        type: Number,
        min: 0,
      },

      discountAmount: {
        type: Number,
        min: 0,
      },
    },
    {
      _id: false,
    },
  );

/*
|--------------------------------------------------------------------------
| Shipment
|--------------------------------------------------------------------------
*/

const shipmentSchema =
  new mongoose.Schema(
    {
      courierName: {
        type: String,
        trim: true,
        maxlength: 120,
      },

      trackingNumber: {
        type: String,
        trim: true,
        maxlength: 120,
      },

      trackingUrl: {
        type: String,
        trim: true,
        maxlength: 500,
      },

      shippedAt: {
        type: Date,
      },

      deliveredAt: {
        type: Date,
      },
    },
    {
      _id: false,
    },
  );

/*
|--------------------------------------------------------------------------
| Status History
|--------------------------------------------------------------------------
*/

const statusHistorySchema =
  new mongoose.Schema(
    {
      status: {
        type: String,
        enum: ORDER_STATUSES,
        required: true,
      },

      note: {
        type: String,
        trim: true,
        maxlength: 1000,
      },

      changedAt: {
        type: Date,
        default: Date.now,
        required: true,
      },

      changedBy: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: 'User',

        default: null,
      },
    },
    {
      _id: false,
    },
  );

/*
|--------------------------------------------------------------------------
| Order
|--------------------------------------------------------------------------
*/

const orderSchema =
  new mongoose.Schema(
    {
      orderNumber: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        uppercase: true,
        trim: true,
        maxlength: 40,
      },

      user: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: 'User',

        default: null,

        index: true,
      },

      customer: {
        type:
          customerSnapshotSchema,

        required: true,
      },

      orderType: {
        type: String,

        enum: ORDER_TYPES,

        required: true,

        default: 'retail',

        index: true,
      },

      items: {
        type: [
          orderItemSchema,
        ],

        required: true,

        validate: {
          validator(value) {
            return (
              Array.isArray(value) &&
              value.length > 0
            );
          },

          message:
            'Order must contain at least one item',
        },
      },

      shippingAddress: {
        type:
          shippingAddressSchema,

        required: true,
      },

      /*
       * Transaction currency. ONE order = ONE currency; pricing and every
       * item price below are snapshots in this currency. Orders created
       * before multi-currency have no value stored and are read as PKR.
       */
      currency: {
        type: String,
        enum: CURRENCIES,
        default: DEFAULT_CURRENCY,
      },

      pricing: {
        type:
          pricingSnapshotSchema,

        required: true,
      },

      paymentStatus: {
        type: String,

        enum: PAYMENT_STATUSES,

        default: 'pending',

        required: true,

        index: true,
      },

      orderStatus: {
        type: String,

        enum: ORDER_STATUSES,

        default: 'pending',

        required: true,

        index: true,
      },

      /*
      |--------------------------------------------------------------------------
      | Quote Reference
      |--------------------------------------------------------------------------
      */

      quote: {
        type:
          mongoose.Schema.Types
            .ObjectId,

        ref: 'Quote',

        default: null,
      },

      coupon: {
        type:
          couponSnapshotSchema,

        default: undefined,
      },

      shipment: {
        type:
          shipmentSchema,

        default: undefined,
      },

      statusHistory: {
        type: [
          statusHistorySchema,
        ],

        default: [],
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

      /*
       * Set once when reserved stock is converted into a physical deduction
       * (at the SHIPPED transition). Guards against committing twice.
       */
      stockCommittedAt: {
        type: Date,
        default: null,
      },

      placedAt: {
        type: Date,
        default: Date.now,
        required: true,
        index: true,
      },
    },
    {
      timestamps: true,
    },
  );

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

orderSchema.index({
  user: 1,
  createdAt: -1,
});

orderSchema.index({
  orderStatus: 1,
  createdAt: -1,
});

orderSchema.index({
  paymentStatus: 1,
  createdAt: -1,
});

orderSchema.index({
  orderType: 1,
  createdAt: -1,
});

/*
|--------------------------------------------------------------------------
| One Order Per Quote
|--------------------------------------------------------------------------
|
| Retail orders can have quote = null.
| Quote-based Wholesale / Manufacturing / Printing orders can only create
| one Order for the same Quote.
|--------------------------------------------------------------------------
*/

orderSchema.index(
  {
    quote: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      quote: {
        $type: 'objectId',
      },
    },
  },
);

/*
|--------------------------------------------------------------------------
| Export
|--------------------------------------------------------------------------
*/

module.exports =
  mongoose.models.Order ||
  mongoose.model(
    'Order',
    orderSchema,
  );
