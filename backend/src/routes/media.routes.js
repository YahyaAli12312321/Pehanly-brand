'use strict';

const router = require('express').Router();

const controller = require('../controllers/media.controller');
const validators = require('../validators/media.validators');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { uploadSingleFile } = require('../middleware/upload');
const { createRateLimiter } = require('../middleware/rateLimiter');

/*
 * Mounted at /api/v1/media. Every route needs a signed-in, active user.
 * Which PURPOSES a user may upload is decided in media.service (staff-only
 * purposes need admin or the media.manage permission).
 */
router.use(authenticate);

const uploadLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  code: 'UPLOAD_RATE_LIMITED',
  message: 'Too many uploads, please try again later',
});

router.post(
  '/',
  uploadLimiter,
  uploadSingleFile,
  validate({ body: validators.uploadBody }),
  controller.upload,
);

router.get('/mine', validate({ query: validators.listQuery }), controller.listMine);

router.delete('/:id', validate({ params: validators.idParams }), controller.remove);

module.exports = router;
