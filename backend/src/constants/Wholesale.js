'use strict';

const WHOLESALE_REQUEST_STATUSES = Object.freeze({
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  QUOTED: 'quoted',
  ACCEPTED: 'accepted',
  CANCELLED: 'cancelled',
  CONVERTED_TO_ORDER: 'converted_to_order',
});

const WHOLESALE_REQUEST_TYPES = Object.freeze({
  CUSTOM: 'custom',
  READY_PACK: 'ready_pack',
});

module.exports = {
  WHOLESALE_REQUEST_STATUSES,
  WHOLESALE_REQUEST_TYPES,
};