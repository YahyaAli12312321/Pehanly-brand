'use strict';

const AdminDevice =
  require('../models/AdminDevice');

const ApiError =
  require('../utils/ApiError');

/*
|--------------------------------------------------------------------------
| Register / Refresh Device
|--------------------------------------------------------------------------
|
| FCM token rotate ho sakta hai.
|
| Same token dobara aaye:
| → existing record update.
|
| Same deviceId ke liye new token aaye:
| → old registration replace.
|--------------------------------------------------------------------------
*/

async function registerDevice({
  adminId,
  token,
  platform,
  deviceName,
  deviceId,
}) {
  const now =
    new Date();

  /*
  |--------------------------------------------------------------------------
  | Existing FCM Token
  |--------------------------------------------------------------------------
  |
  | Same token can be refreshed by the same admin.
  |
  | Never silently transfer a token from one admin account
  | to another admin account.
  |--------------------------------------------------------------------------
  */

  const tokenDevice =
    await AdminDevice.findOne({
      token,
    });

  if (tokenDevice) {
    if (
      String(tokenDevice.admin) !==
      String(adminId)
    ) {
      throw ApiError.conflict(
        'This device token is already registered to another admin account',
        'DEVICE_TOKEN_ALREADY_REGISTERED',
      );
    }

    /*
     * If frontend supplied a deviceId, ensure this
     * admin does not already have another registration
     * for the same physical/browser installation.
     */
    if (deviceId) {
      await AdminDevice.deleteMany({
        admin:
          adminId,

        deviceId,

        _id: {
          $ne:
            tokenDevice._id,
        },
      });
    }

    tokenDevice.platform =
      platform;

    if (
      deviceName !== undefined
    ) {
      tokenDevice.deviceName =
        deviceName;
    }

    if (
      deviceId !== undefined
    ) {
      tokenDevice.deviceId =
        deviceId;
    }

    tokenDevice.isActive =
      true;

    tokenDevice.lastSeenAt =
      now;

    tokenDevice.invalidatedAt =
      null;

    tokenDevice.invalidReason =
      null;

    await tokenDevice.save();

    return tokenDevice.toObject();
  }

  /*
  |--------------------------------------------------------------------------
  | FCM Token Rotation
  |--------------------------------------------------------------------------
  |
  | Same browser/app installation may receive a new FCM token.
  |
  | deviceId identifies that installation.
  |--------------------------------------------------------------------------
  */

  if (deviceId) {
    const existingDevice =
      await AdminDevice.findOne({
        admin:
          adminId,

        deviceId,
      });

    if (existingDevice) {
      existingDevice.token =
        token;

      existingDevice.platform =
        platform;

      if (
        deviceName !== undefined
      ) {
        existingDevice.deviceName =
          deviceName;
      }

      existingDevice.isActive =
        true;

      existingDevice.lastSeenAt =
        now;

      existingDevice.invalidatedAt =
        null;

      existingDevice.invalidReason =
        null;

      try {
        await existingDevice.save();
      } catch (error) {
        if (error?.code === 11000) {
          throw ApiError.conflict(
            'Device registration conflict',
            'DEVICE_REGISTRATION_CONFLICT',
          );
        }

        throw error;
      }

      return existingDevice.toObject();
    }
  }

  /*
  |--------------------------------------------------------------------------
  | New Device
  |--------------------------------------------------------------------------
  */

  try {
    const device =
      await AdminDevice.create({
        admin:
          adminId,

        token,

        platform,

        deviceName:
          deviceName || null,

        deviceId:
          deviceId || null,

        isActive:
          true,

        lastSeenAt:
          now,

        invalidatedAt:
          null,

        invalidReason:
          null,
      });

    return device.toObject();
  } catch (error) {
    /*
     * Concurrent requests may race against the unique
     * token/device indexes.
     */
    if (error?.code === 11000) {
      throw ApiError.conflict(
        'Device registration already exists',
        'DEVICE_REGISTRATION_CONFLICT',
      );
    }

    throw error;
  }
}
/*
|--------------------------------------------------------------------------
| List My Devices
|--------------------------------------------------------------------------
*/

async function listDevices(
  adminId,
) {
  return AdminDevice.find({
    admin:
      adminId,
  })
    .select(
      '-token',
    )
    .sort({
      updatedAt: -1,
    })
    .lean();
}

/*
|--------------------------------------------------------------------------
| Remove One Device
|--------------------------------------------------------------------------
|
| Hard delete is okay here because FCM token
| registrations are operational records.
|--------------------------------------------------------------------------
*/

async function removeDevice({
  adminId,
  deviceId,
}) {
  const device =
    await AdminDevice.findOneAndDelete({
      _id:
        deviceId,

      admin:
        adminId,
    }).lean();

  if (!device) {
    throw ApiError.notFound(
      'Admin device not found',
      'ADMIN_DEVICE_NOT_FOUND',
    );
  }

  return {
    removed: true,
  };
}

/*
|--------------------------------------------------------------------------
| Remove Current Token
|--------------------------------------------------------------------------
|
| Useful during logout because frontend usually
| already knows its FCM token.
|--------------------------------------------------------------------------
*/

async function removeDeviceByToken({
  adminId,
  token,
}) {
  const result =
    await AdminDevice.deleteOne({
      admin:
        adminId,

      token,
    });

  return {
    removed:
      result.deletedCount > 0,
  };
}

module.exports = {
  registerDevice,
  listDevices,
  removeDevice,
  removeDeviceByToken,
};