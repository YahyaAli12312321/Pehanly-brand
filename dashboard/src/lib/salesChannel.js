/**
 * Where a product is sold. Mirrors the backend (constants/salesChannel.js): retail only, wholesale only, or both.
 * The backend decides what each channel exposes; this file only labels it.
 */
export const SALES_CHANNELS = [
  { value: "retail", label: "Retail only", hint: "Sold in the storefront. Not offered to wholesale buyers." },
  { value: "wholesale", label: "Wholesale only", hint: "Hidden from the storefront: no listing, search or product page. Available to wholesale packs and the wholesale catalogue." },
  { value: "both", label: "Retail & wholesale", hint: "Sold in the storefront and offered to wholesale buyers." },
];

/** Effective channel of a product returned by the API (older products without the field are derived from the wholesale flag). */
export const channelOfProduct = (p) => p?.salesChannel || (p?.wholesale?.isEnabled ? "both" : "retail");

export const channelLabel = (channel) => SALES_CHANNELS.find((c) => c.value === channel)?.label || "Retail only";
