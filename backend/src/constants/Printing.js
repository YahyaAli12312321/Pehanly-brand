'use strict';

const PRINTING_DOCUMENT_TYPES = Object.freeze({
  SERVICE: 'service',
  REQUEST: 'request',
});

const PRINTING_REQUEST_STATUSES = Object.freeze({
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  QUOTED: 'quoted',
  ACCEPTED: 'accepted',
  CANCELLED: 'cancelled',
  CONVERTED_TO_ORDER: 'converted_to_order',
});

const PRINTING_GARMENT_SOURCES = Object.freeze({
  PEHANLY: 'pehanly',
  CUSTOMER_SUPPLIED: 'customer_supplied',
});

module.exports = {
  PRINTING_DOCUMENT_TYPES,
  PRINTING_REQUEST_STATUSES,
  PRINTING_GARMENT_SOURCES,
};