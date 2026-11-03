'use strict';

const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load <project root>/.env (never overrides variables already set in the environment).
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { config } = require('./env');
const logger = require('./logger');
const { resolveMongoUri, assertSafeConnectionName, describeTarget } = require('./mongoUri');

mongoose.set('strictQuery', true);

let listenersAttached = false;
function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  const c = mongoose.connection;
  c.on('disconnected', () => logger.warn('MongoDB disconnected'));
  c.on('reconnected', () => logger.info('MongoDB reconnected'));
  c.on('error', (err) => logger.error({ err: err.message }, 'MongoDB connection error'));
}

async function connectDB() {
  attachListeners();

  // Already connected, or a connection is in progress: reuse it.
  if (mongoose.connection.readyState === 1) return;
  if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise();
    return;
  }

  // development/production: MONGODB_URI. test: MONGODB_TEST_URI only (throws a clear error if missing or unsafe).
  const uri = resolveMongoUri(process.env);
  const target = describeTarget(uri);

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMS,
      maxPoolSize: config.mongo.maxPoolSize,
      autoIndex: config.mongo.autoIndex,
    });

    assertSafeConnectionName(mongoose.connection.name, process.env);
  } catch (err) {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }

    logger.error({ err: err.message, target }, 'MongoDB connection failed');
    err.message = `${err.message} (target: ${target})`;
    throw err;
  }

  logger.info({ target }, 'MongoDB connected');
}

/** True for failures worth retrying at startup (DNS / network / server selection), not for bad credentials or config. */
function isTransientConnectError(err) {
  const text = `${err?.code || ''} ${err?.name || ''} ${err?.message || ''}`;
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNRESET|querySrv|querytxt|MongoServerSelectionError|MongoNetworkError/i.test(text);
}

/** Plain-language hint for the most common Atlas startup failure. */
function connectHint(err) {
  const m = String(err?.message || '');
  if (/querySrv|querytxt/i.test(m)) {
    return 'DNS lookup of the mongodb+srv:// record failed (this machine could not resolve it; it is not a wrong password). Check internet/VPN/DNS, or use the non-SRV "standard connection string" from Atlas.';
  }
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(m)) return 'The database host could not be reached. Check network access and the Atlas IP access list.';
  return null;
}

/**
 * connectDB with bounded retries for transient startup failures, so a brief DNS/network blip does not kill
 * the API (and make the frontend proxy report ECONNREFUSED). Non-transient errors fail immediately.
 */
async function connectDBWithRetry({ retries = config.mongo.connectRetries, delayMs = config.mongo.connectRetryDelayMs, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), connect = connectDB } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await connect();
    } catch (err) {
      const hint = connectHint(err);
      if (attempt >= retries || !isTransientConnectError(err)) {
        if (hint) err.message = `${err.message} - ${hint}`;
        throw err;
      }
      logger.warn({ attempt: attempt + 1, of: retries + 1, retryInMs: delayMs, hint }, 'MongoDB not reachable yet, retrying');
      await sleep(delayMs);
    }
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

function dbState() {
  return ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown';
}

module.exports = { connectDB, connectDBWithRetry, isTransientConnectError, connectHint, disconnectDB, dbState };
