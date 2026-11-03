'use strict';

const router = require('express').Router();

const controller = require('../controllers/media.controller');
const validators = require('../validators/media.validators');
const validate = require('../middleware/validate');

/* Mounted by admin.routes.js behind authenticate + requireStaff + the media permission. */
router.get('/', validate({ query: validators.listQuery }), controller.listAll);

router.post('/cleanup', validate({ body: validators.cleanupBody }), controller.cleanup);

module.exports = router;
