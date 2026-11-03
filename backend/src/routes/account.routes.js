'use strict';

const router = require('express').Router();

const controller = require('../controllers/account.controller');
const validators = require('../validators/account.validators');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimiter');

/* Mounted at /api/v1/account. Everything here is about the signed-in user's OWN account. */
router.use(authenticate);

const passwordLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  code: 'AUTH_RATE_LIMITED',
  message: 'Too many attempts. Try again later.',
});

router.get('/', controller.getProfile);
router.patch('/', validate({ body: validators.updateProfileBody }), controller.updateProfile);

router.post('/change-password', passwordLimiter, validate({ body: validators.changePasswordBody }), controller.changePassword);
router.post('/logout-other-sessions', controller.logoutOtherSessions);

router.get('/addresses', controller.listAddresses);
router.post('/addresses', validate({ body: validators.addressBody }), controller.addAddress);
router.patch(
  '/addresses/:addressId',
  validate({ params: validators.addressIdParams, body: validators.updateAddressBody }),
  controller.updateAddress,
);
router.delete('/addresses/:addressId', validate({ params: validators.addressIdParams }), controller.deleteAddress);

router.put('/avatar', validate({ body: validators.avatarBody }), controller.setAvatar);
router.delete('/avatar', controller.removeAvatar);

module.exports = router;
