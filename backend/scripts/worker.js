'use strict';

/*
 * Background worker.
 *
 *   node scripts/worker.js --once          run every maintenance task once and exit (cron friendly)
 *   node scripts/worker.js --task=<name>   run one task (e.g. whatsapp-daily-summary from your own cron at the time you want it)
 *   node scripts/worker.js                 BullMQ worker with repeatable jobs (needs QUEUE_URL)
 *
 * The queue Redis/KeyDB MUST use maxmemory-policy "noeviction". Jobs here are
 * maintenance only; order, stock and payment state changes never go through
 * the queue.
 */

const { config } = require('../src/config/env');
const logger = require('../src/config/logger');
const { connectDB, disconnectDB } = require('../src/config/db');
const { createQueueConnection } = require('../src/config/redis');
const { TASKS, runTask } = require('../src/jobs/maintenance');

const SCHEDULE = Object.freeze({
  'expire-quotes': { every: 15 * 60 * 1000 },
  'cleanup-media': { every: 24 * 60 * 60 * 1000 },
  'whatsapp-retry-failed': { every: 5 * 60 * 1000 },
  'whatsapp-daily-summary': { pattern: '0 21 * * *', tz: process.env.TZ || 'Asia/Karachi' }, // 21:00 business time
});

// Not part of the cron-friendly --once sweep (it would send a partial day's summary on the first run of the day).
const ON_DEMAND = new Set(['whatsapp-daily-summary']);

async function runOnce() {
  await connectDB();

  const only = (process.argv.find((a) => a.startsWith('--task=')) || '').slice('--task='.length);
  const names = only ? [only] : Object.keys(TASKS).filter((n) => !ON_DEMAND.has(n));

  for (const name of names) {
    try {
      await runTask(name);
    } catch (error) {
      process.exitCode = 1;
      logger.error({ err: error.message, task: name }, 'Maintenance task failed');
    }
  }

  await disconnectDB();
}

async function runWorker() {
  if (!config.redis.queueUrl) {
    throw new Error('QUEUE_URL is not set. Use --once for cron, or configure a queue instance.');
  }

  const { Queue, Worker } = require('bullmq');

  await connectDB();

  const queue = new Queue('maintenance', { connection: createQueueConnection() });

  for (const [name, repeat] of Object.entries(SCHEDULE)) {
    await queue.add(name, {}, { repeat, removeOnComplete: 50, removeOnFail: 200 });
  }

  const worker = new Worker('maintenance', (job) => runTask(job.name), {
    connection: createQueueConnection(),
    concurrency: 1,
  });

  worker.on('failed', (job, error) => {
    logger.error({ err: error.message, task: job?.name }, 'Maintenance job failed');
  });

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('Maintenance worker started');
}

(process.argv.includes('--once') || process.argv.some((a) => a.startsWith('--task=')) ? runOnce() : runWorker()).catch((error) => {
  logger.error({ err: error.message }, 'Worker failed to start');
  process.exit(1);
});
