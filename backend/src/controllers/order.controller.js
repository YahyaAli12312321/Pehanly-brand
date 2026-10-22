'use strict';

const orderService =
  require('../services/order.service');

const asyncHandler =
  require('../utils/asyncHandler');

const {
  success,
  created,
} = require('../utils/apiResponse');

const actorId = (req) =>
  req.user?.id ||
  req.user?._id;

/*
|--------------------------------------------------------------------------
| Retail Checkout
|--------------------------------------------------------------------------
*/

exports.createRetailOrder =
  asyncHandler(
    async (req, res) => {
      const order =
        await orderService
          .createRetailOrder(
            req.validated.body,
            req.user || null,
          );

      return created(res, {
        message:
          'Order placed successfully',

        data:
          order,
      });
    },
  );

/*
|--------------------------------------------------------------------------
| Customer - My Orders
|--------------------------------------------------------------------------
*/

exports.listMyOrders =
  asyncHandler(
    async (req, res) => {
      const {
        items,
        meta,
      } =
        await orderService
          .listMyOrders(
            actorId(req),
            req.validated.query,
          );

      return success(res, {
        data:
          items,

        meta,
      });
    },
  );

/*
|--------------------------------------------------------------------------
| Customer - My Order Detail
|--------------------------------------------------------------------------
*/

exports.getMyOrder =
  asyncHandler(
    async (req, res) => {
      const order =
        await orderService
          .getMyOrder(
            req.validated.params.id,
            actorId(req),
          );

      return success(res, {
        data:
          order,
      });
    },
  );

/*
|--------------------------------------------------------------------------
| Guest Tracking
|--------------------------------------------------------------------------
*/

exports.trackGuestOrder =
  asyncHandler(
    async (req, res) => {
      const order =
        await orderService
          .trackGuestOrder(
            req.validated.body,
          );

      return success(res, {
        data:
          order,
      });
    },
  );

/*
|--------------------------------------------------------------------------
| Admin - Orders List
|--------------------------------------------------------------------------
*/

exports.listAdminOrders =
  asyncHandler(
    async (req, res) => {
      const {
        items,
        meta,
      } =
        await orderService
          .listAdminOrders(
            req.validated.query,
          );

      return success(res, {
        data:
          items,

        meta,
      });
    },
  );

/*
|--------------------------------------------------------------------------
| Admin - Orders Summary
|--------------------------------------------------------------------------
*/

exports.getAdminOrdersSummary =
  asyncHandler(
    async (_req, res) => {
      const summary =
        await orderService
          .getAdminOrdersSummary();

      return success(res, {
        data:
          summary,
      });
    },
  );

/*
|--------------------------------------------------------------------------
| Admin - Order Detail
|--------------------------------------------------------------------------
*/

exports.getAdminOrder =
  asyncHandler(
    async (req, res) => {
      const order =
        await orderService
          .getAdminOrder(
            req.validated.params.id,
          );

      return success(res, {
        data:
          order,
      });
    },
  );

/*
|--------------------------------------------------------------------------
| Admin - Update Order Status
|--------------------------------------------------------------------------
*/

exports.updateOrderStatus =
  asyncHandler(
    async (req, res) => {
      const order =
        await orderService
          .updateOrderStatus({
            orderId:
              req.validated.params.id,

            status:
              req.validated.body.status,

            note:
              req.validated.body.note,

            actor:
              req.user,
          });

      return success(res, {
        message:
          'Order status updated',

        data:
          order,
      });
    },
  );

/*
|--------------------------------------------------------------------------
| Admin - Update Shipment
|--------------------------------------------------------------------------
*/

exports.updateShipment =
  asyncHandler(
    async (req, res) => {
      const order =
        await orderService
          .updateShipment({
            orderId:
              req.validated.params.id,

            shipment:
              req.validated.body,

            actor:
              req.user,
          });

      return success(res, {
        message:
          'Shipment information updated',

        data:
          order,
      });
    },
  );

/*
|--------------------------------------------------------------------------
| Admin - Update Notes
|--------------------------------------------------------------------------
*/

exports.updateAdminNotes =
  asyncHandler(
    async (req, res) => {
      const order =
        await orderService
          .updateAdminNotes({
            orderId:
              req.validated.params.id,

            adminNotes:
              req.validated.body
                .adminNotes,
          });

      return success(res, {
        message:
          'Admin notes updated',

        data:
          order,
      });
    },
  );