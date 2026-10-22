'use strict';

const { nextSequence } = require('./counter.services');

async function nextWholesaleRequestNumber(session = null) {
  const sequence = await nextSequence('wholesale_request', { session });

  return `WH-${String(sequence).padStart(6, '0')}`;
}

module.exports = {
  nextWholesaleRequestNumber,
};
