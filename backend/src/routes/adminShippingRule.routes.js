'use strict';

const router =
  require('express').Router();

const controller =
  require('../controllers/shippingRule.controller');

const validators =
  require('../validators/shippingRule.validators');

const validate =
  require('../middleware/validate');

/*
|--------------------------------------------------------------------------
| Admin Shipping Rules
|--------------------------------------------------------------------------
|
| Base:
| /api/v1/admin/shipping-rules
|--------------------------------------------------------------------------
*/

router.get(
  '/',

  validate({
    query:
      validators.listQuery,
  }),

  controller.list,
);

router.post(
  '/',

  validate({
    body:
      validators.createBody,
  }),

  controller.create,
);

router.get(
  '/:id',

  validate({
    params:
      validators.idParams,
  }),

  controller.get,
);

router.patch(
  '/:id',

  validate({
    params:
      validators.idParams,

    body:
      validators.updateBody,
  }),

  controller.update,
);

router.patch(
  '/:id/status',

  validate({
    params:
      validators.idParams,

    body:
      validators.statusBody,
  }),

  controller.setStatus,
);

router.delete(
  '/:id',

  validate({
    params:
      validators.idParams,
  }),

  controller.remove,
);

module.exports =
  router;