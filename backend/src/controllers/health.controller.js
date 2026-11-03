'use strict';
const mongoose = require('mongoose');
const { success } = require('../utils/apiResponse');
const { dbState } = require('../config/db');

/** Liveness: the process is up. Never touches the database. */
exports.getHealth = (_req, res) =>
  success(res, {
    message: 'PEHAN LY API is running',
    data: { status: 'ok', uptimeSeconds: Math.round(process.uptime()), database: dbState() },
  });

/** Readiness: the database answers a ping. Use this for load-balancer / orchestrator checks. */
exports.getReady = async (_req, res) => {
  let database = 'down';

  try {
    if (mongoose.connection.readyState === 1) {
      await Promise.race([
        mongoose.connection.db.admin().ping(),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('ping timeout')), 2000)),
      ]);
      database = 'up';
    }
  } catch {
    database = 'down';
  }

  const ready = database === 'up';

  return res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? 'Ready' : 'Not ready',
    data: { status: ready ? 'ready' : 'unavailable', database },
    ...(ready ? {} : { code: 'NOT_READY' }),
  });
};
