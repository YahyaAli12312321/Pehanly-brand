'use strict';

const wholesaleService =
  require('../services/wholesale.service');

const response =
  require('../utils/apiResponse');

/*
|--------------------------------------------------------------------------
| Public Ready Packs
|--------------------------------------------------------------------------
*/

async function listPacks(req, res) {
  const result =
    await wholesaleService.listActivePacks(
      req.validated.query,
    );

  return response.success(res, {
    data: result.packs,
    meta: result.meta,
    message:
      'Wholesale packs fetched successfully',
  });
}

async function getPack(req, res) {
  const pack =
    await wholesaleService.getActivePackBySlug(
      req.validated.params.slug,
    );

  return response.success(res, {
    data: pack,
    message:
      'Wholesale pack fetched successfully',
  });
}

/*
|--------------------------------------------------------------------------
| Customer Requests
|--------------------------------------------------------------------------
*/

async function createCustomRequest(req, res) {
  const request =
    await wholesaleService.createCustomRequest({
      userId:
        req.user?.id || null,

      customer:
        req.validated.body.customer,

      items:
        req.validated.body.items,

      partnershipProposal:
        req.validated.body
          .partnershipProposal,

      customerNotes:
        req.validated.body
          .customerNotes,
    });

  return response.created(res, {
    data: request,
    message:
      'Wholesale request submitted successfully',
  });
}

async function createPackRequest(req, res) {
  const request =
    await wholesaleService.createPackRequest({
      packId:
        req.validated.params.id,

      userId:
        req.user?.id || null,

      customer:
        req.validated.body.customer,

      partnershipProposal:
        req.validated.body
          .partnershipProposal,

      customerNotes:
        req.validated.body
          .customerNotes,
    });

  return response.created(res, {
    data: request,
    message:
      'Wholesale pack request submitted successfully',
  });
}

async function listMyRequests(req, res) {
  const result =
    await wholesaleService.listMyRequests({
      userId:
        req.user._id,

      ...req.validated.query,
    });

  return response.success(res, {
    data: result.requests,
    meta: result.meta,
    message:
      'Wholesale requests fetched successfully',
  });
}

async function getMyRequest(req, res) {
  const request =
    await wholesaleService.getMyRequest({
      requestId:
        req.validated.params.id,

      userId:
        req.user._id,
    });

  return response.success(res, {
    data: request,
    message:
      'Wholesale request fetched successfully',
  });
}

/*
|--------------------------------------------------------------------------
| Admin Dashboard Stats
|--------------------------------------------------------------------------
*/

async function getAdminStats(req, res) {
  const stats =
    await wholesaleService.getAdminStats();

  return response.success(res, {
    data: stats,
    message:
      'Wholesale statistics fetched successfully',
  });
}

/*
|--------------------------------------------------------------------------
| Admin Requests
|--------------------------------------------------------------------------
*/

async function listAdminRequests(req, res) {
  const result =
    await wholesaleService.listAdminRequests(
      req.validated.query,
    );

  return response.success(res, {
    data: result.requests,
    meta: result.meta,
    message:
      'Wholesale requests fetched successfully',
  });
}

async function getAdminRequest(req, res) {
  const request =
    await wholesaleService.getAdminRequest(
      req.validated.params.id,
    );

  return response.success(res, {
    data: request,
    message:
      'Wholesale request fetched successfully',
  });
}

async function reviewRequest(req, res) {
  const request =
    await wholesaleService.reviewRequest({
      requestId:
        req.validated.params.id,

      adminUserId:
        req.user._id,

      action:
        req.validated.body.action,

      adminNotes:
        req.validated.body.adminNotes,
    });

  return response.success(res, {
    data: request,
    message:
      'Wholesale request updated successfully',
  });
}

async function approveRequest(req, res) {
  const request =
    await wholesaleService.approveRequest({
      requestId:
        req.validated.params.id,

      adminUserId:
        req.user._id,

      adminNotes:
        req.validated.body.adminNotes,

      discountScheme:
        req.validated.body
          .discountScheme,
    });

  return response.success(res, {
    data: request,
    message:
      'Wholesale account approved successfully',
  });
}

/*
|--------------------------------------------------------------------------
| Admin Ready Packs
|--------------------------------------------------------------------------
*/

async function createPack(req, res) {
  const pack =
    await wholesaleService.createPack(
      req.validated.body,
    );

  return response.created(res, {
    data: pack,
    message:
      'Wholesale pack created successfully',
  });
}

async function listAdminPacks(req, res) {
  const result =
    await wholesaleService.listAdminPacks(
      req.validated.query,
    );

  return response.success(res, {
    data: result.packs,
    meta: result.meta,
    message:
      'Wholesale packs fetched successfully',
  });
}

async function getAdminPack(req, res) {
  const pack =
    await wholesaleService.getAdminPack(
      req.validated.params.id,
    );

  return response.success(res, {
    data: pack,
    message:
      'Wholesale pack fetched successfully',
  });
}

async function updatePack(req, res) {
  const pack =
    await wholesaleService.updatePack({
      packId:
        req.validated.params.id,

      data:
        req.validated.body,
    });

  return response.success(res, {
    data: pack,
    message:
      'Wholesale pack updated successfully',
  });
}

async function setPackStatus(req, res) {
  const pack =
    await wholesaleService.setPackStatus({
      packId:
        req.validated.params.id,

      isActive:
        req.validated.body.isActive,
    });

  return response.success(res, {
    data: pack,
    message:
      req.validated.body.isActive
        ? 'Wholesale pack activated successfully'
        : 'Wholesale pack deactivated successfully',
  });
}

module.exports = {
  listPacks,
  getPack,

  createCustomRequest,
  createPackRequest,

  listMyRequests,
  getMyRequest,

  getAdminStats,

  listAdminRequests,
  getAdminRequest,
  reviewRequest,
  approveRequest,

  createPack,
  listAdminPacks,
  getAdminPack,
  updatePack,
  setPackStatus,
};