'use strict';

const mongoose = require('mongoose');

/*
 * Runs fn(session) inside a MongoDB transaction and returns its result.
 *
 * - The driver may re-run fn after a transient error, so fn must only touch
 *   the database through `session` and must not mutate outside state it
 *   cannot safely repeat (build results from scratch on every call).
 * - Notifications, FCM, e-mail and audit writes belong AFTER this returns.
 * - Requires a replica set (Atlas always is).
 */
async function runInTransaction(fn) {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      result = await fn(session);
    });

    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { runInTransaction };
