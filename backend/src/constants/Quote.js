'use strict';

const QUOTE_STATUSES = Object.freeze({
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CONVERTED_TO_ORDER: 'converted_to_order',
});

const QUOTE_SOURCE_TYPES = Object.freeze({
  WHOLESALE: 'wholesale',
  MANUFACTURING: 'manufacturing',
  PRINTING: 'printing',
});

module.exports = {
  QUOTE_STATUSES,
  QUOTE_SOURCE_TYPES,
};