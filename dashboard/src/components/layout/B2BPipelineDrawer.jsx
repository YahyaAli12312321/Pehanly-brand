import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Drawer } from "../common/Drawer";
import { SearchInput } from "../common/SearchInput";
import { LoadingSkeleton } from "../common/LoadingSkeleton";
import { useUIStore } from "../../store/uiStore";
import { useAuth } from "../../hooks/useAuth";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { wholesaleApi } from "../../services/wholesaleApi";
import { manufacturingApi } from "../../services/manufacturingApi";
import { printingApi } from "../../services/printingApi";
import { formatMoney, formatNumber, humanize, timeAgo } from "../../lib/format";

const SOURCES = [
  { id: "wholesale", label: "Wholesale", perm: "wholesale.read", url: "/wholesale", list: (p) => wholesaleApi.listRequests(p), title: (r) => (r.requestType === "ready_pack" ? `Ready pack · ${r.sourcePack?.name || ""}` : "Custom bulk order"), qty: (r) => r.requestedVolume, value: (r) => r.pricing?.estimatedTotal },
  { id: "manufacturing", label: "Manufacturing", perm: "manufacturing.read", url: "/manufacturing", list: (p) => manufacturingApi.listRequests(p), title: (r) => [r.selection?.categoryName, r.selection?.styleName].filter(Boolean).join(" · "), qty: (r) => r.quantity },
  { id: "printing", label: "Printing", perm: "printing.read", url: "/printing", list: (p) => printingApi.listRequests(p), title: (r) => r.selection?.serviceName, qty: (r) => r.quantity },
];
const STAGES = [["pending", "Pending"], ["under_review", "Under review"], ["approved", "Approved"]];

/** Open B2B requests from the three request queues (wholesale, manufacturing, printing). Opening an item deep-links to its detail drawer. */
export const B2BPipelineDrawer = () => {
  const { b2bPipelineOpen, setB2bPipelineOpen } = useUIStore();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [stage, setStage] = useState("pending");
  const [search, setSearch] = useState("");
  const dq = useDebouncedValue(search, 350);
  const sources = SOURCES.filter((s) => can(s.perm) && (filter === "all" || filter === s.id));

  const results = useQueries({ queries: sources.map((s) => ({ queryKey: ["pipeline", s.id, stage, dq], queryFn: () => s.list({ status: stage, search: dq.trim() || undefined, limit: 8 }), enabled: b2bPipelineOpen })) });
  const loading = results.some((r) => r.isLoading);
  const failed = results.find((r) => r.isError);
  const rows = results.flatMap((r, i) => (r.data?.items || []).map((x) => ({ x, s: sources[i] }))).sort((a, b) => new Date(b.x.createdAt) - new Date(a.x.createdAt));
  const total = results.reduce((n, r) => n + (r.data?.meta?.total || 0), 0);

  return <Drawer isOpen={b2bPipelineOpen} onClose={() => setB2bPipelineOpen(false)} title="B2B & Custom Pipeline" subtitle="Wholesale, manufacturing and printing requests"
      badge={<span className="px-2 py-0.5 rounded-full bg-[#cce9de] text-[#052019] text-xs font-semibold">{loading ? "…" : `${total} ${humanize(stage)}`}</span>}
      footer={<>
        <button type="button" onClick={() => { setB2bPipelineOpen(false); navigate("/quotes"); }} className="flex-1 py-2.5 rounded-lg bg-[#0f2922] text-white hover:bg-[#1a3d34] text-xs font-semibold transition-colors text-center shadow-xs">Open Quotes</button>
        <button type="button" onClick={() => setB2bPipelineOpen(false)} className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors">Close</button>
      </>}>
      <div className="flex flex-col gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search request #, client..." />
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[["all", "All"], ...SOURCES.filter((s) => can(s.perm)).map((s) => [s.id, s.label])].map(([id, label]) => <button key={id} type="button" onClick={() => setFilter(id)} className={`px-3 py-1 rounded-md font-semibold transition-colors ${filter === id ? "bg-[#0f2922] text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>)}
        </div>
        <div className="flex items-center gap-1.5 text-xs">{STAGES.map(([id, label]) => <button key={id} type="button" onClick={() => setStage(id)} className={`px-3 py-1 rounded-md font-semibold border transition-colors ${stage === id ? "border-[#0f2922] text-[#0f2922] bg-white" : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>)}</div>
      </div>
      {sources.length === 0 ? <p className="text-xs text-slate-500">You don't have access to any request queues.</p> : loading ? <LoadingSkeleton rows={4} /> : failed ? <p className="text-xs text-rose-600">Couldn't load some requests ({failed.error?.message}). <button className="underline" onClick={() => results.forEach((r) => r.refetch())}>Retry</button></p> : rows.length === 0 ? <p className="text-xs text-slate-500 py-8 text-center">No {humanize(stage).toLowerCase()} requests.</p> : <div className="flex flex-col gap-2.5">
          {rows.map(({ x, s }) => <div key={x._id} onClick={() => { setB2bPipelineOpen(false); navigate(`${s.url}/${x._id}`); }} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-colors cursor-pointer group">
              <div className="flex items-center justify-between"><span className="font-mono text-xs font-bold text-slate-900 group-hover:text-[#0f2922]">{x.requestNumber}</span><span className="text-[11px] text-slate-400 font-medium">{timeAgo(x.createdAt)}</span></div>
              <h4 className="text-xs font-semibold text-slate-900 mt-1">{s.title(x)}{s.qty(x) ? ` (${formatNumber(s.qty(x))} pcs)` : ""}</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">{x.customer?.businessName || x.customer?.name}</p>
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-200/60"><span className="inline-flex items-center gap-1.5 text-xs text-emerald-800 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />{s.label} · {humanize(x.status)}</span>{s.value?.(x) != null && <span className="font-mono text-xs font-bold text-slate-900">{formatMoney(s.value(x))}</span>}</div>
            </div>)}
        </div>}
    </Drawer>;
};
