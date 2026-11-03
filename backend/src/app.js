'use strict';
const express = require('express');
const helmet = require('helmet');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');

const { config } = require('./config/env');
const logger = require('./config/logger');
const requestId = require('./middleware/requestId');
const corsMiddleware = require('./middleware/cors');
const { sanitizeInput } = require('./middleware/sanitize');
const { globalLimiter } = require('./middleware/rateLimiter');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const csrfOrigin = require('./middleware/csrfOrigin');
const routes = require('./routes');

const API_PREFIX = '/api/v1';

/** @param {{ mountExtras?: (app: import('express').Express) => void }} [opts] mountExtras is for tests only. */
function createApp({ mountExtras } = {}) {
  const app = express();

  app.disable('x-powered-by');
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => req.id, autoLogging: !config.isTest }));
  app.use(helmet()); // API-only: default CSP/headers are appropriate
  app.use(corsMiddleware);
  app.use(compression());

  app.use(express.json({ limit: config.limits.body }));
  app.use(express.urlencoded({ extended: false, limit: config.limits.body }));
  app.use(cookieParser());
  app.use(hpp());
  app.use(sanitizeInput);
  app.use(csrfOrigin);

  app.use(API_PREFIX, globalLimiter, routes);
  if (mountExtras) mountExtras(app);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp, API_PREFIX };
