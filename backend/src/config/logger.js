'use strict';
const pino = require('pino');
const { config } = require('./env');

module.exports = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  base: { service: 'pehanly-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
});
