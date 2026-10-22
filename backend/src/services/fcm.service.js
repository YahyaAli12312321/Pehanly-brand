'use strict';

const AdminDevice =
  require('../models/AdminDevice');

const {
  getFirebaseAdmin,
} = require('../config/firebase');

/*
|--------------------------------------------------------------------------
| Firebase Limits
|--------------------------------------------------------------------------
|
| Firebase multicast requests support a limited number of registration
| tokens per request.
|
| Keep batches capped at 500 tokens.
|--------------------------------------------------------------------------
*/

const FCM_BATCH_SIZE = 500;

/*
|--------------------------------------------------------------------------
| Invalid / Expired Token Error Codes
|--------------------------------------------------------------------------
|
| These errors mean that the registration token should no longer be used.
|--------------------------------------------------------------------------
*/

const INVALID_TOKEN_CODES =
  new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
  ]);

/*
|--------------------------------------------------------------------------
| Normalize FCM Data
|--------------------------------------------------------------------------
|
| FCM data payload values must be strings.
|
| Objects/arrays are JSON encoded.
| null/undefined values are skipped.
|--------------------------------------------------------------------------
*/

function normalizeData(
  data = {},
) {
  const normalized = {};

  for (
    const [key, value] of
    Object.entries(data || {})
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value ===
      'string'
    ) {
      normalized[key] =
        value;

      continue;
    }

    if (
      typeof value ===
        'number' ||
      typeof value ===
        'boolean'
    ) {
      normalized[key] =
        String(value);

      continue;
    }

    try {
      normalized[key] =
        JSON.stringify(
          value,
        );
    } catch {
      /*
       * Ignore values that cannot safely
       * be serialized into an FCM payload.
       */
    }
  }

  return normalized;
}

/*
|--------------------------------------------------------------------------
| Chunk Array
|--------------------------------------------------------------------------
*/

function chunkArray(
  items,
  size,
) {
  const chunks = [];

  for (
    let index = 0;
    index < items.length;
    index += size
  ) {
    chunks.push(
      items.slice(
        index,
        index + size,
      ),
    );
  }

  return chunks;
}

/*
|--------------------------------------------------------------------------
| Deactivate Invalid Tokens
|--------------------------------------------------------------------------
|
| Invalid FCM tokens remain in the database for audit/history purposes,
| but are marked inactive so future pushes do not use them.
|--------------------------------------------------------------------------
*/

async function deactivateInvalidTokens(
  invalidTokens,
) {
  if (
    !Array.isArray(
      invalidTokens,
    ) ||
    invalidTokens.length === 0
  ) {
    return;
  }

  const now =
    new Date();

  const operations =
    invalidTokens.map(
      ({
        token,
        reason,
      }) => ({
        updateOne: {
          filter: {
            token,
          },

          update: {
            $set: {
              isActive:
                false,

              invalidatedAt:
                now,

              invalidReason:
                String(
                  reason ||
                    'FCM_TOKEN_INVALID',
                ).slice(
                  0,
                  500,
                ),
            },
          },
        },
      }),
    );

  try {
    await AdminDevice.bulkWrite(
      operations,
      {
        ordered: false,
      },
    );
  } catch (error) {
    /*
     * Token cleanup failure must never make
     * notification delivery/business flow fail.
     */
    console.error(
      'Failed to deactivate invalid FCM tokens:',
      error,
    );
  }
}

/*
|--------------------------------------------------------------------------
| Send One Batch
|--------------------------------------------------------------------------
*/

async function sendBatch({
  firebaseAdmin,

  devices,

  title,

  body,

  data,
}) {
  const tokens =
    devices.map(
      (device) =>
        device.token,
    );

  const response =
    await firebaseAdmin
      .messaging()
      .sendEachForMulticast({
        tokens,

        notification: {
          title,
          body,
        },

        data:
          normalizeData(
            data,
          ),

        /*
         * Android priority.
         */
        android: {
          priority: 'high',
        },

        /*
         * APNs/Web implementations can still
         * use the common notification + data payload.
         */
      });

  const invalidTokens = [];

  response.responses.forEach(
    (
      result,
      index,
    ) => {
      if (result.success) {
        return;
      }

      const errorCode =
        result.error?.code;

      if (
        INVALID_TOKEN_CODES.has(
          errorCode,
        )
      ) {
        invalidTokens.push({
          token:
            tokens[index],

          reason:
            errorCode,
        });
      }
    },
  );

  /*
   * Cleanup is intentionally best-effort.
   */
  await deactivateInvalidTokens(
    invalidTokens,
  );

  return {
    successCount:
      response.successCount ||
      0,

    failureCount:
      response.failureCount ||
      0,

    invalidCount:
      invalidTokens.length,
  };
}

/*
|--------------------------------------------------------------------------
| Send To One Admin
|--------------------------------------------------------------------------
|
| Main function used by notification.service.js.
|
| One admin may have:
| - Desktop browser
| - Laptop browser
| - Android
| - iPhone
|
| All active registrations receive the notification.
|--------------------------------------------------------------------------
*/

async function sendToAdmin({
  adminId,

  title,

  body,

  data = {},
}) {
  /*
   * Firebase is optional in environments
   * where credentials have not been configured.
   */
  const firebaseAdmin =
    getFirebaseAdmin();

  if (!firebaseAdmin) {
    return {
      attempted:
        false,

      sent:
        false,

      successCount:
        0,

      failureCount:
        0,

      reason:
        'FIREBASE_NOT_CONFIGURED',
    };
  }

  /*
   * Only active device registrations.
   */
  const devices =
    await AdminDevice.find({
      admin:
        adminId,

      isActive:
        true,
    })
      .select(
        '_id token platform deviceId',
      )
      .lean();

  if (!devices.length) {
    return {
      attempted:
        false,

      sent:
        false,

      successCount:
        0,

      failureCount:
        0,

      reason:
        'NO_ACTIVE_ADMIN_DEVICES',
    };
  }

  /*
   * Defensive token cleanup.
   *
   * Unique token index should already prevent
   * duplicates, but this protects delivery if
   * legacy data exists.
   */
  const uniqueDevices = [];

  const seenTokens =
    new Set();

  for (
    const device of
    devices
  ) {
    if (
      !device.token ||
      seenTokens.has(
        device.token,
      )
    ) {
      continue;
    }

    seenTokens.add(
      device.token,
    );

    uniqueDevices.push(
      device,
    );
  }

  if (
    uniqueDevices.length ===
    0
  ) {
    return {
      attempted:
        false,

      sent:
        false,

      successCount:
        0,

      failureCount:
        0,

      reason:
        'NO_VALID_ADMIN_DEVICE_TOKENS',
    };
  }

  /*
   * Maximum 500 tokens per multicast request.
   */
  const batches =
    chunkArray(
      uniqueDevices,
      FCM_BATCH_SIZE,
    );

  let successCount = 0;
  let failureCount = 0;

  let firstError = null;

  /*
   * Process every batch independently.
   *
   * A failed batch must not stop the remaining
   * admin devices from receiving their push.
   */
  for (
    const devicesBatch of
    batches
  ) {
    try {
      const result =
        await sendBatch({
          firebaseAdmin,

          devices:
            devicesBatch,

          title,

          body,

          data,
        });

      successCount +=
        result.successCount;

      failureCount +=
        result.failureCount;
    } catch (error) {
      /*
       * Entire Firebase batch failed.
       */
      failureCount +=
        devicesBatch.length;

      if (!firstError) {
        firstError =
          error?.message ||
          'FCM_BATCH_SEND_FAILED';
      }

      console.error(
        'FCM batch send failed:',
        {
          adminId:
            String(
              adminId,
            ),

          deviceCount:
            devicesBatch.length,

          error:
            error?.message ||
            error,
        },
      );
    }
  }

  return {
    attempted:
      true,

    sent:
      successCount > 0,

    successCount,

    failureCount,

    reason:
      firstError,
  };
}

/*
|--------------------------------------------------------------------------
| Send To Multiple Admins
|--------------------------------------------------------------------------
|
| Optional reusable helper.
|
| notification.service.js currently creates one Notification per admin and
| calls sendToAdmin(), but this helper can be useful elsewhere later.
|--------------------------------------------------------------------------
*/

async function sendToAdmins({
  adminIds,

  title,

  body,

  data = {},
}) {
  const ids = [
    ...new Set(
      (adminIds || [])
        .filter(Boolean)
        .map(
          (id) =>
            String(id),
        ),
    ),
  ];

  if (!ids.length) {
    return {
      attempted:
        false,

      sent:
        false,

      successCount:
        0,

      failureCount:
        0,

      reason:
        'NO_ADMIN_IDS',
    };
  }

  const results =
    await Promise.allSettled(
      ids.map(
        (adminId) =>
          sendToAdmin({
            adminId,

            title,

            body,

            data,
          }),
      ),
    );

  let attempted = false;
  let successCount = 0;
  let failureCount = 0;

  for (
    const result of
    results
  ) {
    if (
      result.status ===
      'fulfilled'
    ) {
      attempted =
        attempted ||
        Boolean(
          result.value
            ?.attempted,
        );

      successCount +=
        result.value
          ?.successCount ||
        0;

      failureCount +=
        result.value
          ?.failureCount ||
        0;
    } else {
      failureCount += 1;

      console.error(
        'FCM admin send failed:',
        result.reason,
      );
    }
  }

  return {
    attempted,

    sent:
      successCount > 0,

    successCount,

    failureCount,

    reason:
      null,
  };
}

module.exports = {
  sendToAdmin,
  sendToAdmins,
};