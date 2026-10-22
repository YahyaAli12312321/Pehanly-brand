'use strict';

const RETURN_STATUSES = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RECEIVED: 'received',
  INSPECTED: 'inspected',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

const RETURN_ITEM_CONDITIONS = Object.freeze({
  PENDING_INSPECTION: 'pending_inspection',
  RESTOCKABLE: 'restockable',
  DAMAGED: 'damaged',
  NOT_RESTOCKABLE: 'not_restockable',
});

const REFUND_STATUSES = Object.freeze({
  NOT_REQUIRED: 'not_required',
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

const REFUND_TYPES = Object.freeze({
  FULL: 'full',
  PARTIAL: 'partial',
});

module.exports = {
  RETURN_STATUSES,
  RETURN_ITEM_CONDITIONS,
  REFUND_STATUSES,
  REFUND_TYPES,
};