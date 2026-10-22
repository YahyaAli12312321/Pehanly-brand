'use strict';

const Banner = require('../models/Banner');
const ApiError = require('../utils/ApiError');

const {
  BANNER_STATUSES,
} = require('../constants/Banner');

function escapeRegex(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

function getBannerStatus(
  banner,
  now = new Date(),
) {
  if (!banner.isActive) {
    return BANNER_STATUSES.INACTIVE;
  }

  if (
    banner.startsAt &&
    new Date(banner.startsAt) > now
  ) {
    return BANNER_STATUSES.SCHEDULED;
  }

  if (
    banner.endsAt &&
    new Date(banner.endsAt) < now
  ) {
    return BANNER_STATUSES.EXPIRED;
  }

  return BANNER_STATUSES.ACTIVE;
}

function serializeBanner(
  banner,
  now = new Date(),
) {
  const data =
    typeof banner.toObject ===
    'function'
      ? banner.toObject()
      : { ...banner };

  data.status =
    getBannerStatus(
      data,
      now,
    );

  data.ctr =
    data.impressions > 0
      ? Number(
          (
            (data.clicks /
              data.impressions) *
            100
          ).toFixed(2),
        )
      : 0;

  return data;
}

function buildStatusFilter(
  status,
  now,
) {
  switch (status) {
    case BANNER_STATUSES.INACTIVE:
      return {
        isActive: false,
      };

    case BANNER_STATUSES.SCHEDULED:
      return {
        isActive: true,
        startsAt: {
          $gt: now,
        },
      };

    case BANNER_STATUSES.EXPIRED:
      return {
        isActive: true,
        endsAt: {
          $lt: now,
        },
      };

    case BANNER_STATUSES.ACTIVE:
      return {
        isActive: true,

        $and: [
          {
            $or: [
              {
                startsAt: null,
              },
              {
                startsAt: {
                  $lte: now,
                },
              },
            ],
          },

          {
            $or: [
              {
                endsAt: null,
              },
              {
                endsAt: {
                  $gte: now,
                },
              },
            ],
          },
        ],
      };

    default:
      return {};
  }
}

async function validateFinalSchedule({
  startsAt,
  endsAt,
}) {
  if (
    startsAt &&
    endsAt &&
    new Date(endsAt) <=
      new Date(startsAt)
  ) {
    throw ApiError.badRequest(
      'Banner end date must be after start date',
      'INVALID_BANNER_SCHEDULE',
    );
  }
}

/*
|--------------------------------------------------------------------------
| Public
|--------------------------------------------------------------------------
*/

async function listPublicBanners({
  placement,
  limit = 10,
}) {
  const now =
    new Date();

  const banners =
    await Banner.find({
      placement,
      isActive: true,

      $and: [
        {
          $or: [
            {
              startsAt: null,
            },
            {
              startsAt: {
                $lte: now,
              },
            },
          ],
        },

        {
          $or: [
            {
              endsAt: null,
            },
            {
              endsAt: {
                $gte: now,
              },
            },
          ],
        },
      ],
    })
      .sort({
        sortOrder: 1,
        createdAt: -1,
      })
      .limit(limit)
      .lean();

  return banners.map(
    (banner) =>
      serializeBanner(
        banner,
        now,
      ),
  );
}

/*
|--------------------------------------------------------------------------
| Create
|--------------------------------------------------------------------------
*/

async function createBanner({
  adminUserId,
  data,
}) {
  await validateFinalSchedule(
    data,
  );

  const banner =
    await Banner.create({
      ...data,

      createdBy:
        adminUserId,

      updatedBy:
        adminUserId,
    });

  return serializeBanner(
    banner,
  );
}

/*
|--------------------------------------------------------------------------
| Admin Listing
|--------------------------------------------------------------------------
*/

async function listAdminBanners({
  search,
  placement,
  status,
  page = 1,
  limit = 20,
}) {
  const now =
    new Date();

  const filter = {};

  if (placement) {
    filter.placement =
      placement;
  }

  if (search) {
    const regex =
      new RegExp(
        escapeRegex(search),
        'i',
      );

    filter.$or = [
      {
        title: regex,
      },
      {
        subtitle: regex,
      },
      {
        placement: regex,
      },
      {
        'cta.label': regex,
      },
    ];
  }

  if (status) {
    Object.assign(
      filter,
      buildStatusFilter(
        status,
        now,
      ),
    );
  }

  const skip =
    (page - 1) * limit;

  const [banners, total] =
    await Promise.all([
      Banner.find(filter)
        .populate(
          'createdBy',
          'name email',
        )
        .populate(
          'updatedBy',
          'name email',
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Banner.countDocuments(
        filter,
      ),
    ]);

  return {
    banners:
      banners.map(
        (banner) =>
          serializeBanner(
            banner,
            now,
          ),
      ),

    meta: {
      page,
      limit,
      total,

      pages:
        Math.ceil(
          total / limit,
        ),
    },
  };
}

/*
|--------------------------------------------------------------------------
| Admin Detail
|--------------------------------------------------------------------------
*/

async function getAdminBanner(
  bannerId,
) {
  const banner =
    await Banner.findById(
      bannerId,
    )
      .populate(
        'createdBy',
        'name email',
      )
      .populate(
        'updatedBy',
        'name email',
      )
      .lean();

  if (!banner) {
    throw ApiError.notFound(
      'Banner not found',
      'BANNER_NOT_FOUND',
    );
  }

  return serializeBanner(
    banner,
  );
}

/*
|--------------------------------------------------------------------------
| Update
|--------------------------------------------------------------------------
*/

async function updateBanner({
  bannerId,
  adminUserId,
  data,
}) {
  const banner =
    await Banner.findById(
      bannerId,
    );

  if (!banner) {
    throw ApiError.notFound(
      'Banner not found',
      'BANNER_NOT_FOUND',
    );
  }

  const finalStartsAt =
    data.startsAt !== undefined
      ? data.startsAt
      : banner.startsAt;

  const finalEndsAt =
    data.endsAt !== undefined
      ? data.endsAt
      : banner.endsAt;

  await validateFinalSchedule({
    startsAt:
      finalStartsAt,

    endsAt:
      finalEndsAt,
  });

  const allowedFields = [
    'title',
    'subtitle',
    'placement',
    'image',
    'mobileImage',
    'cta',
    'isActive',
    'sortOrder',
    'startsAt',
    'endsAt',
  ];

  for (
    const field of
    allowedFields
  ) {
    if (
      data[field] !== undefined
    ) {
      banner[field] =
        data[field];
    }
  }

  banner.updatedBy =
    adminUserId;

  await banner.save();

  return serializeBanner(
    banner,
  );
}

/*
|--------------------------------------------------------------------------
| Active / Inactive
|--------------------------------------------------------------------------
*/

async function setBannerStatus({
  bannerId,
  adminUserId,
  isActive,
}) {
  const banner =
    await Banner.findByIdAndUpdate(
      bannerId,

      {
        $set: {
          isActive,
          updatedBy:
            adminUserId,
        },
      },

      {
        new: true,
        runValidators: true,
      },
    );

  if (!banner) {
    throw ApiError.notFound(
      'Banner not found',
      'BANNER_NOT_FOUND',
    );
  }

  return serializeBanner(
    banner,
  );
}

/*
|--------------------------------------------------------------------------
| Delete
|--------------------------------------------------------------------------
|
| DB record delete only.
| Cloudinary cleanup should remain in the project's media layer.
|--------------------------------------------------------------------------
*/

async function deleteBanner(
  bannerId,
) {
  const banner =
    await Banner.findByIdAndDelete(
      bannerId,
    );

  if (!banner) {
    throw ApiError.notFound(
      'Banner not found',
      'BANNER_NOT_FOUND',
    );
  }

  return {
    message:
      'Banner deleted successfully',
  };
}

/*
|--------------------------------------------------------------------------
| Impression
|--------------------------------------------------------------------------
*/

async function recordImpression(
  bannerId,
) {
  const now =
    new Date();

  const banner =
    await Banner.findOneAndUpdate(
      {
        _id: bannerId,

        isActive: true,

        $and: [
          {
            $or: [
              {
                startsAt: null,
              },
              {
                startsAt: {
                  $lte: now,
                },
              },
            ],
          },

          {
            $or: [
              {
                endsAt: null,
              },
              {
                endsAt: {
                  $gte: now,
                },
              },
            ],
          },
        ],
      },

      {
        $inc: {
          impressions: 1,
        },
      },

      {
        new: false,
      },
    );

  if (!banner) {
    throw ApiError.notFound(
      'Active banner not found',
      'ACTIVE_BANNER_NOT_FOUND',
    );
  }

  return {
    recorded: true,
  };
}

/*
|--------------------------------------------------------------------------
| Click
|--------------------------------------------------------------------------
*/

async function recordClick(
  bannerId,
) {
  const now =
    new Date();

  const banner =
    await Banner.findOneAndUpdate(
      {
        _id: bannerId,

        isActive: true,

        $and: [
          {
            $or: [
              {
                startsAt: null,
              },
              {
                startsAt: {
                  $lte: now,
                },
              },
            ],
          },

          {
            $or: [
              {
                endsAt: null,
              },
              {
                endsAt: {
                  $gte: now,
                },
              },
            ],
          },
        ],
      },

      {
        $inc: {
          clicks: 1,
        },
      },

      {
        new: false,
      },
    );

  if (!banner) {
    throw ApiError.notFound(
      'Active banner not found',
      'ACTIVE_BANNER_NOT_FOUND',
    );
  }

  return {
    recorded: true,
  };
}

/*
|--------------------------------------------------------------------------
| Dashboard Stats
|--------------------------------------------------------------------------
*/

async function getBannerStats() {
  const now =
    new Date();

  const banners =
    await Banner.find({})
      .select(
        'isActive startsAt endsAt impressions clicks',
      )
      .lean();

  let liveSlots = 0;
  let totalImpressions = 0;
  let totalClicks = 0;

  for (const banner of banners) {
    if (
      getBannerStatus(
        banner,
        now,
      ) ===
      BANNER_STATUSES.ACTIVE
    ) {
      liveSlots += 1;
    }

    totalImpressions +=
      banner.impressions || 0;

    totalClicks +=
      banner.clicks || 0;
  }

  const averageCtr =
    totalImpressions > 0
      ? Number(
          (
            (totalClicks /
              totalImpressions) *
            100
          ).toFixed(2),
        )
      : 0;

  return {
    totalBanners:
      banners.length,

    liveSlots,

    averageCtr,

    impressions:
      totalImpressions,

    clicks:
      totalClicks,
  };
}

module.exports = {
  listPublicBanners,

  createBanner,
  listAdminBanners,
  getAdminBanner,
  updateBanner,
  setBannerStatus,
  deleteBanner,

  recordImpression,
  recordClick,

  getBannerStats,
};