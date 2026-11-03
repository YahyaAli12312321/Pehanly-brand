export const formatPKR = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return `Rs. ${n.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
};

export const formatDate = (value, options = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', options);
};

export const discountPercent = (price, compareAt) => {
  const p = Number(price);
  const c = Number(compareAt);
  if (!Number.isFinite(p) || !Number.isFinite(c) || c <= p || c <= 0) return 0;
  return Math.round(((c - p) / c) * 100);
};

export const ORDER_STATUS_LABELS = {
  pending: 'Order Placed',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const PAYMENT_STATUS_LABELS = {
  pending: 'Pending',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
};

/** Pakistani mobile / landline sanity check used for client-side UX only. */
export const isValidPhone = (value) => /^(\+?92|0)?[0-9\s-]{9,13}$/.test(String(value || '').trim());
export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
