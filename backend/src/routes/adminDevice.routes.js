'use strict';

const router =
  require('express').Router();

const {
  validate,
} = require('../middleware/validate');

const asyncHandler =
  require('../utils/asyncHandler');

const controller =
  require('../controllers/adminDevice.controller');

const {
  registerDeviceBody,
  unregisterDeviceBody,
  deviceIdParams,
} = require(
  '../validators/notification.validators',
);

/*
|--------------------------------------------------------------------------
| Register / Refresh FCM Device
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  validate({
    body:
      registerDeviceBody,
  }),
  asyncHandler(
    controller.registerDevice,
  ),
);

/*
|--------------------------------------------------------------------------
| List Current Admin Devices
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  asyncHandler(
    controller.listDevices,
  ),
);

/*
|--------------------------------------------------------------------------
| Logout Current Browser/App
|--------------------------------------------------------------------------
*/

router.post(
  '/unregister',
  validate({
    body:
      unregisterDeviceBody,
  }),
  asyncHandler(
    controller.unregisterCurrentDevice,
  ),
);

/*
|--------------------------------------------------------------------------
| Remove Specific Device
|--------------------------------------------------------------------------
*/

router.delete(
  '/:deviceId',
  validate({
    params:
      deviceIdParams,
  }),
  asyncHandler(
    controller.removeDevice,
  ),
);

module.exports = router;