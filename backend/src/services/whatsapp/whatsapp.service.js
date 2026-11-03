'use strict';

/*
 * Central WhatsApp notification service. Business modules never talk to a provider: they call the helpers in ./events.js,
 * which call dispatch() here. dispatch():
 *   1. renders the template, 2. normalises the phone (missing / invalid => a "skipped" record, never an exception),
 *   3. stores the message under a unique idempotency key (the same event is never recorded or sent twice),
 *   4. calls the configured provider and stores the result (sent / failed, attempts, error, provider message id).
 * Failures are contained: the *Safe variants never throw, so an order / payment / stock operation can not be rolled back or
 * rejected because WhatsApp failed. Status "sent" with provider "mock" is a SIMULATION (record.simulated === true).
 */

const mongoose = require('mongoose');
const WhatsAppMessage = require('../../models/WhatsAppMessage');
const User = require('../../models/User');
const logger = require('../../config/logger');
const { config } = require('../../config/env');
const { normalizePhone } = require('../../utils/identity');
const { WHATSAPP_STATUSES: S, WHATSAPP_EVENTS, audienceOf } = require('../../constants/WhatsApp');
const { getProvider } = require('./provider');
const templates = require('./templates');
const ApiError = require('../../utils/ApiError');

const VALID_EVENTS = new Set(Object.values(WHATSAPP_EVENTS));
const BACKOFF_BASE_MS = 60 * 1000;

/** Template variables are stored on the record: keep primitives only, bounded, never secrets. */
function cleanVariables(variables = {}) {
  const out = {};
  for (const [k, v] of Object.entries(variables)) {
    if (/token|secret|password|authorization/i.test(k)) continue;
    if (v === undefined || v === null) continue;
    if (['string', 'number', 'boolean'].includes(typeof v)) out[k] = typeof v === 'string' ? v.slice(0, 500) : v;
  }
  return out;
}

const toObjectId = (v) => (v && mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);

/** What the API returns for a message: no idempotency key, no internal simulation flag. */
function view(message) {
  if (!message) return null;
  const m = typeof message.toObject === 'function' ? message.toObject() : { ...message };
  delete m.idempotencyKey;
  delete m.__v;
  if (m.variables) {
    m.variables = { ...m.variables };
    delete m.variables.__simulate;
  }
  return m;
}

/** Safe, secret-free view of the configuration for the admin dashboard. */
function publicConfig() {
  const provider = getProvider();
  return {
    provider: config.whatsapp.provider,
    simulated: provider ? Boolean(provider.isSimulated) : false,
    enabled: Boolean(provider),
    maxAttempts: config.whatsapp.maxAttempts,
    metaConfigured: Boolean(config.whatsapp.meta.accessToken && config.whatsapp.meta.phoneNumberId),
  };
}

/* ------------------------------------------------------------------ recipients */

/** Active owner accounts (their own phone) plus WHATSAPP_ADMIN_NUMBERS, de-duplicated by normalised phone. */
async function adminRecipients() {
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id name phone').lean();
  const seen = new Map();
  for (const a of admins) {
    const phone = normalizePhone(a.phone || '');
    seen.set(phone || `no-phone:${a._id}`, { id: a._id, name: a.name, phone: a.phone });
  }
  for (const raw of config.whatsapp.adminNumbers) {
    const phone = normalizePhone(raw);
    if (phone && !seen.has(phone)) seen.set(phone, { id: null, name: 'Admin', phone: raw });
  }
  return [...seen.values()];
}

/* ------------------------------------------------------------------ sending */

function backoff(attempts) {
  return new Date(Date.now() + BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
}

/** Claims the record (so two workers never send it twice), calls the provider, stores the outcome. */
async function attempt(id) {
  const provider = getProvider();
  if (!provider) return WhatsAppMessage.findById(id);

  const record = await WhatsAppMessage.findOneAndUpdate(
    { _id: id, status: { $in: [S.PENDING, S.FAILED] } },
    { $set: { status: S.PROCESSING, lastAttemptAt: new Date(), provider: provider.name, simulated: Boolean(provider.isSimulated) }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (!record) return WhatsAppMessage.findById(id); // already sent / being processed elsewhere

  let result;
  try {
    result = await provider.sendMessage({
      to: record.phone,
      template: record.template,
      variables: record.variables,
      message: record.body,
      simulate: record.variables?.__simulate,
    });
  } catch (error) {
    result = { ok: false, retryable: true, error: { code: 'PROVIDER_EXCEPTION', message: String(error?.message || error).slice(0, 300) } };
  }

  if (result?.ok) {
    return WhatsAppMessage.findByIdAndUpdate(
      id,
      { $set: { status: S.SENT, sentAt: new Date(), providerMessageId: result.messageId || null, simulated: Boolean(result.simulated ?? provider.isSimulated), nextAttemptAt: null, error: { code: null, message: null, retryable: false } } },
      { new: true },
    );
  }

  const retryable = Boolean(result?.retryable);
  const canRetry = retryable && record.attempts < record.maxAttempts;
  logger.warn({ id: String(id), event: record.event, code: result?.error?.code, attempts: record.attempts }, 'WhatsApp send failed');
  return WhatsAppMessage.findByIdAndUpdate(
    id,
    { $set: { status: S.FAILED, nextAttemptAt: canRetry ? backoff(record.attempts) : null, error: { code: result?.error?.code || 'SEND_FAILED', message: String(result?.error?.message || 'Send failed').slice(0, 300), retryable } } },
    { new: true },
  );
}

/**
 * Records and sends one message.
 * @param {object} p
 * @param {string} p.event             one of WHATSAPP_EVENTS
 * @param {{id?:any,name?:string,phone?:string}} p.recipient
 * @param {{type?:string,id?:any,reference?:string}} [p.entity]
 * @param {object} [p.variables]       values rendered into the template
 * @param {string} p.idempotencyKey    same key => same message: never recorded or sent twice
 * @param {boolean} [p.suppressRepeatState] inventory: skip when the latest message for this entity+event is the same state
 * @param {string} [p.simulate]        mock provider only: success | failure | temporary_failure
 */
async function dispatch({ event, recipient = {}, entity = {}, variables = {}, idempotencyKey, suppressRepeatState = false, simulate }) {
  if (!VALID_EVENTS.has(event)) throw new Error(`Unknown WhatsApp event "${event}"`);
  if (!idempotencyKey) throw new Error('WhatsApp dispatch requires an idempotencyKey');
  const provider = getProvider();
  if (!provider) return { skipped: true, reason: 'WHATSAPP_OFF' };

  const existing = await WhatsAppMessage.findOne({ idempotencyKey });
  if (existing) return { duplicate: true, message: existing };

  const entityId = toObjectId(entity.id);
  if (suppressRepeatState && entityId) {
    // per recipient: each admin is compared with the last stock message THEY were sent for this SKU
    const who = recipient.id ? { recipientId: toObjectId(recipient.id) } : { phone: normalizePhone(recipient.phone || '') || '' };
    const last = await WhatsAppMessage.findOne({ entityId, ...who, event: { $in: [WHATSAPP_EVENTS.ADMIN_LOW_STOCK, WHATSAPP_EVENTS.ADMIN_OUT_OF_STOCK, WHATSAPP_EVENTS.ADMIN_BACK_IN_STOCK] } })
      .sort({ createdAt: -1 })
      .select('event')
      .lean();
    if (last && last.event === event) return { duplicate: true, reason: 'SAME_STATE_ALREADY_NOTIFIED' };
  }

  const phone = normalizePhone(recipient.phone || '');
  const vars = cleanVariables(variables);
  if (simulate) vars.__simulate = simulate;
  const body = templates.render(event, vars);

  const doc = {
    event,
    recipientType: audienceOf(event),
    recipientId: toObjectId(recipient.id),
    recipientName: String(recipient.name || '').slice(0, 160),
    phone: phone || '',
    entityType: entity.type || null,
    entityId,
    reference: String(entity.reference || '').slice(0, 80),
    template: event,
    variables: vars,
    body,
    provider: provider.name,
    simulated: Boolean(provider.isSimulated),
    maxAttempts: config.whatsapp.maxAttempts,
    idempotencyKey,
  };

  if (!phone) {
    doc.status = S.SKIPPED;
    doc.error = { code: recipient.phone ? 'INVALID_PHONE' : 'NO_PHONE', message: recipient.phone ? 'The recipient phone number is not valid' : 'The recipient has no phone number', retryable: false };
  }

  let created;
  try {
    created = await WhatsAppMessage.create(doc);
  } catch (error) {
    if (error?.code === 11000) return { duplicate: true, message: await WhatsAppMessage.findOne({ idempotencyKey }) };
    throw error;
  }

  if (created.status === S.SKIPPED) return { skipped: true, reason: created.error.code, message: created };
  return { message: await attempt(created._id) };
}

/** One message per admin recipient. Key is suffixed per recipient so each admin is tracked (and de-duplicated) separately. */
async function dispatchToAdmins({ event, entity, variables, idempotencyKey, suppressRepeatState, simulate }) {
  const recipients = await adminRecipients();
  if (!recipients.length) return [];
  const out = [];
  for (const r of recipients) {
    const who = r.id ? String(r.id) : normalizePhone(r.phone) || r.phone;
    out.push(await dispatch({ event, recipient: r, entity, variables, idempotencyKey: `${idempotencyKey}:${who}`, suppressRepeatState, simulate }));
  }
  return out;
}

const safe = (label, fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    logger.error({ err: error?.message || error, label }, 'WhatsApp notification failed (ignored, business operation unaffected)');
    return null;
  }
};

const dispatchSafe = safe('dispatch', dispatch);
const dispatchToAdminsSafe = safe('dispatchToAdmins', dispatchToAdmins);

/* ------------------------------------------------------------------ retry */

/** Admin action: retry one failed message now (any failed message; skipped ones have no phone and can not be retried). */
async function retryMessage(id) {
  const record = await WhatsAppMessage.findById(id);
  if (!record) throw ApiError.notFound('Notification not found', 'WHATSAPP_NOT_FOUND');
  if (record.status !== S.FAILED) {
    throw ApiError.conflict(`Only failed notifications can be retried (this one is ${record.status})`, 'WHATSAPP_NOT_RETRYABLE');
  }
  // an explicit admin retry always gets at least one more attempt
  if (record.attempts >= record.maxAttempts) await WhatsAppMessage.updateOne({ _id: id }, { $set: { maxAttempts: record.attempts + 1 } });
  return attempt(id);
}

/** Maintenance task: retries temporary failures whose backoff has elapsed. */
async function retryDue(limit = 50) {
  const due = await WhatsAppMessage.find({ status: S.FAILED, 'error.retryable': true, nextAttemptAt: { $ne: null, $lte: new Date() }, $expr: { $lt: ['$attempts', '$maxAttempts'] } })
    .select('_id')
    .limit(limit)
    .lean();
  let sent = 0;
  for (const { _id } of due) {
    const r = await attempt(_id);
    if (r?.status === S.SENT) sent += 1;
  }
  return { scanned: due.length, sent };
}

/* ------------------------------------------------------------------ admin reads / actions */

const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function list({ page = 1, limit = 20, status, event, recipientType, search, from, to, provider }) {
  const filter = {};
  if (status) filter.status = status;
  if (event) filter.event = event;
  if (recipientType) filter.recipientType = recipientType;
  if (provider) filter.provider = provider;
  if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ reference: rx }, { recipientName: rx }, { phone: rx }];
  }
  const [items, total] = await Promise.all([
    WhatsAppMessage.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('-idempotencyKey -variables.__simulate').lean(),
    WhatsAppMessage.countDocuments(filter),
  ]);
  return { items: items.map(view), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }, config: publicConfig() };
}

async function get(id) {
  const m = await WhatsAppMessage.findById(id).select('-idempotencyKey').lean();
  if (!m) throw ApiError.notFound('Notification not found', 'WHATSAPP_NOT_FOUND');
  return view(m);
}

/** Test notification through the ACTIVE provider (the mock provider unless/until Meta is connected). */
async function sendTest({ to, simulate = 'success', actor } = {}) {
  const provider = getProvider();
  if (!provider) throw ApiError.conflict('WhatsApp notifications are switched off (WHATSAPP_PROVIDER=off)', 'WHATSAPP_OFF');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await dispatch({
    event: WHATSAPP_EVENTS.ADMIN_TEST,
    recipient: { id: actor?._id || null, name: actor?.name || 'Admin', phone: to },
    entity: { type: 'test', reference: 'TEST' },
    variables: { provider: provider.name, simulated: Boolean(provider.isSimulated) },
    idempotencyKey: `admin_test:${nonce}`,
    simulate,
  });
  return res.message || null;
}

module.exports = {
  publicConfig,
  view,
  adminRecipients,
  dispatch,
  dispatchSafe,
  dispatchToAdmins,
  dispatchToAdminsSafe,
  retryMessage,
  retryDue,
  list,
  get,
  sendTest,
  _attempt: attempt,
};
