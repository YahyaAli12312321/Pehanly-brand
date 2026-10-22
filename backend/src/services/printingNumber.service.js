'use strict';

const { nextSequence } = require('./counter.services');

async function nextPrintingRequestNumber(session = null) {
  const sequence = await nextSequence('printing_request', { session });

  return `PR-${String(sequence).padStart(6, '0')}`;
}

module.exports = {
  nextPrintingRequestNumber,
};
