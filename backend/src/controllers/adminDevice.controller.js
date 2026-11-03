'use strict';

const adminDeviceService =
  require('../services/adminDevice.service');

const response =
  require('../utils/apiResponse');

/*
|--------------------------------------------------------------------------
| Register Device
|--------------------------------------------------------------------------
*/

async function registerDevice(
  req,
  res,
) {
  const device =
    await adminDeviceService.registerDevice({
      adminId:
        req.user._id,

      ...req.validated.body,
    });

  return response.success(
    res,
    {
      data:
        device,
    },
  );
}

/*
|--------------------------------------------------------------------------
| List Devices
|--------------------------------------------------------------------------
*/

async function listDevices(
  req,
  res,
) {
  const devices =
    await adminDeviceService.listDevices(
      req.user._id,
    );

  return response.success(
    res,
    {
      data:
        devices,
    },
  );
}

/*
|--------------------------------------------------------------------------
| Remove Device
|--------------------------------------------------------------------------
*/

async function removeDevice(
  req,
  res,
) {
  const data =
    await adminDeviceService.removeDevice({
      adminId:
        req.user._id,

      deviceId:
        req.validated.params
          .deviceId,
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
| Logout / Unregister Current FCM Token
|--------------------------------------------------------------------------
*/

async function unregisterCurrentDevice(
  req,
  res,
) {
  const data =
    await adminDeviceService.removeDeviceByToken({
      adminId:
        req.user._id,

      token:
        req.validated.body.token,
    });

  return response.success(
    res,
    {
      data,
    },
  );
}

module.exports = {
  registerDevice,
  listDevices,
  removeDevice,
  unregisterCurrentDevice,
};