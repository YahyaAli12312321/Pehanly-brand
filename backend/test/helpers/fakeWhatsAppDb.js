'use strict';

/*
 * In-memory stand-in for the WhatsAppMessage collection plus the few other models the notification code reads.
 * It enforces the unique idempotencyKey index (E11000), applies $set / $inc, and supports the query shapes the service uses.
 * It is NOT MongoDB: real index creation / query planning are not exercised (see the report).
 */
const path = require('node:path');
const mongoose = require('mongoose');

const SRC = path.join(__dirname, '..', '..', 'src');
const load = (...p) => require(path.join(SRC, ...p));

const S = (v) => (v === undefined || v === null ? v : String(v));
const get = (o, k) => k.split('.').reduce((a, p) => (a === undefined || a === null ? undefined : a[p]), o);

function match(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === '$or') return cond.some((f) => match(doc, f));
    if (k === '$expr') return Number(doc.attempts) < Number(doc.maxAttempts); // the only $expr the service uses
    const v = get(doc, k);
    if (cond instanceof RegExp) return cond.test(String(v ?? ''));
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !(cond instanceof mongoose.Types.ObjectId)) {
      return Object.entries(cond).every(([op, c]) => {
        if (op === '$in') return c.map(S).includes(S(v));
        if (op === '$ne') return S(v) !== S(c) && !(c === null && v == null);
        if (op === '$gte') return v >= c;
        if (op === '$lte') return v <= c;
        if (op === '$lt') return v < c;
        return true;
      });
    }
    return S(v) === S(cond);
  });
}

function chain(rows, { many = false } = {}) {
  let list = rows;
  const api = {
    sort(spec) { const [[k, dir]] = Object.entries(spec); list = [...list].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir); return api; },
    skip(n) { list = list.slice(n); return api; },
    limit(n) { list = list.slice(0, n); return api; },
    select() { return api; },
    lean() { return api; },
    then(res, rej) { return Promise.resolve(many ? list.map(clone) : list[0] ? clone(list[0]) : null).then(res, rej); },
  };
  return api;
}
const clone = (d) => JSON.parse(JSON.stringify(d), (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(v) ? new Date(v) : v));

function install() {
  const WA = load('models', 'WhatsAppMessage.js');
  const db = { rows: [], seq: 0, providerCalls: [] };

  WA.create = async (doc) => {
    if (db.rows.some((r) => r.idempotencyKey === doc.idempotencyKey)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    db.seq += 1;
    const row = { _id: new mongoose.Types.ObjectId(), createdAt: new Date(Date.now() + db.seq), status: 'pending', attempts: 0, error: { code: null, message: null, retryable: false }, maxAttempts: 3, nextAttemptAt: null, ...doc };
    row.error = { code: null, message: null, retryable: false, ...(doc.error || {}) };
    db.rows.push(row);
    return clone(row);
  };
  WA.findOne = (f) => chain(db.rows.filter((r) => match(r, f)));
  WA.findById = (id) => chain(db.rows.filter((r) => S(r._id) === S(id)));
  WA.find = (f = {}) => chain(db.rows.filter((r) => match(r, f)), { many: true });
  WA.countDocuments = async (f = {}) => db.rows.filter((r) => match(r, f)).length;
  const apply = (row, update) => {
    for (const [k, v] of Object.entries(update.$set || {})) {
      if (k.startsWith('error') && typeof v === 'object' && !Array.isArray(v)) row.error = v;
      else row[k] = v;
    }
    for (const [k, v] of Object.entries(update.$inc || {})) row[k] = (row[k] || 0) + v;
  };
  WA.findOneAndUpdate = async (f, update) => { const row = db.rows.find((r) => match(r, f)); if (!row) return null; apply(row, update); return clone(row); };
  WA.findByIdAndUpdate = async (id, update) => { const row = db.rows.find((r) => S(r._id) === S(id)); if (!row) return null; apply(row, update); return clone(row); };
  WA.updateOne = async (f, update) => { const row = db.rows.find((r) => match(r, f)); if (row) apply(row, update); return { matchedCount: row ? 1 : 0 }; };

  return db;
}

module.exports = { install, clone };
