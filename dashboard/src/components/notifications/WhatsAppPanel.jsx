import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { notificationsApi } from "../../services/notificationsApi";
import { useToastStore } from "../../store/toastStore";
import { LoadingSkeleton } from "../common/LoadingSkeleton";
import { EmptyState } from "../common/EmptyState";
import { ErrorState } from "../common/ErrorState";
import { Pagination } from "../common/Pagination";
import { Select } from "../common/Select";
import { StatusBadge } from "../common/StatusBadge";
import { keys } from "../../lib/queryKeys";
import { errorMessage } from "../../lib/apiError";
import { formatDateTime, dateInputToIso } from "../../lib/format";
import { WHATSAPP_STATUS_OPTIONS, WHATSAPP_RECIPIENT_OPTIONS, SIMULATE_OPTIONS, statusLabel, canRetry, eventLabel, buildListParams } from "../../lib/whatsapp";
import { RotateCw, Send, ChevronDown, ChevronRight, FlaskConical } from "lucide-react";

const input = "h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0f2922] w-full";

export const WhatsAppPanel = () => {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const [filters, setFilters] = useState({ status: "all", event: "all", recipientType: "all", search: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [open, setOpen] = useState(null);
  const [test, setTest] = useState({ to: "", simulate: "success" });

  const params = buildListParams({ page, limit: pageSize, ...filters }, dateInputToIso);
  const list = useQuery({ queryKey: keys.whatsapp.list(params), queryFn: () => notificationsApi.whatsapp.list(params), placeholderData: keepPreviousData });
  const cfg = useQuery({ queryKey: keys.whatsapp.config, queryFn: notificationsApi.whatsapp.config, staleTime: 60_000 });
  const items = list.data?.items ?? [];
  const config = cfg.data || list.data?.config;
  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.whatsapp.all });

  const retry = useMutation({
    mutationFn: (id) => notificationsApi.whatsapp.retry(id),
    onSuccess: (m) => { refresh(); addToast(m?.status === "sent" ? (m.simulated ? "Retried: sent (simulated)" : "Retried: sent") : `Retry result: ${m?.status}`, m?.status === "failed" ? "error" : "success"); },
    onError: (err) => addToast(errorMessage(err, "Retry failed"), "error"),
  });
  const sendTest = useMutation({
    mutationFn: () => notificationsApi.whatsapp.test({ to: test.to.trim(), simulate: test.simulate }),
    onSuccess: (m) => { refresh(); addToast(m?.status === "sent" ? "Test processed: sent (simulated, nothing was delivered)" : `Test processed: ${m?.status}`, m?.status === "failed" ? "error" : "success"); },
    onError: (err) => addToast(errorMessage(err, "Test failed"), "error"),
  });

  const isMock = config?.provider === "mock";

  return <div className="space-y-4">
    <div className={`rounded-xl border p-3 text-xs ${isMock ? "bg-amber-50 border-amber-200 text-amber-900" : config?.enabled === false ? "bg-slate-50 border-slate-200 text-slate-700" : "bg-emerald-50 border-emerald-200 text-emerald-900"}`} role="status" data-testid="whatsapp-mode">
      {config?.enabled === false
        ? <>WhatsApp notifications are switched <strong>off</strong> (WHATSAPP_PROVIDER=off). Nothing is recorded or sent.</>
        : isMock
          ? <><strong>Mock provider.</strong> Messages are recorded and marked <em>Sent (simulated)</em>, but <strong>no real WhatsApp message is sent</strong>. Connect Meta later to deliver for real.</>
          : <>Provider: <strong>{config?.provider || "…"}</strong></>}
    </div>

    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-900"><FlaskConical className="w-4 h-4 text-slate-500" />Send a test notification</div>
      <form className="grid grid-cols-1 sm:grid-cols-[1fr_16rem_auto] gap-2" onSubmit={(e) => { e.preventDefault(); if (test.to.trim() && !sendTest.isPending) sendTest.mutate(); }}>
        <input aria-label="Test phone number" className={input} placeholder="Phone, e.g. 0300 1234567" value={test.to} onChange={(e) => setTest((t) => ({ ...t, to: e.target.value }))} />
        <Select aria-label="Simulated outcome" value={test.simulate} onChange={(e) => setTest((t) => ({ ...t, simulate: e.target.value }))} options={SIMULATE_OPTIONS} />
        <button type="submit" disabled={!test.to.trim() || sendTest.isPending || config?.enabled === false} className="inline-flex items-center justify-center gap-1.5 px-4 h-9 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60">
          <Send className="w-3.5 h-3.5" />{sendTest.isPending ? "Sending…" : "Send test"}
        </button>
      </form>
    </div>

    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3 grid grid-cols-2 lg:grid-cols-6 gap-2" aria-label="WhatsApp filters">
      <Select aria-label="Filter by status" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
        <option value="all">All statuses</option>
        {WHATSAPP_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{eventLabel(s)}</option>)}
      </Select>
      <Select aria-label="Filter by event" value={filters.event} onChange={(e) => set({ event: e.target.value })}>
        <option value="all">All events</option>
        {(config?.events || []).map((ev) => <option key={ev} value={ev}>{eventLabel(ev)}</option>)}
      </Select>
      <Select aria-label="Filter by recipient" value={filters.recipientType} onChange={(e) => set({ recipientType: e.target.value })}>
        <option value="all">All recipients</option>
        {WHATSAPP_RECIPIENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      <input aria-label="Search" className={input} placeholder="Order #, name or phone" value={filters.search} onChange={(e) => set({ search: e.target.value })} />
      <input aria-label="From date" type="date" className={input} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
      <input aria-label="To date" type="date" className={input} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
    </div>

    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {list.isLoading ? <div className="p-6"><LoadingSkeleton rows={5} /></div>
        : list.isError ? <ErrorState error={list.error} onRetry={list.refetch} />
        : items.length === 0 ? <div className="p-12"><EmptyState title="No WhatsApp notifications" description="Messages appear here as orders, stock changes and requests happen." /></div>
        : <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" data-testid="whatsapp-table">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
              <tr><th className="p-3 w-8" /><th className="p-3">When</th><th className="p-3">Event</th><th className="p-3">Recipient</th><th className="p-3">Related</th><th className="p-3">Provider</th><th className="p-3">Status</th><th className="p-3">Attempts</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((m) => {
                const st = statusLabel(m);
                const expanded = open === m._id;
                return <>
                  <tr key={m._id} className="hover:bg-slate-50 align-top">
                    <td className="p-3"><button type="button" aria-label={expanded ? "Hide message" : "Show message"} onClick={() => setOpen(expanded ? null : m._id)} className="text-slate-400 hover:text-slate-700">{expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button></td>
                    <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                    <td className="p-3 font-semibold text-slate-800">{eventLabel(m.event)}</td>
                    <td className="p-3"><div className="font-medium text-slate-800">{m.recipientName || "-"}</div><div className="text-slate-500">{eventLabel(m.recipientType)} · <span className="font-mono">{m.phone || "no phone"}</span></div></td>
                    <td className="p-3 font-mono text-slate-600">{m.reference || "-"}</td>
                    <td className="p-3">{m.provider}{m.simulated && <span className="ml-1 text-[10px] font-semibold text-amber-700">(simulated)</span>}</td>
                    <td className="p-3"><StatusBadge status={m.status} variant={m.status === "sent" && m.simulated ? "pending" : m.status} size="sm" /><div className="mt-1 text-[10px] text-slate-500">{st.label}</div></td>
                    <td className="p-3 text-slate-600">{m.attempts}/{m.maxAttempts}</td>
                    <td className="p-3 text-right">{canRetry(m) && <button type="button" onClick={() => retry.mutate(m._id)} disabled={retry.isPending} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"><RotateCw className="w-3 h-3" />Retry</button>}</td>
                  </tr>
                  {expanded && <tr key={`${m._id}-d`} className="bg-slate-50/60"><td /><td colSpan={8} className="p-3 space-y-2">
                    <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-3">{m.body}</pre>
                    {m.error?.code && <div className="text-xs text-rose-700" role="alert"><strong>{m.error.code}</strong>: {m.error.message}{m.error.retryable ? " (temporary: will be retried automatically)" : ""}</div>}
                    {m.providerMessageId && <div className="text-[11px] text-slate-500">Provider message id: <span className="font-mono">{m.providerMessageId}</span></div>}
                  </td></tr>}
                </>;
              })}
            </tbody>
          </table>
        </div>}
      <Pagination currentPage={page} totalItems={list.data?.meta?.total ?? 0} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
    </div>
  </div>;
};
