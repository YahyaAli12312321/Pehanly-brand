import { humanize } from "../../lib/format";

const GREEN = ["bg-[#cce9de] text-[#052019]", "bg-[#0f2922]"];
const AMBER = ["bg-[#ffdcc3] text-[#6e3900]", "bg-[#d37300]"];
const SLATE_BLUE = ["bg-[#d5e0f8] text-[#111c2d]", "bg-[#545f73]"];
const BLUE = ["bg-[#dce9ff] text-[#0f2922]", "bg-[#4a645b]"];
const RED = ["bg-[#ffdad6] text-[#93000a]", "bg-[#ba1a1a]"];
const WARN = ["bg-[#ffdcc3]/80 text-[#3c1c00]", "bg-[#d37300]"];
const NEUTRAL_MUTED = ["bg-[#e5eeff] text-[#545f73]", "bg-[#727975]"];
const NEUTRAL = ["bg-[#e5eeff] text-[#0b1c30]", "bg-[#727975]"];

const has = (norm, words) => words.some((w) => norm === w || norm.split(" ").includes(w));

/** Colour a status. Handles backend snake_case values ("under_review", "partially_refunded"). */
const pick = (norm) => {
  // Negative / muted states first so "inactive" is never mistaken for "active".
  if (has(norm, ["inactive", "expired", "disabled", "hidden", "archived", "closed", "unpublished"])) return NEUTRAL_MUTED;
  if (has(norm, ["cancelled", "canceled", "failed", "rejected", "declined", "critical", "oos", "blocked", "suspended", "deactivated"]) || norm === "out of stock" || norm === "out") return RED;
  if (has(norm, ["low", "refund", "refunded", "partially", "partial", "overdue"]) || norm.includes("low stock")) return WARN;
  if (has(norm, ["pending", "awaiting", "review", "draft", "new", "requested", "submitted", "unpaid"])) return AMBER;
  if (has(norm, ["shipped", "converted", "dispatched", "transit"])) return BLUE;
  if (has(norm, ["processing", "confirmed", "scheduled", "quoted", "quote", "packed", "preparing", "production"])) return SLATE_BLUE;
  if (has(norm, ["active", "paid", "delivered", "accepted", "live", "approved", "completed", "complete", "ok", "success", "enabled", "published", "resolved", "verified"]) || norm === "in stock") return GREEN;
  return NEUTRAL;
};

export const StatusBadge = ({
  status,
  variant,
  size = "md",
  dot = true,
  className = ""
}) => {
  const raw = String(variant || status || "");
  const norm = raw.toLowerCase().replace(/[_-]+/g, " ").trim();
  const [bg, dotColor] = pick(norm);
  const label = /[_-]/.test(String(status ?? "")) || /^[a-z]/.test(String(status ?? "")) ? humanize(status) : status;
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[10px] leading-tight font-semibold" : "px-2.5 py-0.5 text-xs font-semibold";
  return <span
    className={`inline-flex items-center gap-1.5 rounded-full uppercase tracking-wider font-sans whitespace-nowrap ${sizeClasses} ${bg} ${className}`}
  >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />}
      <span>{label}</span>
    </span>;
};
