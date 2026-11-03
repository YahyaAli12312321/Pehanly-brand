'use strict';

const router =
  require('express')
    .Router();

const c =
  require(
    '../controllers/customer.controller',
  );

const v =
  require(
    '../validators/customer.validators',
  );

const validate =
  require(
    '../middleware/validate',
  );

/*
|--------------------------------------------------------------------------
| Customer Admin Routes
|--------------------------------------------------------------------------
*/

router.get(
  '/',

  validate({
    query:
      v.listQuery,
  }),

  c.list,
);

router.get(
  '/summary',
  c.summary,
);

router.get(
  '/:id',

  validate({
    params:
      v.idParams,
  }),

  c.get,
);

router.get(
  '/:id/orders',

  validate({
    params:
      v.idParams,

    query:
      v.orderHistoryQuery,
  }),

  c.orderHistory,
);

router.patch(
  '/:id/status',

  validate({
    params:
      v.idParams,

    body:
      v.statusBody,
  }),

  c.setStatus,
);

module.exports = router;