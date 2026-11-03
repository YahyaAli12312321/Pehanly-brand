'use strict';

const router = require('express').Router();

const controller = require('../controllers/settings.controller');
const validators = require('../validators/settings.validators');
const validate = require('../middleware/validate');

/* Mounted by admin.routes.js behind authenticate + requireStaff + the settings permission. */
router.get('/', controller.getAdmin);

router.patch('/', validate({ body: validators.updateBody }), controller.update);

module.exports = router;
