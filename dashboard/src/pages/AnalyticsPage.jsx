import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi, ANALYTICS_RANGES } from "../services/dashboardApi";
import { keys } from "../lib/queryKeys";
import { formatDate, formatMoney, formatNumber } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { ErrorState } from "../components/common/ErrorState";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const COLORS = { primary: "#0F2922", navy: "#45546D", slate: "#82918F", teal: "#A8C1BA", grid: "#DEE5EF" };
const STREAMS = [["retail", "Retail D2C", COLORS.primary], ["wholesale", "Wholesale B2B", COLORS.navy], ["manufacturing", "Manufacturing", COLORS.slate], ["printing", "Printing & Branding", COLORS.teal]];
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
const tooltipStyle = { background: "#FFFFFF", border: "1px solid #DEE5EF", borderRadius: "9px", fontSize: "11px", color: "#0F2922", padding: "10px 12px", boxShadow: "0 8px 24px rgba(15,41,34,0.12)" };

const ChartCard = ({ title, subtitle, children, className = "" }) => <section className={`min-w-0 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm ${className}`}>
    <div className="mb-4 border-b border-slate-100 pb-3"><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p></div>
    {children}
  </section>;

/** `change` is a percentage change (or percentage points for rate metrics). null = not enough data in the previous period. `lowerIsBetter` flips the colour. */
const MetricCard = ({ title, value, change, unit = "%", detail, lowerIsBetter = false }) => {
  const has = change != null && !Number.isNaN(Number(change));
  const up = has && change > 0, flat = has && change === 0;
  const good = has && (lowerIsBetter ? change < 0 : change > 0);
  return <div className="flex min-w-0 flex-col justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="max-w-[160px] text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</span>
        <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[10px] font-semibold ${!has || flat ? "bg-slate-100 text-slate-500" : good ? "bg-[#CDE9DE] text-[#0F2922]" : "bg-rose-50 text-rose-700"}`}>
          {!has || flat ? <Minus className="h-3 w-3" /> : up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {has ? `${change > 0 ? "+" : ""}${Number(change).toFixed(1)}${unit}` : "n/a"}
        </span>
      </div>
      <p className="break-words font-mono text-xl font-bold tracking-tight text-slate-900 xl:text-2xl">{value}</p>
      <div className="rounded-md bg-[#EDF2FF] px-2.5 py-2 text-[11px] text-slate-600">{detail}</div>
    </div>;
};

export const AnalyticsPage = () => {
  const [range, setRange] = useState("30d");
  const [activeDonut, setActiveDonut] = useState(null);
  const [activeBar, setActiveBar] = useState(null);
  const q = useQuery({ queryKey: keys.analytics.range(range), queryFn: () => dashboardApi.analytics(range) });
  const a = q.data;

  const series = a?.revenuePerformance?.data || [];
  const share = a ? STREAMS.map(([key, name, color]) => ({ key, name, color, value: a.revenueShare?.streams?.[key]?.share ?? 0, revenue: a.revenueShare?.streams?.[key]?.revenue ?? 0, orders: a.revenueShare?.streams?.[key]?.orders ?? 0 })) : [];
  const shareData = share.filter((s) => s.value > 0);
  const activeChannel = activeDonut === null ? null : shareData[activeDonut];
  const products = a?.topProducts?.products || [];
  const cmp = a?.comparison || {};
  const prev = a ? `${formatDate(a.previousPeriod.start)} – ${formatDate(a.previousPeriod.end)}` : "";

  return <div className="space-y-4">
      <PageHeader breadcrumb={[{ label: "System & Insights" }, { label: "Analytics" }]} title="Commerce & Operations Intelligence" description="Consolidated analytics across retail, wholesale, manufacturing and printing operations. All figures are order revenue (GMV), not profit."
        actions={<select value={range} onChange={(e) => setRange(e.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-[#0F2922] outline-none focus:border-[#45546D]" aria-label="Date range">{ANALYTICS_RANGES.map((r) => <option key={r.value} value={r.value}>Last {r.label}</option>)}</select>} />

      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Total Net GMV" value={a ? formatMoney(a.overview.netGmv) : "…"} change={cmp.netGmv} detail={a ? `Gross ${formatMoney(a.overview.grossGmv, { compact: true })} less refunds ${formatMoney(a.overview.completedRefunds, { compact: true })} · vs ${prev}` : "Loading…"} />
          <MetricCard title="Average Order Value (AOV)" value={a ? formatMoney(a.overview.aov) : "…"} change={cmp.aov} detail={a ? `${formatNumber(a.overview.orderCount)} orders in period` : "Loading…"} />
          <MetricCard title="Checkout Conversion" value="Not tracked" change={null} detail="Needs storefront checkout-session tracking, which the backend does not record yet." />
          <MetricCard title="Return Rate" value={a ? `${a.overview.returnRate}%` : "…"} change={cmp.returnRate} unit=" pp" lowerIsBetter detail={a ? `${a.returns.returnedOrders} returned of ${a.returns.deliveredOrders} delivered orders` : "Loading…"} />
        </section>

        <section className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
          <ChartCard className="lg:col-span-2" title="Revenue Performance" subtitle={`${a?.revenuePerformance?.bucket === "month" ? "Monthly" : "Daily"} order revenue by commercial stream · PKR`}>
            <div className="mb-3 flex flex-wrap gap-2">{STREAMS.map(([, label, color]) => <span key={label} className="inline-flex items-center gap-1.5 rounded-md bg-[#EDF2FF] px-2.5 py-1 text-[10px] text-slate-600"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span>)}</div>
            <div className="h-72 w-full">
              {q.isLoading ? <LoadingSkeleton rows={6} /> : series.length === 0 ? <div className="flex h-full items-center justify-center text-xs text-slate-400">No order revenue in this period.</div> : <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                    <defs>{STREAMS.map(([key, , color]) => <linearGradient key={key} id={`analytics-${key}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={key === "retail" ? 0.17 : 0.045} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient>)}</defs>
                    <CartesianGrid vertical={false} stroke={COLORS.grid} strokeDasharray="3 4" />
                    <XAxis dataKey="period" tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 10 }} dy={8} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "#64748B", fontSize: 10 }} tickFormatter={compact} width={42} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatMoney(value), name]} cursor={{ stroke: COLORS.navy, strokeDasharray: "3 3" }} />
                    {STREAMS.map(([key, label, color], i) => <Area key={key} type="monotone" dataKey={key} name={label} stroke={color} strokeWidth={i === 0 ? 2.8 : 2} fill={`url(#analytics-${key}-fill)`} dot={false} activeDot={{ r: i === 0 ? 6 : 5, stroke: "#fff", strokeWidth: i === 0 ? 3 : 2 }} />)}
                  </AreaChart>
                </ResponsiveContainer>}
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 rounded-md bg-[#EDF2FF] px-3 py-2 text-[11px] text-slate-600"><span>Total revenue in period</span><strong className="font-mono text-[#0F2922]">{a ? formatMoney(a.revenueShare.totalRevenue) : "—"}</strong></div>
          </ChartCard>

          <ChartCard title="Commercial Revenue Share" subtitle="Revenue contribution across business channels">
            {q.isLoading ? <LoadingSkeleton rows={5} /> : shareData.length === 0 ? <div className="flex h-52 items-center justify-center text-xs text-slate-400">No revenue in this period.</div> : <div className="relative h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={shareData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={79} paddingAngle={3} stroke="#fff" strokeWidth={1.5} onMouseEnter={(_, i) => setActiveDonut(i)} onMouseLeave={() => setActiveDonut(null)}>
                      {shareData.map((item, i) => <Cell key={item.key} fill={item.color} opacity={activeDonut === null || activeDonut === i ? 1 : 0.38} style={{ cursor: "pointer", outline: "none", transition: "opacity 180ms" }} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [`${value}%`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="font-mono text-2xl font-bold text-[#0F2922]">{activeChannel ? activeChannel.value : 100}%</span><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{activeChannel ? "Channel Share" : "Total Share"}</span></div>
              </div>}
            <div className="space-y-1 border-t border-slate-100 pt-3">
              {share.map((item) => <div key={item.key} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] hover:bg-slate-50">
                  <span className="flex min-w-0 items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="truncate">{item.name}</span></span>
                  <span className="flex gap-3 font-mono"><span className="text-slate-400">{formatNumber(item.orders)} orders</span><strong className="text-[#0F2922]">{item.value}%</strong></span>
                </div>)}
            </div>
          </ChartCard>
        </section>

        <ChartCard title="Top Performing Silhouette Revenue" subtitle="Highest-performing retail & wholesale products ranked by revenue · PKR (manufacturing and printing have no catalog products)">
          <div className="h-72 w-full">
            {q.isLoading ? <LoadingSkeleton rows={5} /> : products.length === 0 ? <div className="flex h-full items-center justify-center text-xs text-slate-400">No product sales in this period.</div> : <ResponsiveContainer width="100%" height="100%">
                <BarChart data={products} margin={{ top: 12, right: 10, left: 0, bottom: 20 }}>
                  <CartesianGrid vertical={false} stroke={COLORS.grid} strokeDasharray="3 4" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} tick={{ fill: "#64748B", fontSize: 10 }} dy={8} tickFormatter={(n) => (n && n.length > 18 ? `${n.slice(0, 16)}...` : n)} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 10 }} tickFormatter={compact} width={42} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#EDF2FF" }} formatter={(value, _n, p) => [formatMoney(value), `Revenue · ${p.payload.quantitySold} units`]} />
                  <Bar dataKey="revenue" name="Revenue" maxBarSize={55} radius={[5, 5, 0, 0]} onMouseOver={(_, i) => setActiveBar(i)} onMouseOut={() => setActiveBar(null)}>
                    {products.map((item, i) => <Cell key={item.productId} fill={activeBar === i ? COLORS.navy : COLORS.primary} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 rounded-md bg-[#EDF2FF] px-3 py-2 text-[11px] text-slate-600 sm:grid-cols-2">
            <span>Top Ranked: <strong className="text-[#0F2922]">{a?.topProducts?.topProduct?.name || "—"}</strong></span>
            <span className="sm:text-right">Total Top-{products.length || 5} Revenue: <strong className="font-mono text-[#0F2922]">{a ? formatMoney(a.topProducts.totalTopRevenue) : "—"}</strong></span>
          </div>
        </ChartCard>
      </>}
    </div>;
};
