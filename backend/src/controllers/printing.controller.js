'use strict';

const printingService =
  require('../services/printing.service');

const response =
  require('../utils/apiResponse');

/*
|--------------------------------------------------------------------------
| Public
|--------------------------------------------------------------------------
*/

async function listPublicServices(
  req,
  res,
) {
  const result =
    await printingService.listPublicServices(
      req.validated.query,
    );

  return response.success(res, {
    data: result.services,
    meta: result.meta,
  });
}

async function getPublicService(
  req,
  res,
) {
  const data =
    await printingService.getPublicService(
      req.validated.params.id,
    );

  return response.success(res, {
    data,
  });
}

/*
|--------------------------------------------------------------------------
| Customer
|--------------------------------------------------------------------------
*/

async function createRequest(
  req,
  res,
) {
  const data =
    await printingService.createRequest({
      userId:
        req.user?._id || null,

      ...req.validated.body,
    });

  return response.created(res, {
    data,

    message:
      'Printing request submitted successfully',
  });
}

async function listMyRequests(
  req,
  res,
) {
  const result =
    await printingService.listMyRequests({
      userId:
        req.user._id,

      ...req.validated.query,
    });

  return response.success(res, {
    data: result.requests,
    meta: result.meta,
  });
}

async function getMyRequest(
  req,
  res,
) {
  const data =
    await printingService.getMyRequest({
      requestId:
        req.validated.params.id,

      userId:
        req.user._id,
    });

  return response.success(res, {
    data,
  });
}

/*
|--------------------------------------------------------------------------
| Admin Services
|--------------------------------------------------------------------------
*/

async function createService(
  req,
  res,
) {
  const data =
    await printingService.createService(
      req.validated.body,
    );

  return response.created(res, {
    data,

    message:
      'Printing service created successfully',
  });
}

async function listAdminServices(
  req,
  res,
) {
  const result =
    await printingService.listAdminServices(
      req.validated.query,
    );

  return response.success(res, {
    data: result.services,
    meta: result.meta,
  });
}

async function getAdminService(
  req,
  res,
) {
  const data =
    await printingService.getAdminService(
      req.validated.params.id,
    );

  return response.success(res, {
    data,
  });
}

async function updateService(
  req,
  res,
) {
  const data =
    await printingService.updateService({
      serviceId:
        req.validated.params.id,

      data:
        req.validated.body,
    });

  return response.success(res, {
    data,

    message:
      'Printing service updated successfully',
  });
}

async function deleteService(
  req,
  res,
) {
  const data =
    await printingService.deleteService(
      req.validated.params.id,
    );

  return response.success(res, {
    data,
    message: data.message,
  });
}

/*
|--------------------------------------------------------------------------
| Admin Requests
|--------------------------------------------------------------------------
*/

async function listAdminRequests(
  req,
  res,
) {
  const result =
    await printingService.listAdminRequests(
      req.validated.query,
    );

  return response.success(res, {
    data: result.requests,
    meta: result.meta,
  });
}

async function getAdminRequest(
  req,
  res,
) {
  const data =
    await printingService.getAdminRequest(
      req.validated.params.id,
    );

  return response.success(res, {
    data,
  });
}

async function reviewRequest(
  req,
  res,
) {
  const data =
    await printingService.reviewRequest({
      requestId:
        req.validated.params.id,

      adminUserId:
        req.user._id,

      adminNotes:
        req.validated.body.adminNotes,
    });

  return response.success(res, {
    data,

    message:
      'Printing request moved under review',
  });
}

async function approveRequest(
  req,
  res,
) {
  const data =
    await printingService.approveRequest({
      requestId:
        req.validated.params.id,

      adminUserId:
        req.user._id,

      adminNotes:
        req.validated.body.adminNotes,
    });

  return response.success(res, {
    data,

    message:
      'Printing request approved successfully',
  });
}

async function rejectRequest(
  req,
  res,
) {
  const data =
    await printingService.rejectRequest({
      requestId:
        req.validated.params.id,

      adminUserId:
        req.user._id,

      adminNotes:
        req.validated.body.adminNotes,
    });

  return response.success(res, {
    data,

    message:
      'Printing request rejected successfully',
  });
}

module.exports = {
  listPublicServices,
  getPublicService,

  createRequest,
  listMyRequests,
  getMyRequest,

  createService,
  listAdminServices,
  getAdminService,
  updateService,
  deleteService,

  listAdminRequests,
  getAdminRequest,

  reviewRequest,
  approveRequest,
  rejectRequest,
};