'use strict';
const { config } = require('./src/config/env');
const logger = require('./src/config/logger');
const { connectDBWithRetry, disconnectDB } = require('./src/config/db');
const { createApp } = require('./src/app');
const { policy } = require('./src/middleware/originGuard');

let server;
let shuttingDown = false;

async function start() {
  await connectDBWithRetry();
  const app = createApp();
  server = app.listen(config.port, () => {
    // Printing the effective origins makes a stale CORS_ORIGINS (e.g. a variable exported in the shell,
    // which overrides .env) visible immediately instead of surfacing later as a 403.
    logger.info({ port: config.port, env: config.env, corsOrigins: policy.list(), clientUrl: config.clientUrl }, 'PEHAN LY API listening');
  });
}

async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, 'Shutting down');

  const force = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, config.shutdownTimeoutMs);
  force.unref();

  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    logger.info('Shutdown complete');
    process.exit(exitCode);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'Unhandled promise rejection');
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  shutdown('uncaughtException', 1);
});

start().catch((err) => {
  logger.fatal({ err: err.message }, 'Failed to start server');
  process.exit(1);
});
