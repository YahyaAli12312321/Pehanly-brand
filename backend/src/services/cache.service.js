'use strict';

/*
 * Cache-aside helper. Never throws and never blocks the request path for
 * long: if the cache is off or unreachable the loader runs directly.
 */

const { getCacheClient } = require('../config/redis');

const PREFIX = 'pl:v1:';

async function remember(key, ttlSeconds, loader) {
  const client = getCacheClient();

  if (client && client.status === 'ready') {
    try {
      const hit = await client.get(PREFIX + key);

      if (hit !== null) {
        return JSON.parse(hit);
      }
    } catch {
      // fall through to the loader
    }
  }

  const value = await loader();

  if (client && client.status === 'ready' && value !== undefined) {
    try {
      await client.set(PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // cache write failures are ignored
    }
  }

  return value;
}

async function invalidate(...keys) {
  const client = getCacheClient();

  if (!client || client.status !== 'ready' || keys.length === 0) return;

  try {
    await client.del(...keys.map((key) => PREFIX + key));
  } catch {
    // stale entries expire by TTL anyway
  }
}

module.exports = { remember, invalidate };
