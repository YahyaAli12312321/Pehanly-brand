'use strict';

const { config } = require('../../../config/env');

/*
 * Meta WhatsApp Cloud API provider - INACTIVE PLACEHOLDER. It makes no network call in this phase.
 *
 * Same interface as the mock provider:  sendMessage({ to, template, variables, message }) ->
 *   { ok: true, messageId }                          accepted by Meta
 *   { ok: false, retryable, error: { code, message } }
 *
 * To activate later (see docs/WHATSAPP-NOTIFICATIONS.md): set WHATSAPP_PROVIDER=meta plus the WHATSAPP_META_* variables, get one
 * template approved per event key (template name == event key, body variables in the order of `variables`), then replace the body
 * of sendMessage with the POST to
 *   https://graph.facebook.com/{apiVersion}/{phoneNumberId}/messages     Authorization: Bearer {accessToken}
 * mapping Meta errors to retryable (429 / 5xx / network) vs permanent (invalid number, template not approved), and add the
 * webhook that moves records from "sent" to "delivered" / "failed".
 */

const name = 'meta';

function isConfigured() {
  const m = config.whatsapp.meta;
  return Boolean(m.accessToken && m.phoneNumberId && m.businessAccountId && m.apiVersion);
}

async function sendMessage() {
  return {
    ok: false,
    retryable: false,
    error: {
      code: 'META_PROVIDER_NOT_IMPLEMENTED',
      message: 'The Meta WhatsApp Cloud API provider is not connected yet. Use WHATSAPP_PROVIDER=mock.',
    },
  };
}

module.exports = { name, isSimulated: false, isConfigured, sendMessage };
