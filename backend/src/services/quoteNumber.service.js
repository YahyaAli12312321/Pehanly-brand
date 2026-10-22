'use strict';

const { nextSequence } = require('./counter.services');

async function nextQuoteNumber(session = null) {
  const sequence = await nextSequence('quote', { session });

  return `QT-${String(sequence).padStart(6, '0')}`;
}

module.exports = {
  nextQuoteNumber,
};
