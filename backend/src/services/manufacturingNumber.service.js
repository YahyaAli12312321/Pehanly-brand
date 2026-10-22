'use strict';

const { nextSequence } = require('./counter.services');

async function nextManufacturingRequestNumber(session = null) {
  const sequence = await nextSequence('manufacturing_request', { session });

  return `MF-${String(sequence).padStart(6, '0')}`;
}

module.exports = {
  nextManufacturingRequestNumber,
};
