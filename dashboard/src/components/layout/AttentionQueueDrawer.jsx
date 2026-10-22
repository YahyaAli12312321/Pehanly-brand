import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Clock, Info, RefreshCw } from "lucide-react";
import { Drawer } from "../common/Drawer";
import { LoadingSkeleton } from "../common/LoadingSkeleton";
import { ErrorState } from "../common/ErrorState";
import { useUIStore } from "../../store/uiStore";
import { useAuth } from "../../hooks/useAuth";
import { dashboardApi } from "../../services/dashboardApi";
import { attentionItems } from "../../lib/attention";
import { keys } from "../../lib/queryKeys";

const GROUPS = { all: "All", urgent: "Urgent", pipeline: "Requests & quotes" };
const ICON = { danger: <AlertCircle className="w-4 h-4 text-rose-600" />, warn: <Clock className="w-4 h-4 text-amber-600" />, info: <Info className="w-4 h-4 text-blue-600" />, muted: <Info className="w-4 h-4 text-slate-400" /> };
const BADGE = { danger: "Urgent", warn: "Soon", info: "Pending", muted: "Waiting" };

/** Everything here comes from GET /admin/dashboard/summary → attention counters. Rows deep-link to the screen that resolves them. */
export const AttentionQueueDrawer = () => {
  const { attentionQueueOpen, setAttentionQueueOpen } = useUIStore();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const q = useQuery({ queryKey: keys.dashboard.summary, queryFn: dashboardApi.summary, enabled: attentionQueueOpen && can("analytics.read") });
  const rows = attentionItems(q.data?.attention).filter((i) => can(i.permission) && i.count > 0);
  const filtered = rows.filter((i) => filter === "all" || (filter === "urgent" ? ["danger", "warn"].includes(i.tone) : ["info", "muted"].includes(i.tone)));
  const total = rows.filter((i) => i.tone !== "muted").reduce((s, i) => s + i.count, 0);

  return <Drawer isOpen={attentionQueueOpen} onClose={() => setAttentionQueueOpen(false)} title="Needs Attention" subtitle="Live work queue from orders, returns, stock, quotes and requests"
      badge={<span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 text-xs font-semibold">{q.data ? `${total} pending` : "…"}</span>}
      footer={<>
        <button type="button" onClick={() => q.refetch()} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[#0f2922] text-white hover:bg-[#1a3d34] text-xs font-semibold shadow-xs"><RefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />Refresh</button>
        <button type="button" onClick={() => setAttentionQueueOpen(false)} className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors">Close</button>
      </>}>
      {!can("analytics.read") ? <p className="text-xs text-slate-500">The attention queue needs the Analytics permission.</p> : <>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {Object.entries(GROUPS).map(([id, label]) => <button key={id} type="button" onClick={() => setFilter(id)} className={`px-3 py-1 rounded-md font-semibold transition-colors ${filter === id ? "bg-[#0f2922] text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>)}
        </div>
        {q.isLoading ? <LoadingSkeleton rows={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : filtered.length === 0 ? <p className="text-xs text-slate-500 py-8 text-center">Nothing needs attention here.</p> : <div className="flex flex-col gap-2.5">
            {filtered.map((i) => <div key={i.key} onClick={() => { setAttentionQueueOpen(false); navigate(i.to); }} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-colors cursor-pointer group">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">{ICON[i.tone]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-bold text-slate-900 group-hover:text-[#0f2922]">{i.label}</h4><span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-semibold text-slate-600 shrink-0">{BADGE[i.tone]}</span></div>
                    <div className="mt-1 text-sm font-mono font-bold text-slate-900">{i.count}</div>
                  </div>
                </div>
              </div>)}
          </div>}
      </>}
    </Drawer>;
};
