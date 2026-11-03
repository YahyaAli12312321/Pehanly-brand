'use strict';

/*
 * Outgoing e-mail (password reset, password-changed notice).
 *
 *  - SMTP via nodemailer when SMTP_HOST + EMAIL_FROM are configured.
 *  - Not configured: nothing is sent. In development the message is logged
 *    (including the reset link) so the flow can be tested; in production only
 *    a warning without the link is logged.
 *  - Never throws into a request: callers use sendSafely() and an unreachable
 *    mail server must not change the API response (the forgot-password
 *    endpoint must answer identically whether or not an account exists).
 *  - Never call this inside a MongoDB transaction.
 */

const nodemailer = require('nodemailer');

const { config } = require('../config/env');
const logger = require('../config/logger');

let transporter = null;
let transportOverride = null;

function getTransporter() {
  if (transportOverride) return transportOverride;
  if (!config.mail.configured) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 15000,
    });
  }

  return transporter;
}

/** Test hook: inject a transport with sendMail(); pass null to restore. */
function setTransportForTests(value) {
  transportOverride = value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function passwordResetMessage({ name, resetUrl, minutes }) {
  const safeName = escapeHtml(name || 'there');

  return {
    subject: 'Reset your PEHAN LY password',
    text:
      `Hello ${name || 'there'},\n\n` +
      `Use this link to choose a new password (valid for ${minutes} minutes):\n${resetUrl}\n\n` +
      'If you did not ask for this, you can ignore this email; your password stays unchanged.\n',
    html:
      `<p>Hello ${safeName},</p>` +
      `<p>Use the link below to choose a new password (valid for ${minutes} minutes):</p>` +
      `<p><a href="${escapeHtml(resetUrl)}">Reset password</a></p>` +
      '<p>If you did not ask for this, you can ignore this email; your password stays unchanged.</p>',
  };
}

function passwordChangedMessage({ name }) {
  const safeName = escapeHtml(name || 'there');

  return {
    subject: 'Your PEHAN LY password was changed',
    text:
      `Hello ${name || 'there'},\n\nYour password was just changed. ` +
      'If this was not you, reset your password immediately and contact us.\n',
    html:
      `<p>Hello ${safeName},</p><p>Your password was just changed. ` +
      'If this was not you, reset your password immediately and contact us.</p>',
  };
}

async function send({ to, subject, text, html }) {
  const transport = getTransporter();

  if (!transport) {
    if (config.isProd) {
      logger.warn({ subject }, 'E-mail not sent: SMTP is not configured');
    } else {
      logger.info({ to, subject, text }, 'E-mail (not sent, SMTP not configured; development log only)');
    }

    return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };
  }

  await transport.sendMail({ from: config.mail.from, to, subject, text, html });

  return { sent: true };
}

/** Like send(), but swallows and logs failures. */
async function sendSafely(message) {
  try {
    return await send(message);
  } catch (error) {
    logger.error({ err: error.message, subject: message.subject }, 'E-mail delivery failed');

    return { sent: false, reason: 'SEND_FAILED' };
  }
}

function resetUrlFor(token, { backOffice = false } = {}) {
  // Back-office accounts are sent to the admin dashboard when it is configured.
  // The base URL comes from server config only - never from the request.
  const base = backOffice && config.mail.adminPasswordResetUrl ? config.mail.adminPasswordResetUrl : config.mail.passwordResetUrl;
  return `${base}?token=${encodeURIComponent(token)}`;
}

async function sendPasswordReset({ to, name, token, minutes = config.auth.resetMinutes, backOffice = false }) {
  return sendSafely({ to, ...passwordResetMessage({ name, resetUrl: resetUrlFor(token, { backOffice }), minutes }) });
}

async function sendPasswordChanged({ to, name }) {
  return sendSafely({ to, ...passwordChangedMessage({ name }) });
}

module.exports = {
  sendPasswordReset,
  sendPasswordChanged,
  send,
  sendSafely,
  resetUrlFor,
  passwordResetMessage,
  setTransportForTests,
};
