'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isEmail(value) {
  return EMAIL_RE.test(normalizeEmail(value));
}

/**
 * Canonical phone: Pakistan numbers become +92XXXXXXXXXX; other valid international
 * numbers are kept as E.164. Returns null when the input is not a plausible number.
 */
function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  let v = value.trim().replace(/[\s\-().]/g, '');
  if (!v) return null;
  if (v.startsWith('00')) v = `+${v.slice(2)}`;
  if (/^0\d{10}$/.test(v)) v = `+92${v.slice(1)}`; // 03001234567
  else if (/^92\d{10}$/.test(v)) v = `+${v}`;
  if (v.startsWith('+92')) return /^\+92[1-9]\d{9}$/.test(v) ? v : null;
  return /^\+[1-9]\d{7,14}$/.test(v) ? v : null;
}

module.exports = { normalizeEmail, isEmail, normalizePhone };
