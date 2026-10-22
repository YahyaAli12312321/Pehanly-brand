/**
 * Turns dashboard `attention` counters into actionable rows. Every row deep-links to the screen that resolves it.
 * `permission` is the module permission needed to open the target; callers hide rows the user cannot act on.
 */
export const attentionItems = (a = {}) => [
  { key: "pendingCancellations", label: "Cancellation requests awaiting review", count: a.pendingCancellations, to: "/orders", permission: "orders.read", tone: "danger" },
  { key: "pendingReturns", label: "Return requests awaiting review", count: a.pendingReturns, to: "/returns?status=pending", permission: "orders.read", tone: "danger" },
  { key: "outOfStockSkus", label: "SKUs out of stock", count: a.outOfStockSkus, to: "/inventory?filter=out", permission: "inventory.read", tone: "danger" },
  { key: "lowStockSkus", label: "SKUs running low", count: a.lowStockSkus, to: "/inventory?filter=low", permission: "inventory.read", tone: "warn" },
  { key: "acceptedQuotesToConvert", label: "Accepted quotes ready to convert to orders", count: a.acceptedQuotesToConvert, to: "/quotes", permission: "quotes.read", tone: "warn" },
  { key: "pendingWholesaleRequests", label: "Wholesale applications pending", count: a.pendingWholesaleRequests, to: "/wholesale", permission: "wholesale.read", tone: "info" },
  { key: "pendingManufacturingRequests", label: "Manufacturing requests pending", count: a.pendingManufacturingRequests, to: "/manufacturing", permission: "manufacturing.read", tone: "info" },
  { key: "pendingPrintingRequests", label: "Printing requests pending", count: a.pendingPrintingRequests, to: "/printing", permission: "printing.read", tone: "info" },
  { key: "pendingReviews", label: "Customer reviews awaiting moderation", count: a.pendingReviews, to: "/reviews", permission: "reviews.read", tone: "info" },
  { key: "quotesAwaitingCustomer", label: "Quotes sent, awaiting customer reply", count: a.quotesAwaitingCustomer, to: "/quotes", permission: "quotes.read", tone: "muted" },
];

export const totalAttention = (a = {}) => attentionItems(a).filter((i) => i.tone !== "muted").reduce((s, i) => s + (i.count || 0), 0);
