/**
 * Order lifecycle as defined by the backend (constants/Order.js). The backend ENFORCES it
 * (409 INVALID_ORDER_STATUS_TRANSITION); the UI only mirrors it so it doesn't offer impossible moves.
 */
export const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];

export const ORDER_STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export const ORDER_TYPES = {
  retail: "Retail E-Com",
  wholesale: "Wholesale B2B",
  manufacturing: "Manufacturing",
  printing: "Printing & DTG",
};

export const PAYMENT_STATUSES = ["pending", "processing", "paid", "failed", "cancelled", "refunded", "partially_refunded"];

export const typeBadgeClass = (type) =>
  type === "wholesale"
    ? "bg-amber-50 text-amber-800 border-amber-200"
    : type === "manufacturing"
      ? "bg-purple-50 text-purple-800 border-purple-200"
      : type === "printing"
        ? "bg-blue-50 text-blue-800 border-blue-200"
        : "bg-slate-100 text-slate-800 border-slate-200";

export const itemTitle = (item) =>
  item.productName ||
  item.manufacturingStyleName ||
  item.printingServiceName ||
  "Item";

export const itemSubtitle = (item) =>
  [item.colorName && `Color: ${item.colorName}`, item.size && `Size: ${item.size}`, item.manufacturingVariantName, item.skuCode]
    .filter(Boolean);
