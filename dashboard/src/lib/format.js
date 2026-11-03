/** Display helpers. All dates from the API are ISO strings; all money is whole PKR unless noted. */

export const humanize = (value) =>
  String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const formatNumber = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? "-" : Number(n).toLocaleString("en-PK"));

export const formatMoney = (n, { currency = "PKR", compact = false } = {}) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  const value = Number(n);
  if (compact && Math.abs(value) >= 1000) {
    const fmt = new Intl.NumberFormat("en-PK", { notation: "compact", maximumFractionDigits: 1 }).format(value);
    return `${currency} ${fmt}`;
  }
  return `${currency} ${value.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
};

const parse = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDate = (iso) => {
  const d = parse(iso);
  return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
};

export const formatDateTime = (iso) => {
  const d = parse(iso);
  return d ? d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
};

export const timeAgo = (iso) => {
  const d = parse(iso);
  if (!d) return "-";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
};

/** <input type="date"> value (yyyy-mm-dd) -> ISO string at the start/end of that day (local). */
export const dateInputToIso = (value, endOfDay = false) => {
  if (!value) return undefined;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

/** ISO -> yyyy-mm-dd for <input type="date"> */
export const isoToDateInput = (iso) => {
  const d = parse(iso);
  if (!d) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const truncate = (s, n = 60) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || "");
