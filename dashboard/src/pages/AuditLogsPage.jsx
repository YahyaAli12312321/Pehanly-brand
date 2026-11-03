import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { auditApi } from "../services/auditApi";
import { keys } from "../lib/queryKeys";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { formatDateTime, dateInputToIso } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { Pagination } from "../components/common/Pagination";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";

const inp = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:ring-1 focus:ring-[#00130d] outline-none w-full";

export const AuditLogsPage = () => {
  const [f, setF] = useState({ action: "", entityType: "", entityId: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [open, setOpen] = useState(null);
  const dAction = useDebouncedValue(f.action, 400);
  const dType = useDebouncedValue(f.entityType, 400);
  const dId = useDebouncedValue(f.entityId, 400);
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setPage(1); };

  const params = {
    action: dAction.trim() || undefined, entityType: dType.trim() || undefined, entityId: dId.trim() || undefined,
    from: f.from ? dateInputToIso(f.from) : undefined,
    to: f.to ? new Date(`${f.to}T23:59:59.999`).toISOString() : undefined,
    page, limit: pageSize,
  };
  const q = useQuery({ queryKey: keys.audit.list(params), queryFn: () => auditApi.list(params), placeholderData: keepPreviousData });
  const items = q.data?.items || [];
  const meta = q.data?.meta;
  const filtered = Object.values(f).some(Boolean);

  return <div className="space-y-6">
      <PageHeader breadcrumb={[{ label: "Settings" }, { label: "Audit Logs" }]} title="Audit Logs" description="A read-only record of admin and staff actions. Entries cannot be edited or deleted. Only the owner sees this page." />
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <input className={inp} placeholder="Action (e.g. order.status)" value={f.action} onChange={set("action")} aria-label="Action" />
        <input className={inp} placeholder="Entity type" value={f.entityType} onChange={set("entityType")} aria-label="Entity type" />
        <input className={inp} placeholder="Entity ID" value={f.entityId} onChange={set("entityId")} aria-label="Entity ID" />
        <input type="date" className={inp} value={f.from} max={f.to || undefined} onChange={set("from")} aria-label="From date" />
        <input type="date" className={inp} value={f.to} min={f.from || undefined} onChange={set("to")} aria-label="To date" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} className="border-0" /> : q.isLoading ? <div className="p-6"><LoadingSkeleton rows={6} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title="No audit entries" description={filtered ? "No entries match these filters." : "Admin actions will appear here."} /></div> : <div className="overflow-x-auto"><table className="w-full text-left">
            <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-3 px-4 w-8" /><th className="py-3 px-4">When</th><th className="py-3 px-4">Who</th><th className="py-3 px-4">Action</th><th className="py-3 px-4">Entity</th><th className="py-3 px-4">IP</th></tr></thead>
            <tbody className="divide-y divide-slate-100 text-xs">{items.map((r) => {
              const isOpen = open === r.id;
              const hasMeta = r.metadata && Object.keys(r.metadata).length > 0;
              return [<tr key={r.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">{hasMeta && <button onClick={() => setOpen(isOpen ? null : r.id)} className="text-slate-400 hover:text-slate-800" aria-label={isOpen ? "Hide details" : "Show details"}>{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button>}</td>
                  <td className="py-3 px-4 whitespace-nowrap text-slate-600">{formatDateTime(r.createdAt)}</td>
                  <td className="py-3 px-4"><div className="font-semibold text-slate-900">{r.actor?.name || "Unknown"}</div><div className="text-slate-500">{r.actor?.email}</div></td>
                  <td className="py-3 px-4 font-mono text-[11px]">{r.action}</td>
                  <td className="py-3 px-4"><div className="text-slate-700">{r.entityType}</div><div className="font-mono text-[11px] text-slate-400 break-all">{r.entityId}</div></td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{r.ip || "—"}</td>
                </tr>,
                isOpen && <tr key={`${r.id}-m`} className="bg-slate-50/60"><td /><td colSpan={5} className="py-3 px-4"><pre className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap break-words">{JSON.stringify(r.metadata, null, 2)}</pre></td></tr>];
            })}</tbody></table></div>}
        {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="entry" labelPlural="entries" />}
        {q.isFetching && !q.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
      </div>
    </div>;
};
