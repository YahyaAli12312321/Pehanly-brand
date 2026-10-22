'use strict';

const router = require('express').Router();

const controller = require('../controllers/order.controller');
const validators = require('../validators/order.validators');
const validate = require('../middleware/validate');
const { requireStaff } = require('../middleware/auth');

/*
 * Mounted ONLY by routes/admin.routes.js, which authenticates the request.
 *
 * requireStaff is repeated here as defense in depth. It performs no database
 * lookup (it only reads req.user), and it answers 401/403 if this router is
 * ever mounted somewhere without the admin guard.
 */
router.use(requireStaff);

/* GET /api/v1/admin/orders/summary */
router.get(
  '/summary',
  controller.getAdminOrdersSummary,
);

/* GET /api/v1/admin/orders */
router.get(
  '/',
  validate({
    query: validators.adminOrdersQuery,
  }),
  controller.listAdminOrders,
);

/* GET /api/v1/admin/orders/:id */
router.get(
  '/:id',
  validate({
    params: validators.orderIdParams,
  }),
  controller.getAdminOrder,
);

/* PATCH /api/v1/admin/orders/:id/status */
router.patch(
  '/:id/status',
  validate({
    params: validators.orderIdParams,
    body: validators.updateOrderStatusBody,
  }),
  controller.updateOrderStatus,
);

/* PATCH /api/v1/admin/orders/:id/shipment */
router.patch(
  '/:id/shipment',
  validate({
    params: validators.orderIdParams,
    body: validators.updateShipmentBody,
  }),
  controller.updateShipment,
);

/* PATCH /api/v1/admin/orders/:id/notes */
router.patch(
  '/:id/notes',
  validate({
    params: validators.orderIdParams,
    body: validators.updateAdminNotesBody,
  }),
  controller.updateAdminNotes,
);

module.exports = router;
