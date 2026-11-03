'use strict';

const MANUFACTURING_DOCUMENT_TYPES = Object.freeze({
  CATEGORY: 'category',
  STYLE: 'style',
  VARIANT: 'variant',
  REQUEST: 'request',
});

const MANUFACTURING_REQUEST_STATUSES = Object.freeze({
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  QUOTED: 'quoted',
  ACCEPTED: 'accepted',
  CANCELLED: 'cancelled',
  CONVERTED_TO_ORDER: 'converted_to_order',
});

module.exports = {
  MANUFACTURING_DOCUMENT_TYPES,
  MANUFACTURING_REQUEST_STATUSES,
};