'use strict';
const router = require('express').Router();
const { getHealth, getReady } = require('../controllers/health.controller');

router.get('/', getHealth);
router.get('/ready', getReady);

module.exports = router;
