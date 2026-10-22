'use strict';

const mongoose = require('mongoose');

const Notification =
  require('../models/Notification');

const User =
  require('../models/User');

const fcmService =
  require('./fcm.service');

const {
  NOTIFICATION_PRIORITIES,
} = require('../constants/Notification');

/*
|--------------------------------------------------------------------------
| Admin Recipients
|--------------------------------------------------------------------------
*/

async function getActiveAdminIds() {
  const admins =
    await User.find({
      role: 'admin',
      isActive: true,
    })
      .select('_id')
      .lean();

  return admins.map(
    (admin) =>
      admin._id,
  );
}

/*
|--------------------------------------------------------------------------
| Safe Mongo Data
|--------------------------------------------------------------------------
*/

function sanitizeData(data = {}) {
  const safe = {};

  for (
    const [key, value] of
    Object.entries(data)
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    safe[key] = value;
  }

  return safe;
}

/*
|--------------------------------------------------------------------------
| FCM Data
|--------------------------------------------------------------------------
*/

function buildPushData({
  notificationId,
  type,
  entityType,
  entityId,
  actionUrl,
  data,
}) {
  return {
    notificationId:
      String(notificationId),

    type,

    ...(entityType
      ? { entityType }
      : {}),

    ...(entityId
      ? {
          entityId:
            String(entityId),
        }
      : {}),

    ...(actionUrl
      ? { actionUrl }
      : {}),

    ...sanitizeData(data),
  };
}

/*
|--------------------------------------------------------------------------
| Push One Saved Notification
|--------------------------------------------------------------------------
*/

async function pushNotification(
  notification,
) {
  try {
    const result =
      await fcmService.sendToAdmin({
        adminId:
          notification.recipient,

        title:
          notification.title,

        body:
          notification.message,

        data:
          buildPushData({
            notificationId:
              notification._id,

            type:
              notification.type,

            entityType:
              notification.entityType,

            entityId:
              notification.entityId,

            actionUrl:
              notification.actionUrl,

            data:
              notification.data,
          }),
      });

    await Notification.updateOne(
      {
        _id:
          notification._id,
      },
      {
        $set: {
          'push.attempted':
            result.attempted,

          'push.sent':
            result.sent,

          'push.sentAt':
            result.sent
              ? new Date()
              : null,

          'push.successCount':
            result.successCount || 0,

          'push.failureCount':
            result.failureCount || 0,

          'push.lastError':
            result.reason || null,
        },
      },
    );

    return result;
  } catch (error) {
    console.error(
      'Notification push failed:',
      error,
    );

    try {
      await Notification.updateOne(
        {
          _id:
            notification._id,
        },
        {
          $set: {
            'push.attempted':
              true,

            'push.sent':
              false,

            'push.lastError':
              error?.message ||
              'FCM_SEND_FAILED',
          },
        },
      );
    } catch (updateError) {
      console.error(
        'Failed to update push failure state:',
        updateError,
      );
    }

    return {
      attempted: true,
      sent: false,
      successCount: 0,
      failureCount: 0,
      reason:
        error?.message ||
        'FCM_SEND_FAILED',
    };
  }
}

/*
|--------------------------------------------------------------------------
| Notify All Admins
|--------------------------------------------------------------------------
|
| Main function used by business services.
|--------------------------------------------------------------------------
*/

async function notifyAdmins({
  type,

  title,
  message,

  priority =
    NOTIFICATION_PRIORITIES.NORMAL,

  entityType = null,
  entityId = null,

  data = {},

  actionUrl = null,

  dedupeKey = null,

  sendPush = true,
}) {
  const adminIds =
    await getActiveAdminIds();

  if (!adminIds.length) {
    return {
      created: 0,
      pushed: 0,
      notifications: [],
    };
  }

  const safeData =
    sanitizeData(data);

  const documents =
    adminIds.map(
      (adminId) => ({
        recipient:
          adminId,

        type,

        title,

        message,

        priority,

        entityType,

        entityId,

        data:
          safeData,

        actionUrl,

        /*
         * Same business event can exist for every admin,
         * but not twice for the same admin.
         */
        dedupeKey:
          dedupeKey || null,
      }),
    );

  let notifications;

  try {
    notifications =
      await Notification.insertMany(
        documents,
        {
          ordered: false,
        },
      );
  } catch (error) {
    /*
     * ordered:false allows valid records to be inserted
     * even if one recipient hits a duplicate key.
     *
     * For a duplicate event, retrieve existing records
     * rather than breaking business flow.
     */

    if (
      error?.code !== 11000 &&
      !error?.writeErrors?.some(
        (item) =>
          item?.err?.code === 11000 ||
          item?.code === 11000,
      )
    ) {
      throw error;
    }

    if (!dedupeKey) {
      throw error;
    }

    notifications =
      await Notification.find({
        recipient: {
          $in:
            adminIds,
        },

        dedupeKey,
      });
  }

  /*
   * No push required.
   *
   * Useful for low-priority notification-center-only events.
   */
  if (!sendPush) {
    return {
      created:
        notifications.length,

      pushed: 0,

      notifications:
        notifications.map(
          (item) =>
            item.toObject
              ? item.toObject()
              : item,
        ),
    };
  }

  /*
   * FCM is deliberately outside any business transaction.
   *
   * Promise.allSettled means one failed admin/device
   * does not affect others.
   */
  const pushResults =
    await Promise.allSettled(
      notifications.map(
        (notification) =>
          pushNotification(
            notification,
          ),
      ),
    );

  const pushed =
    pushResults.filter(
      (result) =>
        result.status ===
          'fulfilled' &&
        result.value?.sent,
    ).length;

  return {
    created:
      notifications.length,

    pushed,

    notifications:
      notifications.map(
        (item) =>
          item.toObject
            ? item.toObject()
            : item,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Fire And Forget Helper
|--------------------------------------------------------------------------
|
| Business services can call this AFTER transaction commit.
|
| Notification/FCM failure will never reject the order/request/payment.
|--------------------------------------------------------------------------
*/

function notifyAdminsSafe(payload) {
  Promise.resolve()
    .then(() =>
      notifyAdmins(payload),
    )
    .catch((error) => {
      console.error(
        'Admin notification failed:',
        {
          type:
            payload?.type,

          entityId:
            payload?.entityId,

          error:
            error?.message ||
            error,
        },
      );
    });
}

/*
|--------------------------------------------------------------------------
| Notification List
|--------------------------------------------------------------------------
|
| Controller/routes in Phase 2 will use these functions.
|--------------------------------------------------------------------------
*/

async function listAdminNotifications({
  adminId,
  page = 1,
  limit = 20,
  unreadOnly = false,
  type,
}) {
  const filter = {
    recipient:
      adminId,
  };

  if (unreadOnly) {
    filter.isRead = false;
  }

  if (type) {
    filter.type = type;
  }

  const skip =
    (page - 1) *
    limit;

  const [
    notifications,
    total,
    unreadCount,
  ] =
    await Promise.all([
      Notification.find(filter)
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Notification.countDocuments(
        filter,
      ),

      Notification.countDocuments({
        recipient:
          adminId,

        isRead: false,
      }),
    ]);

  return {
    notifications,

    unreadCount,

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
| Unread Count
|--------------------------------------------------------------------------
*/

async function getUnreadCount(
  adminId,
) {
  const count =
    await Notification.countDocuments({
      recipient:
        adminId,

      isRead: false,
    });

  return {
    unreadCount:
      count,
  };
}

/*
|--------------------------------------------------------------------------
| Mark One Read
|--------------------------------------------------------------------------
*/

async function markAsRead({
  notificationId,
  adminId,
}) {
  if (
    !mongoose.isValidObjectId(
      notificationId,
    )
  ) {
    return null;
  }

  return Notification.findOneAndUpdate(
    {
      _id:
        notificationId,

      recipient:
        adminId,
    },
    {
      $set: {
        isRead:
          true,

        readAt:
          new Date(),
      },
    },
    {
      new: true,
    },
  ).lean();
}

/*
|--------------------------------------------------------------------------
| Mark All Read
|--------------------------------------------------------------------------
*/

async function markAllAsRead(
  adminId,
) {
  const now =
    new Date();

  const result =
    await Notification.updateMany(
      {
        recipient:
          adminId,

        isRead:
          false,
      },
      {
        $set: {
          isRead:
            true,

          readAt:
            now,
        },
      },
    );

  return {
    modifiedCount:
      result.modifiedCount || 0,
  };
}

module.exports = {
  notifyAdmins,
  notifyAdminsSafe,

  listAdminNotifications,
  getUnreadCount,

  markAsRead,
  markAllAsRead,
};