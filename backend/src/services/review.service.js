'use strict';

const mongoose =
  require('mongoose');

const Review =
  require('../models/Review');

const Product =
  require('../models/Product');

const Order =
  require('../models/order.model');

const ApiError =
  require('../utils/ApiError');

const {
  REVIEW_STATUSES,
} = require('../constants/Review');

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

function getSort(sort) {
  switch (sort) {
    case 'oldest':
      return {
        createdAt: 1,
      };

    case 'highest':
      return {
        rating: -1,
        createdAt: -1,
      };

    case 'lowest':
      return {
        rating: 1,
        createdAt: -1,
      };

    case 'newest':
    default:
      return {
        createdAt: -1,
      };
  }
}

function paginationMeta({
  page,
  limit,
  total,
}) {
  return {
    page,
    limit,
    total,

    pages:
      Math.ceil(
        total / limit,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Find Delivered Purchase
|--------------------------------------------------------------------------
|
| The latest delivered order containing this Product is used as the
| verification source.
|--------------------------------------------------------------------------
*/

async function findDeliveredPurchase({
  userId,
  productId,
}) {
  return Order.findOne({
    user: userId,

    orderStatus:
      'delivered',

    'items.product':
      productId,
  })
    .sort({
      createdAt: -1,
    })
    .select(
      '_id orderNumber orderStatus items',
    )
    .lean();
}

/*
|--------------------------------------------------------------------------
| Customer Review Eligibility
|--------------------------------------------------------------------------
|
| Useful for Product Detail UI.
|
| Frontend can call this and decide whether to show:
| "Write a Review"
| "Purchase this product to review"
| "You already reviewed this product"
|--------------------------------------------------------------------------
*/

async function getReviewEligibility({
  userId,
  productId,
}) {
  const product =
    await Product.findById(
      productId,
    )
      .select(
        '_id status',
      )
      .lean();

  if (!product) {
    throw ApiError.notFound(
      'Product not found',
      'PRODUCT_NOT_FOUND',
    );
  }

  if (
    product.status !==
    'active'
  ) {
    return {
      eligible: false,
      reason:
        'PRODUCT_NOT_ACTIVE',
    };
  }

  const existingReview =
    await Review.findOne({
      user: userId,
      product: productId,
    })
      .select(
        '_id status',
      )
      .lean();

  if (existingReview) {
    return {
      eligible: false,
      reason:
        'ALREADY_REVIEWED',

      reviewId:
        existingReview._id,

      reviewStatus:
        existingReview.status,
    };
  }

  const order =
    await findDeliveredPurchase({
      userId,
      productId,
    });

  if (!order) {
    return {
      eligible: false,
      reason:
        'NO_DELIVERED_PURCHASE',
    };
  }

  return {
    eligible: true,
    reason: null,
    orderId: order._id,
  };
}

/*
|--------------------------------------------------------------------------
| Create Review
|--------------------------------------------------------------------------
*/

async function createReview({
  user,
  productId,
  data,
}) {
  const product =
    await Product.findById(
      productId,
    )
      .select(
        '_id name status',
      )
      .lean();

  if (!product) {
    throw ApiError.notFound(
      'Product not found',
      'PRODUCT_NOT_FOUND',
    );
  }

  if (
    product.status !==
    'active'
  ) {
    throw ApiError.badRequest(
      'Reviews can only be submitted for active products',
      'PRODUCT_NOT_ACTIVE',
    );
  }

  const existingReview =
    await Review.findOne({
      user: user._id,
      product: productId,
    })
      .select('_id')
      .lean();

  if (existingReview) {
    throw ApiError.conflict(
      'You have already reviewed this product',
      'REVIEW_ALREADY_EXISTS',
    );
  }

  const order =
    await findDeliveredPurchase({
      userId:
        user._id,

      productId,
    });

  if (!order) {
    throw ApiError.forbidden(
      'Only customers with a delivered purchase can review this product',
      'VERIFIED_PURCHASE_REQUIRED',
    );
  }

  try {
    const review =
      await Review.create({
        user:
          user._id,

        product:
          product._id,

        order:
          order._id,

        customer: {
          name:
            user.name,
        },

        rating:
          data.rating,

        title:
          data.title,

        comment:
          data.comment,

        verifiedPurchase:
          true,

        status:
          REVIEW_STATUSES.PENDING,
      });

    return Review.findById(
      review._id,
    )
      .populate(
        'product',
        'name slug generalImages',
      )
      .lean();
  } catch (error) {
    /*
    |--------------------------------------------------------------------------
    | Race-safe duplicate protection
    |--------------------------------------------------------------------------
    */

    if (
      error &&
      error.code === 11000
    ) {
      throw ApiError.conflict(
        'You have already reviewed this product',
        'REVIEW_ALREADY_EXISTS',
      );
    }

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| Public Product Reviews
|--------------------------------------------------------------------------
*/

async function listProductReviews({
  productId,
  page = 1,
  limit = 10,
  rating,
  sort = 'newest',
}) {
  const productExists =
    await Product.exists({
      _id: productId,
    });

  if (!productExists) {
    throw ApiError.notFound(
      'Product not found',
      'PRODUCT_NOT_FOUND',
    );
  }

  const filter = {
    product:
      productId,

    status:
      REVIEW_STATUSES.APPROVED,
  };

  if (rating) {
    filter.rating =
      rating;
  }

  const skip =
    (page - 1) * limit;

  const [reviews, total] =
    await Promise.all([
      Review.find(filter)
        .select(
          [
            'customer',
            'rating',
            'title',
            'comment',
            'verifiedPurchase',
            'brandReply',
            'createdAt',
          ].join(' '),
        )
        .populate(
          'brandReply.repliedBy',
          'name',
        )
        .sort(
          getSort(sort),
        )
        .skip(skip)
        .limit(limit)
        .lean(),

      Review.countDocuments(
        filter,
      ),
    ]);

  return {
    reviews,

    meta:
      paginationMeta({
        page,
        limit,
        total,
      }),
  };
}

/*
|--------------------------------------------------------------------------
| Product Rating Summary
|--------------------------------------------------------------------------
*/

async function getProductRatingSummary(
  productId,
) {
  const objectId =
    new mongoose.Types.ObjectId(
      productId,
    );

  const result =
    await Review.aggregate([
      {
        $match: {
          product:
            objectId,

          status:
            REVIEW_STATUSES.APPROVED,
        },
      },

      {
        $group: {
          _id: null,

          reviewCount: {
            $sum: 1,
          },

          averageRating: {
            $avg:
              '$rating',
          },

          rating1: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    '$rating',
                    1,
                  ],
                },
                1,
                0,
              ],
            },
          },

          rating2: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    '$rating',
                    2,
                  ],
                },
                1,
                0,
              ],
            },
          },

          rating3: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    '$rating',
                    3,
                  ],
                },
                1,
                0,
              ],
            },
          },

          rating4: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    '$rating',
                    4,
                  ],
                },
                1,
                0,
              ],
            },
          },

          rating5: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    '$rating',
                    5,
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

  if (
    result.length === 0
  ) {
    return {
      averageRating: 0,
      reviewCount: 0,

      distribution: {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0,
      },
    };
  }

  const summary =
    result[0];

  return {
    averageRating:
      Number(
        summary.averageRating.toFixed(
          1,
        ),
      ),

    reviewCount:
      summary.reviewCount,

    distribution: {
      5: summary.rating5,
      4: summary.rating4,
      3: summary.rating3,
      2: summary.rating2,
      1: summary.rating1,
    },
  };
}

/*
|--------------------------------------------------------------------------
| Customer - My Reviews
|--------------------------------------------------------------------------
*/

async function listMyReviews({
  userId,
  status,
  page = 1,
  limit = 10,
}) {
  const filter = {
    user:
      userId,
  };

  if (status) {
    filter.status =
      status;
  }

  const skip =
    (page - 1) * limit;

  const [reviews, total] =
    await Promise.all([
      Review.find(filter)
        .populate(
          'product',
          'name slug generalImages status',
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Review.countDocuments(
        filter,
      ),
    ]);

  return {
    reviews,

    meta:
      paginationMeta({
        page,
        limit,
        total,
      }),
  };
}

/*
|--------------------------------------------------------------------------
| Admin Listing
|--------------------------------------------------------------------------
*/

async function listAdminReviews({
  search,
  status,
  rating,
  productId,
  page = 1,
  limit = 20,
}) {
  const filter = {};

  if (status) {
    filter.status =
      status;
  }

  if (rating) {
    filter.rating =
      rating;
  }

  if (productId) {
    filter.product =
      productId;
  }

  /*
  |--------------------------------------------------------------------------
  | Search
  |--------------------------------------------------------------------------
  |
  | Product name lives in Product collection, so first resolve matching
  | Product IDs. Customer snapshot/title/comment are searchable directly.
  |--------------------------------------------------------------------------
  */

  if (search) {
    const regex =
      new RegExp(
        escapeRegex(search),
        'i',
      );

    const matchingProducts =
      await Product.find({
        name: regex,
      })
        .select('_id')
        .limit(100)
        .lean();

    const productIds =
      matchingProducts.map(
        (product) =>
          product._id,
      );

    filter.$or = [
      {
        'customer.name':
          regex,
      },

      {
        title: regex,
      },

      {
        comment: regex,
      },

      {
        product: {
          $in:
            productIds,
        },
      },
    ];
  }

  const skip =
    (page - 1) * limit;

  const [reviews, total] =
    await Promise.all([
      Review.find(filter)
        .populate(
          'product',
          'name slug generalImages status',
        )
        .populate(
          'user',
          'name email phone',
        )
        .populate(
          'order',
          'orderNumber orderStatus',
        )
        .populate(
          'moderatedBy',
          'name email',
        )
        .populate(
          'brandReply.repliedBy',
          'name email',
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Review.countDocuments(
        filter,
      ),
    ]);

  return {
    reviews,

    meta:
      paginationMeta({
        page,
        limit,
        total,
      }),
  };
}

/*
|--------------------------------------------------------------------------
| Admin Detail
|--------------------------------------------------------------------------
*/

async function getAdminReview(
  reviewId,
) {
  const review =
    await Review.findById(
      reviewId,
    )
      .populate(
        'product',
        'name slug generalImages status',
      )
      .populate(
        'user',
        'name email phone',
      )
      .populate(
        'order',
        'orderNumber orderStatus items',
      )
      .populate(
        'moderatedBy',
        'name email',
      )
      .populate(
        'brandReply.repliedBy',
        'name email',
      )
      .lean();

  if (!review) {
    throw ApiError.notFound(
      'Review not found',
      'REVIEW_NOT_FOUND',
    );
  }

  return review;
}

/*
|--------------------------------------------------------------------------
| Approve
|--------------------------------------------------------------------------
|
| Pending -> Approved
| Rejected -> Approved is intentionally NOT allowed.
|--------------------------------------------------------------------------
*/

async function approveReview({
  reviewId,
  adminUserId,
}) {
  const review =
    await Review.findOneAndUpdate(
      {
        _id:
          reviewId,

        status:
          REVIEW_STATUSES.PENDING,
      },

      {
        $set: {
          status:
            REVIEW_STATUSES.APPROVED,

          moderatedBy:
            adminUserId,

          moderatedAt:
            new Date(),

          rejectionReason:
            null,
        },
      },

      {
        new: true,
        runValidators: true,
      },
    )
      .populate(
        'product',
        'name slug',
      )
      .populate(
        'moderatedBy',
        'name email',
      );

  if (review) {
    return review;
  }

  const existing =
    await Review.findById(
      reviewId,
    )
      .select(
        'status',
      )
      .lean();

  if (!existing) {
    throw ApiError.notFound(
      'Review not found',
      'REVIEW_NOT_FOUND',
    );
  }

  throw ApiError.conflict(
    `Review cannot be approved from ${existing.status} status`,
    'INVALID_REVIEW_STATUS_TRANSITION',
  );
}

/*
|--------------------------------------------------------------------------
| Reject
|--------------------------------------------------------------------------
|
| Pending -> Rejected
|
| We intentionally do not allow Approved -> Rejected here.
| If moderation reversal is required later, make it an explicit workflow.
|--------------------------------------------------------------------------
*/

async function rejectReview({
  reviewId,
  adminUserId,
  reason,
}) {
  const review =
    await Review.findOneAndUpdate(
      {
        _id:
          reviewId,

        status:
          REVIEW_STATUSES.PENDING,
      },

      {
        $set: {
          status:
            REVIEW_STATUSES.REJECTED,

          moderatedBy:
            adminUserId,

          moderatedAt:
            new Date(),

          rejectionReason:
            reason || null,
        },
      },

      {
        new: true,
        runValidators: true,
      },
    )
      .populate(
        'product',
        'name slug',
      )
      .populate(
        'moderatedBy',
        'name email',
      );

  if (review) {
    return review;
  }

  const existing =
    await Review.findById(
      reviewId,
    )
      .select(
        'status',
      )
      .lean();

  if (!existing) {
    throw ApiError.notFound(
      'Review not found',
      'REVIEW_NOT_FOUND',
    );
  }

  throw ApiError.conflict(
    `Review cannot be rejected from ${existing.status} status`,
    'INVALID_REVIEW_STATUS_TRANSITION',
  );
}

/*
|--------------------------------------------------------------------------
| Create / Update Official Brand Reply
|--------------------------------------------------------------------------
|
| PUT is intentionally idempotent:
| - no reply -> creates
| - existing reply -> edits
|
| Only approved reviews can have a public brand reply.
|--------------------------------------------------------------------------
*/

async function upsertBrandReply({
  reviewId,
  adminUserId,
  message,
}) {
  const review =
    await Review.findOneAndUpdate(
      {
        _id:
          reviewId,

        status:
          REVIEW_STATUSES.APPROVED,
      },

      {
        $set: {
          brandReply: {
            message,

            repliedBy:
              adminUserId,

            repliedAt:
              new Date(),
          },
        },
      },

      {
        new: true,
        runValidators: true,
      },
    )
      .populate(
        'product',
        'name slug',
      )
      .populate(
        'brandReply.repliedBy',
        'name email',
      );

  if (review) {
    return review;
  }

  const existing =
    await Review.findById(
      reviewId,
    )
      .select(
        'status',
      )
      .lean();

  if (!existing) {
    throw ApiError.notFound(
      'Review not found',
      'REVIEW_NOT_FOUND',
    );
  }

  throw ApiError.conflict(
    'Official reply can only be published on an approved review',
    'REVIEW_NOT_APPROVED',
  );
}

module.exports = {
  getReviewEligibility,

  createReview,

  listProductReviews,
  getProductRatingSummary,

  listMyReviews,

  listAdminReviews,
  getAdminReview,

  approveReview,
  rejectReview,

  upsertBrandReply,
};