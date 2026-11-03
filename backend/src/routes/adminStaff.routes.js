'use strict';

const router = require('express').Router();

const controller = require('../controllers/staff.controller');
const validators = require('../validators/staff.validators');
const validate = require('../middleware/validate');
const { requireAdmin } = require('../middleware/auth');

/*
 * Staff management is OWNER-ONLY (role admin). Staff members can never
 * create staff, change permissions or reset passwords.
 */
router.use(requireAdmin);

router.get('/permissions', controller.catalog);

router.get('/', validate({ query: validators.listQuery }), controller.list);

router.post('/', validate({ body: validators.createBody }), controller.create);

router.patch(
  '/:id',
  validate({ params: validators.idParams, body: validators.updateBody }),
  controller.update,
);

router.patch(
  '/:id/status',
  validate({ params: validators.idParams, body: validators.statusBody }),
  controller.setStatus,
);

router.post(
  '/:id/reset-password',
  validate({ params: validators.idParams, body: validators.passwordBody }),
  controller.resetPassword,
);

module.exports = router;
