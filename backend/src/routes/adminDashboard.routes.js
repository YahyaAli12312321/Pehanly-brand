'use strict';

const router = require('express').Router();

const controller = require('../controllers/dashboard.controller');

/* GET /api/v1/admin/dashboard/summary - behind authenticate + requireStaff + analytics.read */
router.get('/summary', controller.summary);

module.exports = router;
