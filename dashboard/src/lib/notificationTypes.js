/** Backend notification `type` -> the UI groups used by the drawer/page tabs. */
const GROUPS = {
  new_order: "order",
  low_stock: "inventory",
  out_of_stock: "inventory",
  back_in_stock: "inventory",
  new_wholesale_request: "b2b",
  new_manufacturing_request: "b2b",
  new_printing_request: "b2b",
  quote_accepted: "b2b",
  quote_rejected: "b2b",
  payment_success: "payment",
  payment_failed: "payment",
  new_return_request: "other",
  new_review: "other",
};

export const notificationGroup = (type) => GROUPS[type] || "other";

/** `type` values the backend accepts for ?type= when filtering a UI tab. */
export const TYPES_BY_TAB = {
  order: ["new_order"],
  inventory: ["low_stock", "out_of_stock", "back_in_stock"],
  b2b: ["new_wholesale_request", "new_manufacturing_request", "new_printing_request", "quote_accepted", "quote_rejected"],
};
