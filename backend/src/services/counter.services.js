'use strict';

const Counter = require('../models/Counter.model');

/*
 * Accepts every call shape used in the codebase:
 *   nextSequence(key)                      -> no session
 *   nextSequence(key, { session })         -> options object
 *   nextSequence(key, session)             -> a MongoDB ClientSession passed directly
 *   nextSequence(key, null)                -> no session
 */
function resolveSession(options) {
  if (!options) return undefined;
  if (typeof options.inTransaction === 'function') return options;
  return options.session || undefined;
}

async function nextSequence(key, options = {}) {
  const normalizedKey = String(key ?? '').trim().toLowerCase();

  if (!normalizedKey) {
    throw new Error('Counter key is required');
  }

  const session = resolveSession(options);

  const queryOptions = {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  };

  if (session) {
    queryOptions.session = session;
  }

  const run = () =>
    Counter.findOneAndUpdate(
      { key: normalizedKey },
      { $inc: { sequence: 1 } },
      queryOptions,
    );

  let counter;

  try {
    counter = await run();
  } catch (error) {
    /*
     * Two requests creating the same counter for the first time can collide on the
     * unique key. Outside a transaction a single retry resolves it. Inside a
     * transaction MongoDB reports the collision as a transient conflict and
     * withTransaction() retries the whole callback, so nothing is done here.
     */
    if (!session && error && error.code === 11000) {
      counter = await run();
    } else {
      throw error;
    }
  }

  return counter.sequence;
}

module.exports = {
  nextSequence,
};
