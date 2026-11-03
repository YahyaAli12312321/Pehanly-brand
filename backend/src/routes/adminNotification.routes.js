'use strict';

const router =
  require('express').Router();

const {
  validate,
} = require('../middleware/validate');

const asyncHandler =
  require('../utils/asyncHandler');

const controller =
  require('../controllers/notification.controller');

const {
  notificationListQuery,
  notificationIdParams,
} = require(
  '../validators/notification.validators',
);

/*
|--------------------------------------------------------------------------
| Notification Center
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  validate({
    query:
      notificationListQuery,
  }),
  asyncHandler(
    controller.listNotifications,
  ),
);

/*
|--------------------------------------------------------------------------
| Bell Badge
|--------------------------------------------------------------------------
*/

router.get(
  '/unread-count',
  asyncHandler(
    controller.getUnreadCount,
  ),
);

/*
|--------------------------------------------------------------------------
| Mark All Read
|--------------------------------------------------------------------------
|
| Must remain before /:notificationId/read
| for clean routing semantics.
|--------------------------------------------------------------------------
*/

router.patch(
  '/read-all',
  asyncHandler(
    controller.markAllAsRead,
  ),
);

/*
|--------------------------------------------------------------------------
| Mark One Read
|--------------------------------------------------------------------------
*/

router.patch(
  '/:notificationId/read',
  validate({
    params:
      notificationIdParams,
  }),
  asyncHandler(
    controller.markAsRead,
  ),
);

module.exports = router;