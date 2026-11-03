import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { dashboardApi, ANALYTICS_RANGES } from "../services/dashboardApi";
import { inventoryApi } from "../services/inventoryApi";
import { wholesaleApi } from "../services/wholesaleApi";
import { keys } from "../lib/queryKeys";
import { attentionItems } from "../lib/attention";
import { useUIStore } from "../store/uiStore";
import { useAuth } from "../hooks/useAuth";
import { formatDateTime, formatMoney, formatNumber, humanize, timeAgo } from "../lib/format";
import { StatCard } from "../components/common/StatCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { DollarSign, ShoppingBag, TrendingUp, RotateCcw, AlertCircle, Clock, Eye, ArrowRight, RefreshCw } from "lucide-react";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const THEME = { primary: "#0F2922", secondary: "#45546D", slate: "#82918F", muted: "#A8C1BA", softGreen: "#CDE9DE", panel: "#EDF2FF", grid: "#DEE5EF", danger: "#BA1A1A", amber: "#D37300" };
const STATUS_COLORS = { delivered: THEME.primary, shipped: THEME.secondary, processing: THEME.slate, confirmed: THEME.softGreen, pending: THEME.amber, cancelled: THEME.danger };
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
const tooltipStyle = { background: "#FFFFFF", border: "1px solid #DEE5EF", borderRadius: "9px", padding: "10px 12px", fontSize: "11px", color: THEME.primary, boxShadow: "0 8px 24px rgba(15,41,34,0.12)" };
const CHANNELS = [["All", null], ["Retail", "retail"], ["Wholesale", "wholesale"], ["Manufacturing", "manufacturing"], ["Printing", "printing"]];

const Card = ({ children, className = "" }) => <div className={`min-w-0 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
const CardHeader = ({ title, subtitle, action }) => <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3"><div><h2 className="text-sm font-bold text-slate-900">{title}</h2>{subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}</div>{action}</div>;
const SoftButton = ({ children, onClick }) => <button type="button" onClick={onClick} className="mt-3 w-full rounded-md bg-[#EDF2FF] px-3 py-2 text-xs font-semibold text-[#0F2922] transition-colors hover:bg-[#DDE7F6]">{children}</button>;
const pct = (v) => (v == null || Number.isNaN(Number(v)) ? null : { value: `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}%`, isPositive: v >= 0 });

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { setInventoryAlertsOpen, setB2bPipelineOpen, setAttentionQueueOpen } = useUIStore();
  const [range, setRange] = useState("30d");
  const [channel, setChannel] = useState(null);
  const [activeDonut, setActiveDonut] = useState(null);

  const summaryQuery = useQuery({ queryKey: keys.dashboard.summary, queryFn: dashboardApi.summary, refetchInterval: 60_000 });
  const analyticsQuery = useQuery({ queryKey: keys.analytics.range(range), queryFn: () => dashboardApi.analytics(range) });
  const lowStockQuery = useQuery({ queryKey: [...keys.inventory.lists(), "dashboard-alerts"], queryFn: () => inventoryApi.list({ filter: "critical", limit: 3 }), enabled: can("inventory.read") });
  const pendingWholesaleQuery = useQuery({ queryKey: [...keys.wholesale.lists(), "dashboard-pending"], queryFn: () => wholesaleApi.listRequests({ status: "pending", limit: 2 }), enabled: can("wholesale.read") });

  const s = summaryQuery.data;
  const a = analyticsQuery.data;
  const attention = s?.attention || {};
  const att = attentionItems(attention);
  const urgent = att.filter((i) => i.tone !== "muted" && i.count > 0 && can(i.permission)).slice(0, 3);
  const statusData = s ? Object.entries((s.orders?.byStatus || {})).map(([name, value]) => ({ name: humanize(name), key: name, value, color: STATUS_COLORS[name] || THEME.muted })).filter((d) => d.value > 0) : [];
  const totalOrders = statusData.reduce((n, d) => n + d.value, 0);
  const selectedStatus = activeDonut === null ? null : statusData[activeDonut];
  const recentOrders = (s?.recentOrders || []).filter((o) => !channel || o.orderType === channel);
  const chartData = (a?.revenuePerformance?.data || []).map((p) => ({ date: p.period, total: p.total }));
  const ov = a?.overview;
  const cmp = a?.comparison || {};

  const kpis = [
    { label: "Net Revenue", value: ov ? formatMoney(ov.netGmv, { compact: true }) : "—", trend: pct(cmp.netGmv), sub: ov ? `Gross ${formatMoney(ov.grossGmv, { compact: true })} · Refunded ${formatMoney(ov.completedRefunds, { compact: true })}` : "", Icon: DollarSign, path: "/analytics" },
    { label: "Total Orders", value: ov ? formatNumber(ov.orderCount) : "—", sub: s ? `${formatNumber(s.orders.today)} today · ${formatNumber(s.orders.thisWeek)} this week` : "", Icon: ShoppingBag, path: "/orders" },
    { label: "Average Order Value", value: ov ? formatMoney(ov.aov) : "—", trend: pct(cmp.aov), sub: "Net revenue ÷ orders in period", Icon: TrendingUp, path: "/analytics" },
    { label: "Return Rate", value: a ? `${a.returns.rate}%` : "—", sub: a ? `${a.returns.returnedOrders} returned of ${a.returns.deliveredOrders} delivered` : "", Icon: RotateCcw, path: "/returns" },
  ];
  const rangeLabel = ANALYTICS_RANGES.find((r) => r.value === range)?.label;

  if (summaryQuery.isError && analyticsQuery.isError) return <ErrorState error={summaryQuery.error} onRetry={() => { summaryQuery.refetch(); analyticsQuery.refetch(); }} />;

  return <div className="space-y-4">
      <section className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Dashboard Overview</h1>
          <p className="mt-1 text-xs text-slate-500">Monitor sales, orders, inventory and business operations across Retail &amp; B2B channels.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { summaryQuery.refetch(); analyticsQuery.refetch(); }} className="inline-flex items-center gap-1.5 rounded-md bg-[#EDF2FF] px-2.5 py-1.5 text-[11px] text-slate-600 hover:bg-[#DDE7F6]" title="Refresh">
            <RefreshCw className={`h-3.5 w-3.5 text-[#45546D] ${summaryQuery.isFetching || analyticsQuery.isFetching ? "animate-spin" : ""}`} />
            {s ? `Updated ${timeAgo(s.generatedAt)}` : "Loading…"}
          </button>
          <div className="flex rounded-md bg-[#EDF2FF] p-0.5">
            {ANALYTICS_RANGES.map((r) => <button key={r.value} type="button" onClick={() => setRange(r.value)} className={`rounded px-2.5 py-1.5 text-[11px] font-medium transition-colors ${range === r.value ? "bg-white font-semibold text-[#0F2922] shadow-sm" : "text-slate-600 hover:text-[#0F2922]"}`}>{r.label}</button>)}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((item) => <div key={item.label} className="min-w-0 [&>div]:h-full">
            <StatCard label={item.label} value={analyticsQuery.isLoading ? "…" : item.value} trend={item.trend ? { ...item.trend, label: "vs previous period" } : undefined} subtext={item.sub} icon={<item.Icon className="h-4 w-4 text-[#0F2922]" />} onClick={() => navigate(item.path)} />
          </div>)}
      </section>
      {analyticsQuery.isError && <p className="text-xs text-rose-600">Couldn't load analytics figures. <button className="underline" onClick={() => analyticsQuery.refetch()}>Retry</button></p>}

      <section className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader title="Revenue Overview" subtitle={`Order revenue over the last ${rangeLabel?.toLowerCase()} (non-cancelled orders — not profit)`} />
          <div className="my-3 grid grid-cols-3 gap-2 rounded-md bg-[#EDF2FF] p-3">
            {[["Today", s?.revenue.today], ["This Week", s?.revenue.thisWeek], ["This Month", s?.revenue.thisMonth]].map(([label, value]) => <div key={label} className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words font-mono text-xs font-bold text-[#0F2922] sm:text-sm">{value == null ? "—" : formatMoney(value)}</p></div>)}
          </div>
          <div className="h-60 w-full sm:h-64">
            {analyticsQuery.isLoading ? <LoadingSkeleton rows={5} /> : chartData.length === 0 ? <div className="flex h-full items-center justify-center text-xs text-slate-400">No order revenue in this period.</div> : <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 2 }}>
                  <defs><linearGradient id="dashboard-net-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={THEME.primary} stopOpacity={0.18} /><stop offset="100%" stopColor={THEME.primary} stopOpacity={0.01} /></linearGradient></defs>
                  <CartesianGrid stroke={THEME.grid} strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false} dy={8} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={compact} tickLine={false} axisLine={false} width={42} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatMoney(v), "Revenue"]} cursor={{ stroke: THEME.secondary, strokeDasharray: "3 3" }} />
                  <Area type="monotone" dataKey="total" name="Revenue" stroke={THEME.primary} strokeWidth={2.8} fill="url(#dashboard-net-fill)" dot={false} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 3 }} />
                </AreaChart>
              </ResponsiveContainer>}
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            <span>Open B2B pipeline: <strong className="text-[#0F2922]">{formatNumber((attention.pendingWholesaleRequests || 0) + (attention.pendingManufacturingRequests || 0) + (attention.pendingPrintingRequests || 0))} pending requests</strong></span>
            <span>Timezone: {s?.timezone || "—"}</span>
          </div>
        </Card>

        <Card className="flex flex-col lg:col-span-4">
          <CardHeader title="Order Overview" subtitle={`${formatNumber(totalOrders)} orders in total`} action={<button onClick={() => navigate("/orders")} className="text-xs font-semibold text-[#0F2922] hover:underline">View</button>} />
          {summaryQuery.isLoading ? <div className="py-6"><LoadingSkeleton rows={4} /></div> : totalOrders === 0 ? <p className="py-10 text-center text-xs text-slate-400">No orders yet.</p> : <>
              <div className="relative my-2 h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={49} outerRadius={69} paddingAngle={2} stroke="#fff" strokeWidth={1.5} onMouseEnter={(_, i) => setActiveDonut(i)} onMouseLeave={() => setActiveDonut(null)}>
                      {statusData.map((item, i) => <Cell key={item.key} fill={item.color} opacity={activeDonut === null || activeDonut === i ? 1 : 0.4} style={{ cursor: "pointer", outline: "none" }} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [`${value} Orders`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="font-mono text-xl font-bold text-[#0F2922]">{formatNumber(selectedStatus?.value ?? totalOrders)}</span><span className="text-[10px] font-semibold uppercase text-slate-500">{selectedStatus ? "Selected" : "Orders"}</span></div>
              </div>
              <div className="space-y-0.5">
                {statusData.map((item, i) => <button key={item.key} type="button" onMouseEnter={() => setActiveDonut(i)} onMouseLeave={() => setActiveDonut(null)} onClick={() => navigate("/orders")} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-[#EDF2FF]">
                    <span className="flex min-w-0 items-center gap-2 text-slate-700"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} /><span className="truncate">{item.name}</span></span>
                    <span className="flex shrink-0 gap-2 font-mono"><strong className="text-[#0F2922]">{item.value}</strong><span className="w-11 text-right text-slate-500">{((item.value / totalOrders) * 100).toFixed(1)}%</span></span>
                  </button>)}
              </div>
            </>}
          <div className="mt-auto"><SoftButton onClick={() => navigate("/orders")}>View All Orders</SoftButton></div>
        </Card>
      </section>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-2"><h2 className="text-sm font-bold text-slate-900">Recent Orders</h2><span className="font-mono text-[11px] text-slate-400">Latest {s?.recentOrders?.length ?? 0}</span></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md bg-[#EDF2FF] p-0.5">
              {CHANNELS.map(([label, val]) => <button key={label} onClick={() => setChannel(val)} className={`rounded px-2.5 py-1 text-[11px] font-medium ${channel === val ? "bg-white font-semibold text-[#0F2922] shadow-sm" : "text-slate-600 hover:text-[#0F2922]"}`}>{label}</button>)}
            </div>
            <button onClick={() => navigate("/orders")} className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F2922] hover:underline">View All Orders <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left text-xs">
            <thead><tr className="border-y border-slate-200 bg-[#EDF2FF] text-[10px] font-semibold uppercase tracking-wide text-[#45546D]">
              {["Order ID", "Customer", "Channel", "Total (PKR)", "Payment", "Order Status", "Placed", "Action"].map((h) => <th key={h} className={`px-3 py-2.5 ${["Total (PKR)", "Action"].includes(h) ? "text-right" : ""}`}>{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {summaryQuery.isLoading ? <tr><td colSpan={8} className="p-4"><LoadingSkeleton rows={3} /></td></tr> : recentOrders.length === 0 ? <tr><td colSpan={8} className="py-8 text-center text-slate-400">{s?.recentOrders?.length ? "No recent orders in this channel." : "No orders yet."}</td></tr> : recentOrders.map((o) => <tr key={o.id} className="cursor-pointer transition-colors hover:bg-[#F3F6FC]" onClick={() => navigate(`/orders/${o.id}`)}>
                  <td className="px-3 py-2.5 font-mono font-bold text-slate-900">#{o.orderNumber}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-900">{o.customerName || "Guest"}</td>
                  <td className="px-3 py-2.5"><span className="rounded bg-[#EDF2FF] px-2 py-0.5 text-[11px] text-[#45546D]">{humanize(o.orderType)}</span></td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">{formatMoney(o.total)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={o.paymentStatus} size="sm" /></td>
                  <td className="px-3 py-2.5"><StatusBadge status={o.orderStatus} size="sm" /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{formatDateTime(o.placedAt)}</td>
                  <td className="px-3 py-2.5 text-right"><button title="Inspect Order" onClick={(e) => { e.stopPropagation(); navigate(`/orders/${o.id}`); }} className="rounded p-1 text-slate-500 hover:bg-[#EDF2FF] hover:text-[#0F2922]"><Eye className="h-4 w-4" /></button></td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader title="Inventory Alerts" action={<div className="flex gap-1 text-[10px] font-bold"><span className="rounded bg-red-50 px-2 py-0.5 text-[#BA1A1A]">{attention.outOfStockSkus ?? "—"} OOS</span><span className="rounded bg-amber-50 px-2 py-0.5 text-[#D37300]">{attention.lowStockSkus ?? "—"} Low</span></div>} />
          <p className="mt-2 text-[11px] text-slate-500">Available = Total On-Hand − Reserved Orders</p>
          <div className="mt-3 space-y-2">
            {!can("inventory.read") ? <p className="text-[11px] text-slate-400">You don't have access to inventory.</p> : lowStockQuery.isLoading ? <LoadingSkeleton rows={2} /> : lowStockQuery.isError ? <p className="text-[11px] text-rose-600">Couldn't load inventory alerts.</p> : (lowStockQuery.data?.items || []).length === 0 ? <p className="text-[11px] text-slate-400">No stock alerts right now.</p> : lowStockQuery.data.items.map((inv) => <div key={inv.sku} className="flex items-center justify-between gap-2 rounded-md bg-[#EDF2FF] p-2.5">
                <div className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-900">{inv.product?.name}</span><span className="font-mono text-[10px] text-slate-500">{inv.sku}</span></div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${inv.available <= 0 ? "bg-red-100 text-[#BA1A1A]" : "bg-amber-100 text-[#D37300]"}`}>{inv.available <= 0 ? "Out of Stock" : `${inv.available} Left`}</span>
              </div>)}
          </div>
          <div className="mt-auto pt-2"><SoftButton onClick={() => setInventoryAlertsOpen(true)}>View Inventory Drawer</SoftButton></div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Wholesale & Custom Requests" action={<span className="rounded bg-[#CDE9DE] px-2 py-0.5 text-[10px] font-bold text-[#0F2922]">{(attention.pendingWholesaleRequests || 0) + (attention.pendingManufacturingRequests || 0) + (attention.pendingPrintingRequests || 0)} Pending</span>} />
          <p className="mt-2 text-[11px] text-slate-500">Wholesale {attention.pendingWholesaleRequests ?? "—"} · Manufacturing {attention.pendingManufacturingRequests ?? "—"} · Printing {attention.pendingPrintingRequests ?? "—"}</p>
          <div className="mt-3 space-y-2">
            {!can("wholesale.read") ? null : pendingWholesaleQuery.isLoading ? <LoadingSkeleton rows={2} /> : (pendingWholesaleQuery.data?.items || []).length === 0 ? <p className="text-[11px] text-slate-400">No pending wholesale applications.</p> : pendingWholesaleQuery.data.items.map((req) => <div key={req._id} className="space-y-1 rounded-md bg-[#EDF2FF] p-2.5 text-xs">
                <div className="flex justify-between gap-2"><span className="font-mono font-bold text-slate-900">{req.requestNumber}</span><span className="text-[10px] text-slate-500">{timeAgo(req.createdAt)}</span></div>
                <p className="truncate text-slate-700">{req.customer?.businessName || req.customer?.name}</p>
                <div className="flex justify-between gap-2 text-[11px]"><span className="font-semibold text-[#0F2922]">{humanize(req.status)}</span><span className="font-mono font-bold text-slate-900">{req.pricing?.estimatedTotal != null ? formatMoney(req.pricing.estimatedTotal) : ""}</span></div>
              </div>)}
          </div>
          <div className="mt-auto pt-2"><SoftButton onClick={() => setB2bPipelineOpen(true)}>View All Requests Drawer</SoftButton></div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title="Needs Attention" action={urgent.length > 0 ? <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-[#BA1A1A]">Action Req.</span> : null} />
          <p className="mt-2 text-[11px] text-slate-500">Cancellations, returns, stock and quotes needing a decision</p>
          <div className="mt-3 space-y-2">
            {summaryQuery.isLoading ? <LoadingSkeleton rows={2} /> : urgent.length === 0 ? <p className="text-[11px] text-slate-400">Nothing needs attention right now.</p> : urgent.map((i) => <button key={i.key} onClick={() => navigate(i.to)} className="flex w-full items-start gap-2 rounded-md bg-[#EDF2FF] p-2.5 text-left hover:bg-[#DDE7F6]">
                {i.tone === "danger" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#BA1A1A]" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#D37300]" />}
                <div><p className="text-xs font-bold text-slate-900">{i.count} · {i.label}</p></div>
              </button>)}
          </div>
          <div className="mt-auto pt-2"><SoftButton onClick={() => setAttentionQueueOpen(true)}>Open Attention Queue Drawer</SoftButton></div>
        </Card>
      </section>

      <Card>
        <CardHeader title="Work Queue" subtitle="Live counts from the backend. Select a tile to open the screen that resolves it." />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {att.filter((i) => can(i.permission)).map((i) => <button key={i.key} onClick={() => navigate(i.to)} className="flex flex-col justify-between gap-2 rounded-md border border-[#E1E7F2] bg-[#EDF2FF]/60 p-3 text-left hover:bg-[#EDF2FF]">
              <span className={`font-mono text-xl font-bold ${i.count > 0 && i.tone === "danger" ? "text-[#BA1A1A]" : "text-[#0F2922]"}`}>{summaryQuery.isLoading ? "…" : i.count ?? "—"}</span>
              <span className="text-[11px] leading-snug text-slate-600">{i.label}</span>
            </button>)}
        </div>
        {s?.note && <p className="mt-3 text-[10px] text-slate-400">{s.note}</p>}
      </Card>
    </div>;
};
