'use strict';

/*
|--------------------------------------------------------------------------
| KeyDB / Redis connections (OPTIONAL)
|--------------------------------------------------------------------------
|
| MongoDB stays the single source of truth. Redis-compatible storage is used
| only for:
|   cache  - disposable read cache (CACHE_URL). Eviction policy: allkeys-lru.
|   queue  - BullMQ background jobs (QUEUE_URL). Eviction policy: noeviction.
|
| Use two separate instances (or two databases with different policies):
| a cache may drop keys, a queue must never lose them.
|
| When a URL is not set the feature is simply off and the API behaves
| exactly as before. A cache outage never fails a request.
|--------------------------------------------------------------------------
*/

const Redis = require('ioredis');

const { config } = require('./env');
const logger = require('./logger');

let cacheClient = null;
let cacheFailedLogged = false;

function getCacheClient() {
  if (!config.redis.cacheUrl) return null;

  if (!cacheClient) {
    cacheClient = new Redis(config.redis.cacheUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
    });

    cacheClient.on('error', (error) => {
      if (!cacheFailedLogged) {
        cacheFailedLogged = true;
        logger.warn({ err: error.message }, 'Cache unavailable; continuing without it');
      }
    });

    cacheClient.on('ready', () => {
      cacheFailedLogged = false;
    });

    cacheClient.connect().catch(() => {});
  }

  return cacheClient;
}

/** BullMQ needs maxRetriesPerRequest:null and its own connection. */
function createQueueConnection() {
  if (!config.redis.queueUrl) return null;

  return new Redis(config.redis.queueUrl, { maxRetriesPerRequest: null });
}

async function closeRedis() {
  if (cacheClient) {
    await cacheClient.quit().catch(() => {});
    cacheClient = null;
  }
}

module.exports = {
  getCacheClient,
  createQueueConnection,
  closeRedis,
};
