'use strict';

const { MemoryStore } = require('express-rate-limit');

const logger = require('../config/logger');

/*
 * Fixed-window counter shared by every API instance through the cache Redis/KeyDB.
 *
 * - One Lua call per request: INCR, set the expiry on the first hit, read the remaining TTL.
 * - If Redis is unreachable the store falls back to an in-process MemoryStore, so limits still
 *   apply (per instance) and requests are never failed because the cache is down.
 * - Eviction (allkeys-lru) can only reset a counter early; it can never lock anyone out.
 */

const SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return { hits, ttl }
`;

class RedisRateLimitStore {
  constructor({ client, prefix = 'rl:' }) {
    this.client = client;
    this.prefix = prefix;
    this.windowMs = 60000;
    this.memory = new MemoryStore();
    this.warned = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  key(key) {
    return `${this.prefix}${key}`;
  }

  fallback(error) {
    if (!this.warned) {
      this.warned = true;
      logger.warn({ err: error.message }, 'Shared rate limiting unavailable; using per-instance counters');
    }
  }

  async increment(key) {
    try {
      const [totalHits, ttl] = await this.client.eval(SCRIPT, 1, this.key(key), String(this.windowMs));

      this.warned = false;

      return { totalHits: Number(totalHits), resetTime: new Date(Date.now() + Number(ttl)) };
    } catch (error) {
      this.fallback(error);

      return this.memory.increment(key);
    }
  }

  async decrement(key) {
    try {
      await this.client.decr(this.key(key));
    } catch (error) {
      this.fallback(error);
      await this.memory.decrement(key);
    }
  }

  async resetKey(key) {
    try {
      await this.client.del(this.key(key));
    } catch (error) {
      this.fallback(error);
      await this.memory.resetKey(key);
    }
  }
}

module.exports = { RedisRateLimitStore, SCRIPT };
