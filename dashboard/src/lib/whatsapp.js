/**
 * WhatsApp notification helpers for the admin dashboard.
 * "sent" from the MOCK provider is a simulation: the label says so, so nobody mistakes it for a real delivery.
 */
export const WHATSAPP_STATUS_OPTIONS = ["pending", "processing", "sent", "delivered", "failed", "skipped"];

export const WHATSAPP_RECIPIENT_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "customer", label: "Customer" },
];

export const SIMULATE_OPTIONS = [
  { value: "success", label: "Simulate success" },
  { value: "temporary_failure", label: "Simulate temporary failure (retryable)" },
  { value: "failure", label: "Simulate permanent failure" },
];

/** Label + whether it is simulated, e.g. { label: "Sent (simulated)", simulated: true } */
export function statusLabel(message) {
  const s = message?.status || "";
  if (s === "sent" && message?.simulated) return { label: "Sent (simulated)", simulated: true };
  if (s === "sent") return { label: "Sent", simulated: false };
  return { label: s ? s.charAt(0).toUpperCase() + s.slice(1) : "-", simulated: Boolean(message?.simulated) };
}

/** Only failed messages can be retried (skipped ones have no usable phone number). */
export const canRetry = (message) => message?.status === "failed";

/** "customer_order_shipped" -> "Customer order shipped" */
export const eventLabel = (event) => {
  const t = String(event || "").replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "-";
};

/** Query params for the list endpoint from the filter form (empty values dropped, dates as ISO). */
export function buildListParams({ page, limit, status, event, recipientType, search, from, to }, toIso) {
  const p = { page, limit };
  if (status && status !== "all") p.status = status;
  if (event && event !== "all") p.event = event;
  if (recipientType && recipientType !== "all") p.recipientType = recipientType;
  if (search && search.trim()) p.search = search.trim();
  const f = from ? toIso(from, false) : undefined;
  const t = to ? toIso(to, true) : undefined;
  if (f) p.from = f;
  if (t) p.to = t;
  return p;
}
