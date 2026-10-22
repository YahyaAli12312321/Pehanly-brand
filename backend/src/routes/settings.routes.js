'use strict';

const router = require('express').Router();

const controller = require('../controllers/settings.controller');

/* GET /api/v1/settings/public - storefront-safe subset, no authentication. */
router.get('/public', controller.getPublic);

module.exports = router;
