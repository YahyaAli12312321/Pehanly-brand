'use strict';

const router =
  require('express').Router();

const {
  authenticate,
} = require('../middleware/auth');

const {
  validate,
} = require('../middleware/validate');

const asyncHandler =
  require('../utils/asyncHandler');

const quoteController =
  require('../controllers/quote.controller');

const {
  quoteIdParams,
  listMyQuotesQuery,
  rejectQuoteBody,
} = require('../validators/quote.validators');

router.use(authenticate);

router.get(
  '/my',
  validate({
    query: listMyQuotesQuery,
  }),
  asyncHandler(
    quoteController.listMyQuotes,
  ),
);

router.get(
  '/my/:id',
  validate({
    params: quoteIdParams,
  }),
  asyncHandler(
    quoteController.getMyQuote,
  ),
);

router.patch(
  '/my/:id/accept',
  validate({
    params: quoteIdParams,
  }),
  asyncHandler(
    quoteController.acceptQuote,
  ),
);

router.patch(
  '/my/:id/reject',
  validate({
    params: quoteIdParams,
    body: rejectQuoteBody,
  }),
  asyncHandler(
    quoteController.rejectQuote,
  ),
);

module.exports = router;