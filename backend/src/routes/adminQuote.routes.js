'use strict';

const router =
  require('express').Router();

const quoteController =
  require('../controllers/quote.controller');

const {
  validate,
} = require('../middleware/validate');

const asyncHandler =
  require('../utils/asyncHandler');

const {
  createWholesaleQuoteBody,
  createManufacturingQuoteBody,
  createPrintingQuoteBody,
  updateQuoteBody,
  convertQuoteToOrderBody,
  quoteIdParams,
  listAdminQuotesQuery,
} = require('../validators/quote.validators');

router.get(
  '/',
  validate({
    query: listAdminQuotesQuery,
  }),
  asyncHandler(
    quoteController.listAdminQuotes,
  ),
);

router.post(
  '/wholesale',
  validate({
    body: createWholesaleQuoteBody,
  }),
  asyncHandler(
    quoteController.createWholesaleQuote,
  ),
);

router.post(
  '/manufacturing',
  validate({
    body: createManufacturingQuoteBody,
  }),
  asyncHandler(
    quoteController.createManufacturingQuote,
  ),
);

router.post(
  '/printing',
  validate({
    body: createPrintingQuoteBody,
  }),
  asyncHandler(
    quoteController.createPrintingQuote,
  ),
);

router.get(
  '/:id',
  validate({
    params: quoteIdParams,
  }),
  asyncHandler(
    quoteController.getAdminQuote,
  ),
);

router.patch(
  '/:id',
  validate({
    params: quoteIdParams,
    body: updateQuoteBody,
  }),
  asyncHandler(
    quoteController.updateDraftQuote,
  ),
);

router.post(
  '/:id/send',
  validate({
    params: quoteIdParams,
  }),
  asyncHandler(
    quoteController.sendQuote,
  ),
);

router.post(
  '/:id/convert-to-order',
  validate({
    params: quoteIdParams,
    body: convertQuoteToOrderBody,
  }),
  asyncHandler(
    quoteController.convertQuoteToOrder,
  ),
);

module.exports = router;