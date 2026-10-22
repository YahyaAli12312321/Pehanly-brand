'use strict';

const router = require('express').Router();

const controller =
  require('../controllers/coupon.controller');

const validators =
  require('../validators/coupon.validators');

const validate =
  require('../middleware/validate');

router.get(
  '/',
  validate({
    query: validators.listQuery,
  }),
  controller.list,
);

router.post(
  '/',
  validate({
    body: validators.createBody,
  }),
  controller.create,
);

router.get(
  '/:id',
  validate({
    params: validators.idParams,
  }),
  controller.get,
);

router.patch(
  '/:id',
  validate({
    params: validators.idParams,
    body: validators.updateBody,
  }),
  controller.update,
);

router.patch(
  '/:id/status',
  validate({
    params: validators.idParams,
    body: validators.statusBody,
  }),
  controller.setStatus,
);

router.delete(
  '/:id',
  validate({
    params: validators.idParams,
  }),
  controller.remove,
);

module.exports = router;