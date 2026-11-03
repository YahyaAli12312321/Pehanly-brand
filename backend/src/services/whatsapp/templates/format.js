'use strict';

/* Shared helpers for message text. Templates only print values they are given; nothing is guessed or invented. */

const present = (v) => v !== undefined && v !== null && String(v).trim() !== '';

function money(amount, currency = 'PKR') {
  if (!present(amount) || Number.isNaN(Number(amount))) return '';
  const n = Number(amount);
  if (String(currency).toUpperCase() === 'USD') return `$${n.toFixed(2)}`;
  return `Rs. ${Math.round(n).toLocaleString('en-PK')}`;
}

const PAYMENT_METHODS = { cod: 'Cash on Delivery', jazzcash: 'JazzCash', jazzcash_manual: 'JazzCash (manual wallet)', bank_transfer: 'Bank transfer' };
const paymentMethod = (m) => (present(m) ? PAYMENT_METHODS[m] || String(m).replace(/_/g, ' ') : '');

/** Joins lines, dropping the ones whose value is missing. A line is [text] or [label, value]. */
function lines(parts) {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== false)
    .map((p) => (Array.isArray(p) ? (present(p[1]) ? `${p[0]}: ${p[1]}` : null) : p))
    .filter((p) => p !== null && String(p).trim() !== '')
    .join('\n');
}

const greet = (name) => (present(name) ? `Hello ${String(name).trim()},` : 'Hello,');

module.exports = { present, money, paymentMethod, lines, greet };
