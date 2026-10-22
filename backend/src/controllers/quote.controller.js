'use strict';

const quoteService =
  require('../services/quote.service');

const response =
  require('../utils/apiResponse');

async function createWholesaleQuote(req, res) {
  const quote =
    await quoteService.createWholesaleQuote({
      wholesaleRequestId:
        req.validated.body.wholesaleRequestId,

      adminUserId:
        req.user._id,

      discount:
        req.validated.body.discount,

      shipping:
        req.validated.body.shipping,

      additionalCharges:
        req.validated.body.additionalCharges,

      validUntil:
        req.validated.body.validUntil,

      adminNotes:
        req.validated.body.adminNotes,

      terms:
        req.validated.body.terms,
    });

  return response.created(res, {
    data: quote,
    message:
      'Wholesale quote created successfully',
  });
}

async function createManufacturingQuote(req, res) {
  const quote =
    await quoteService.createManufacturingQuote({
      manufacturingRequestId:
        req.validated.body.manufacturingRequestId,

      unitPrice:
        req.validated.body.unitPrice,

      adminUserId:
        req.user._id,

      discount:
        req.validated.body.discount,

      shipping:
        req.validated.body.shipping,

      additionalCharges:
        req.validated.body.additionalCharges,

      validUntil:
        req.validated.body.validUntil,

      adminNotes:
        req.validated.body.adminNotes,

      terms:
        req.validated.body.terms,
    });

  return response.created(res, {
    data: quote,
    message:
      'Manufacturing quote created successfully',
  });
}

async function createPrintingQuote(req, res) {
  const quote =
    await quoteService.createPrintingQuote({
      printingRequestId:
        req.validated.body.printingRequestId,

      unitPrice:
        req.validated.body.unitPrice,

      adminUserId:
        req.user._id,

      discount:
        req.validated.body.discount,

      shipping:
        req.validated.body.shipping,

      additionalCharges:
        req.validated.body.additionalCharges,

      validUntil:
        req.validated.body.validUntil,

      adminNotes:
        req.validated.body.adminNotes,

      terms:
        req.validated.body.terms,
    });

  return response.created(res, {
    data: quote,
    message:
      'Printing & Branding quote created successfully',
  });
}

async function listAdminQuotes(req, res) {
  const result =
    await quoteService.listAdminQuotes({
      search:
        req.validated.query.search,

      status:
        req.validated.query.status,

      sourceType:
        req.validated.query.sourceType,

      page:
        req.validated.query.page,

      limit:
        req.validated.query.limit,
    });

  return response.success(res, {
    data: result.quotes,
    meta: result.meta,
    stats: result.stats,

    message:
      'Quotes fetched successfully',
  });
}

async function getAdminQuote(req, res) {
  const quote =
    await quoteService.getAdminQuote(
      req.validated.params.id,
    );

  return response.success(res, {
    data: quote,
    message:
      'Quote fetched successfully',
  });
}

async function updateDraftQuote(req, res) {
  const quote =
    await quoteService.updateDraftQuote({
      quoteId:
        req.validated.params.id,

      data:
        req.validated.body,
    });

  return response.success(res, {
    data: quote,
    message:
      'Quote updated successfully',
  });
}

async function sendQuote(req, res) {
  const quote =
    await quoteService.sendQuote({
      quoteId:
        req.validated.params.id,

      adminUserId:
        req.user._id,
    });

  return response.success(res, {
    data: quote,
    message:
      'Quote sent successfully',
  });
}

async function listMyQuotes(req, res) {
  const result =
    await quoteService.listMyQuotes({
      userId:
        req.user._id,

      status:
        req.validated.query.status,

      page:
        req.validated.query.page,

      limit:
        req.validated.query.limit,
    });

  return response.success(res, {
    data: result.quotes,
    meta: result.meta,

    message:
      'Quotes fetched successfully',
  });
}

async function getMyQuote(req, res) {
  const quote =
    await quoteService.getMyQuote({
      quoteId:
        req.validated.params.id,

      userId:
        req.user._id,
    });

  return response.success(res, {
    data: quote,
    message:
      'Quote fetched successfully',
  });
}

async function acceptQuote(req, res) {
  const quote =
    await quoteService.acceptQuote({
      quoteId:
        req.validated.params.id,

      userId:
        req.user._id,
    });

  return response.success(res, {
    data: quote,
    message:
      'Quote accepted successfully',
  });
}

async function rejectQuote(req, res) {
  const quote =
    await quoteService.rejectQuote({
      quoteId:
        req.validated.params.id,

      userId:
        req.user._id,

      customerNotes:
        req.validated.body.customerNotes,
    });

  return response.success(res, {
    data: quote,
    message:
      'Quote rejected successfully',
  });
}

async function convertQuoteToOrder(req, res) {
  const order =
    await quoteService.convertQuoteToOrder({
      quoteId:
        req.validated.params.id,

      adminUserId:
        req.user._id,

      shippingAddress:
        req.validated.body.shippingAddress,
    });

  return response.created(res, {
    data: order,
    message:
      'Quote converted to order successfully',
  });
}

module.exports = {
  createWholesaleQuote,
  createManufacturingQuote,
  createPrintingQuote,

  listAdminQuotes,
  getAdminQuote,

  updateDraftQuote,
  sendQuote,
  convertQuoteToOrder,

  listMyQuotes,
  getMyQuote,
  acceptQuote,
  rejectQuote,
};