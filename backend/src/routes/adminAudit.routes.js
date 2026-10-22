'use strict';

const router = require('express').Router();

const controller = require('../controllers/auditLog.controller');
const validators = require('../validators/audit.validators');
const validate = require('../middleware/validate');

/* Mounted by admin.routes.js behind authenticate + requireStaff + requireAdmin (owner only). */
router.get('/', validate({ query: validators.listQuery }), controller.list);

module.exports = router;
