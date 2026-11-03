'use strict';

const router = require('express').Router();
const { validate } = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/whatsapp.controller');
const { whatsappIdParams, whatsappListQuery, whatsappTestBody } = require('../validators/whatsapp.validators');

/* Mounted at /api/v1/admin/notifications/whatsapp. OWNER-ONLY: the parent mount applies authenticate + requireStaff + requireAdmin. */

router.get('/', validate({ query: whatsappListQuery }), asyncHandler(controller.list));
router.get('/config', asyncHandler(controller.config));
router.post('/test', validate({ body: whatsappTestBody }), asyncHandler(controller.test));
router.get('/:id', validate({ params: whatsappIdParams }), asyncHandler(controller.getOne));
router.post('/:id/retry', validate({ params: whatsappIdParams }), asyncHandler(controller.retry));

module.exports = router;
