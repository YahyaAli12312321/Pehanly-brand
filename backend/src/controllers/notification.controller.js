'use strict';

const notificationService =
  require('../services/notification.service');

const ApiError =
  require('../utils/ApiError');

const response =
  require('../utils/apiResponse');

/*
|--------------------------------------------------------------------------
| List Notifications
|--------------------------------------------------------------------------
*/

async function listNotifications(
  req,
  res,
) {
  const data =
    await notificationService.listAdminNotifications({
      adminId:
        req.user._id,

      ...req.validated.query,
    });

  return response.success(
    res,
    {
      data,
    },
  );
}

/*
|--------------------------------------------------------------------------
| Unread Count
|--------------------------------------------------------------------------
*/

async function getUnreadCount(
  req,
  res,
) {
  const data =
    await notificationService.getUnreadCount(
      req.user._id,
    );

  return response.success(
    res,
    {
      data,
    },
  );
}

/*
|--------------------------------------------------------------------------
| Mark One Read
|--------------------------------------------------------------------------
*/

async function markAsRead(
  req,
  res,
) {
  const notification =
    await notificationService.markAsRead({
      notificationId:
        req.validated.params
          .notificationId,

      adminId:
        req.user._id,
    });

  if (!notification) {
    throw ApiError.notFound(
      'Notification not found',
      'NOTIFICATION_NOT_FOUND',
    );
  }

  return response.success(
    res,
    {
      data:
        notification,
    },
  );
}

/*
|--------------------------------------------------------------------------
| Mark All Read
|--------------------------------------------------------------------------
*/

async function markAllAsRead(
  req,
  res,
) {
  const data =
    await notificationService.markAllAsRead(
      req.user._id,
    );

  return response.success(
    res,
    {
      data,
    },
  );
}

module.exports = {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};