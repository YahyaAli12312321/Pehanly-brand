'use strict';

/*
 * Idempotent maintenance tasks. Safe to run from BullMQ, cron or by hand.
 * None of them changes stock or payment state.
 */

const Quote = require('../models/Quote');
const logger = require('../config/logger');
const { QUOTE_STATUSES } = require('../constants/Quote');
const quoteService = require('../services/quote.service');
const mediaService = require('../services/media.service');
const { config } = require('../config/env');

/** Moves overdue draft/sent quotes to "expired" and reopens their source request. */
async function expireQuotes(limit = 200) {
  const overdue = await Quote.find({
    status: { $in: [QUOTE_STATUSES.DRAFT, QUOTE_STATUSES.SENT] },
    validUntil: { $ne: null, $lt: new Date() },
  })
    .select('_id')
    .limit(limit)
    .lean();

  let expired = 0;

  for (const { _id } of overdue) {
    try {
      if (await quoteService.markQuoteExpired(_id)) expired += 1;
    } catch (error) {
      logger.error({ err: error.message, quote: String(_id) }, 'Quote expiry failed');
    }
  }

  return { scanned: overdue.length, expired };
}

/** Removes uploads that were never attached to anything (older than 24h). */
async function cleanupMedia() {
  if (!config.cloudinary.configured) {
    return { skipped: 'cloudinary not configured' };
  }

  return mediaService.cleanupOrphans({ olderThanHours: 24 });
}

const TASKS = Object.freeze({
  'expire-quotes': expireQuotes,
  'cleanup-media': cleanupMedia,
});

async function runTask(name) {
  const task = TASKS[name];

  if (!task) {
    throw new Error(`Unknown maintenance task: ${name}`);
  }

  const result = await task();
  logger.info({ task: name, result }, 'Maintenance task finished');
  return result;
}

module.exports = { TASKS, runTask, expireQuotes, cleanupMedia };
