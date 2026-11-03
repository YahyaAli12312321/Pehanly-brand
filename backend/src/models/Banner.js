'use strict';

const mongoose = require('mongoose');

const {
  BANNER_PLACEMENTS,
} = require('../constants/Banner');

const imageSchema = new mongoose.Schema(
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
      maxlength: 250,
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

const ctaSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      maxlength: 80,
    },

    target: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    _id: false,
  },
);

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    subtitle: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    placement: {
      type: String,
      enum: Object.values(BANNER_PLACEMENTS),
      required: true,
      index: true,
    },

    image: {
      type: imageSchema,
      required: true,
    },

    mobileImage: {
      type: imageSchema,
      default: undefined,
    },

    cta: {
      type: ctaSchema,
      default: undefined,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },

    startsAt: {
      type: Date,
      default: null,
    },

    endsAt: {
      type: Date,
      default: null,
    },

    impressions: {
      type: Number,
      default: 0,
      min: 0,
    },

    clicks: {
      type: Number,
      default: 0,
      min: 0,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

/*
|--------------------------------------------------------------------------
| Schedule Validation
|--------------------------------------------------------------------------
*/

bannerSchema.pre(
  'validate',
  function validateSchedule() {
    if (
      this.startsAt &&
      this.endsAt &&
      this.endsAt <= this.startsAt
    ) {
      this.invalidate(
        'endsAt',
        'Banner end date must be after start date',
      );
    }
  },
);

/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

bannerSchema.index({
  placement: 1,
  isActive: 1,
  sortOrder: 1,
});

bannerSchema.index({
  isActive: 1,
  startsAt: 1,
  endsAt: 1,
});

bannerSchema.index({
  createdAt: -1,
});

module.exports = mongoose.model(
  'Banner',
  bannerSchema,
);