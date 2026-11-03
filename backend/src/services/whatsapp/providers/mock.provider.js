'use strict';

const crypto = require('node:crypto');

/*
 * Mock WhatsApp provider. It NEVER contacts WhatsApp / Meta and sends nothing: it only simulates the result so the whole
 * notification workflow can be exercised. Results it returns are flagged `simulated: true`; the service stores them as
 * status "sent" with provider "mock" (never "delivered").
 *
 * Failure simulation (tests / dashboard "test notification"): pass `simulate`:
 *   'success' (default) | 'failure' (permanent) | 'temporary_failure' (retryable)
 * and, for a single process, `failNext(n)` makes the next n sends fail temporarily.
 */

const name = 'mock';
let failNext = 0;
const sent = []; // last simulated sends, handy in tests / diagnostics (bounded)

async function sendMessage({ to, template, variables = {}, message = '', simulate = 'success' } = {}) {
  if (failNext > 0) {
    failNext -= 1;
    simulate = 'temporary_failure';
  }
  if (simulate === 'failure') {
    return { ok: false, retryable: false, simulated: true, error: { code: 'MOCK_REJECTED', message: 'Simulated permanent failure (mock provider)' } };
  }
  if (simulate === 'temporary_failure') {
    return { ok: false, retryable: true, simulated: true, error: { code: 'MOCK_TEMPORARY_FAILURE', message: 'Simulated temporary failure (mock provider)' } };
  }
  const messageId = `mock_${crypto.randomUUID()}`;
  sent.push({ messageId, to, template, variables, message, at: new Date() });
  if (sent.length > 200) sent.shift();
  return { ok: true, simulated: true, messageId };
}

module.exports = {
  name,
  isSimulated: true,
  sendMessage,
  // test / diagnostics helpers (not part of the provider interface)
  _failNext: (n = 1) => { failNext = n; },
  _sent: () => sent,
  _reset: () => { failNext = 0; sent.length = 0; },
};
