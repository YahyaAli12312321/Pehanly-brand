import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Eye, Loader2 } from "lucide-react";
import { returnsApi, RETURN_STATUSES, REFUND_STATUSES, ITEM_CONDITIONS } from "../services/returnsApi";
import { paymentsApi } from "../services/paymentsApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { errorMessage } from "../lib/apiError";
import { formatDateTime, formatMoney, humanize } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { Pagination } from "../components/common/Pagination";
import { Drawer } from "../components/common/Drawer";
import { Modal } from "../components/common/Modal";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { ConfirmDialog } from "../components/common/ConfirmDialog";

const sel = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";
const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50";
const primary = `${btn} bg-emerald-800 text-white hover:bg-emerald-700`;
const danger = `${btn} bg-rose-50 text-rose-700 hover:bg-rose-100`;
const ghost = `${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`;

export const ReturnsPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const { can } = useAuth();
  const canManage = can("orders.manage");

  const [status, setStatus] = useState(RETURN_STATUSES.includes(searchParams.get("status")) ? searchParams.get("status") : "all");
  const [refundStatus, setRefundStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeId, setActiveId] = useState(routeId || null);
  const [dialog, setDialog] = useState(null); // {type:'approve'|'reject'|'receive'|'inspect'|'refund'|'cod', note}
  const [note, setNote] = useState("");
  const [inspection, setInspection] = useState({});
  const [refund, setRefund] = useState({ paymentId: "", amount: "" });
  const [formError, setFormError] = useState("");

  useEffect(() => { if (routeId) setActiveId(routeId); }, [routeId]);

  const params = { status: status === "all" ? undefined : status, refundStatus: refundStatus === "all" ? undefined : refundStatus, page, limit: pageSize };
  const listQuery = useQuery({ queryKey: keys.returns.list(params), queryFn: () => returnsApi.list(params), placeholderData: keepPreviousData });
  const detailQuery = useQuery({ queryKey: keys.returns.detail(activeId), queryFn: () => returnsApi.get(activeId), enabled: !!activeId });
  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const req = detailQuery.data;

  const payOptionsQuery = useQuery({
    queryKey: ["returns", "refundable-payments", req?.order?._id],
    queryFn: () => paymentsApi.list({ search: req.order.orderNumber, status: "paid", limit: 20 }),
    enabled: dialog?.type === "refund" && !!req?.order?.orderNumber && can("payments.read"),
  });
  const payOptions = (payOptionsQuery.data?.items || []).filter((p) => (p.orderData?._id || p.order) === req?.order?._id || p.orderData?.orderNumber === req?.order?.orderNumber);

  const done = (message) => {
    queryClient.invalidateQueries({ queryKey: keys.returns.all });
    queryClient.invalidateQueries({ queryKey: keys.orders.all });
    queryClient.invalidateQueries({ queryKey: keys.payments.all });
    queryClient.invalidateQueries({ queryKey: keys.inventory.all });
    addToast(message);
    closeDialog();
  };
  const fail = (err, fallback) => { const m = errorMessage(err, fallback); setFormError(m); addToast(m, "error"); };

  const act = useMutation({
    mutationFn: ({ type, payload }) => {
      switch (type) {
        case "approve": return returnsApi.review(activeId, { action: "approve", ...(payload.note ? { note: payload.note } : {}) });
        case "reject": return returnsApi.review(activeId, { action: "reject", ...(payload.note ? { note: payload.note } : {}) });
        case "receive": return returnsApi.receive(activeId, payload.note ? { note: payload.note } : {});
        case "inspect": return returnsApi.inspect(activeId, payload);
        case "refund": return returnsApi.prepareRefund(activeId, payload);
        case "cod": return returnsApi.completeCodRefund(activeId);
        default: throw new Error("Unknown action");
      }
    },
    onSuccess: (_d, { type }) => done({ approve: "Return approved.", reject: "Return rejected.", receive: "Return marked as received.", inspect: "Inspection saved.", refund: "Refund recorded as pending.", cod: "COD refund marked complete." }[type]),
    onError: (err) => fail(err, "Action failed"),
  });

  const openDialog = (type) => {
    setFormError(""); setNote("");
    if (type === "inspect") setInspection(Object.fromEntries(req.items.map((i) => [i._id, { condition: "restockable", restockQuantity: i.quantity }])));
    if (type === "refund") setRefund({ paymentId: "", amount: "" });
    setDialog({ type });
  };
  const closeDialog = () => { if (!act.isPending) { setDialog(null); setFormError(""); } };
  const open = (id) => { setActiveId(id); if (routeId !== id) navigate(`/returns/${id}`); };
  const close = () => { setActiveId(null); setDialog(null); if (routeId) navigate("/returns"); };
  const reset = (setter) => (v) => { setter(v); setPage(1); };

  const submitInspect = () => {
    const rows = req.items.map((i) => ({ returnItem: i._id, condition: inspection[i._id].condition, restockQuantity: inspection[i._id].condition === "restockable" ? Number(inspection[i._id].restockQuantity) || 0 : 0 }));
    const bad = req.items.find((i, idx) => rows[idx].restockQuantity < 0 || rows[idx].restockQuantity > i.quantity);
    if (bad) return setFormError(`Restock quantity for ${bad.productName} must be between 0 and ${bad.quantity}.`);
    setFormError("");
    act.mutate({ type: "inspect", payload: { items: rows, ...(note.trim() ? { note: note.trim() } : {}) } });
  };
  const submitRefund = () => {
    const amount = Number(refund.amount);
    if (!refund.paymentId) return setFormError("Select the paid payment to refund against.");
    if (!(amount > 0)) return setFormError("Enter a refund amount greater than zero.");
    setFormError("");
    act.mutate({ type: "refund", payload: { paymentId: refund.paymentId, amount } });
  };

  const pay = req?.refund?.payment;
  const suggested = req ? req.items.reduce((s, i) => s + (i.lineAmount || 0), 0) : 0;
  const filtersActive = status !== "all" || refundStatus !== "all";

  return <div className="space-y-6">
      <PageHeader breadcrumb={[{ label: "Support" }, { label: "Returns & Refunds" }]} title="Returns & Refunds" description="Review customer return requests, record inspection results and settle refunds. Restockable items return to inventory automatically." />

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={sel}>
          <option value="all">All Return Statuses</option>
          {RETURN_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
        <select value={refundStatus} onChange={(e) => reset(setRefundStatus)(e.target.value)} className={sel}>
          <option value="all">All Refund Statuses</option>
          {REFUND_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={6} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title={filtersActive ? "No Returns Match" : "No Return Requests"} description={filtersActive ? "No return requests match the filters." : "Customer return requests will appear here."} /></div> : <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Order</th><th className="py-3 px-4">Customer</th><th className="py-3 px-4">Items</th><th className="py-3 px-4">Reason</th><th className="py-3 px-4">Requested</th><th className="py-3 px-4">Return</th><th className="py-3 px-4">Refund</th><th className="py-3 px-4 text-right">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {items.map((r) => <tr key={r._id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => open(r._id)}>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{r.order?.orderNumber || "—"}</td>
                    <td className="py-3.5 px-4"><div className="font-semibold text-slate-900">{r.user?.name || r.order?.customer?.name || "Guest"}</div><div className="text-[10px] text-slate-400">{r.user?.email || r.order?.customer?.email || ""}</div></td>
                    <td className="py-3.5 px-4 text-slate-700">{r.items.reduce((s, i) => s + i.quantity, 0)} unit(s)</td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-[220px] truncate" title={r.reason}>{r.reason}</td>
                    <td className="py-3.5 px-4 text-slate-500">{formatDateTime(r.createdAt)}</td>
                    <td className="py-3.5 px-4"><StatusBadge status={r.returnStatus} /></td>
                    <td className="py-3.5 px-4"><StatusBadge status={r.refund?.status || "not_required"} />{r.refund?.amount > 0 && <div className="font-mono text-[10px] text-slate-500 mt-0.5">{formatMoney(r.refund.amount)}</div>}</td>
                    <td className="py-3.5 px-4 text-right"><button onClick={(e) => { e.stopPropagation(); open(r._id); }} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title="View"><Eye className="w-4 h-4" /></button></td>
                  </tr>)}
              </tbody>
            </table>
          </div>}
        {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="request" labelPlural="requests" />}
        {listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
      </div>

      <Drawer isOpen={Boolean(activeId)} onClose={close} title={req ? `Return · ${req.order?.orderNumber || ""}` : "Return request"} subtitle={req ? `Requested ${formatDateTime(req.createdAt)} by ${req.requestedBy}` : ""} badge={req && <StatusBadge status={req.returnStatus} />}>
        {detailQuery.isLoading ? <LoadingSkeleton rows={5} /> : detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} /> : req && <div className="space-y-5 text-xs">
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">Customer</span><span className="font-medium">{req.user?.name || req.order?.customer?.name || "Guest"}</span></div>
              {(req.user?.email || req.order?.customer?.email) && <div className="flex justify-between"><span className="text-slate-500">Email</span><span>{req.user?.email || req.order?.customer?.email}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">Order payment</span><StatusBadge status={req.order?.paymentStatus || "pending"} /></div>
              {req.reviewedBy && <div className="flex justify-between"><span className="text-slate-500">Reviewed by</span><span>{req.reviewedBy.name} · {formatDateTime(req.reviewedAt)}</span></div>}
              {req.receivedAt && <div className="flex justify-between"><span className="text-slate-500">Received</span><span>{formatDateTime(req.receivedAt)}</span></div>}
              {req.inspectedAt && <div className="flex justify-between"><span className="text-slate-500">Inspected</span><span>{formatDateTime(req.inspectedAt)}</span></div>}
              {req.completedAt && <div className="flex justify-between"><span className="text-slate-500">Completed</span><span>{formatDateTime(req.completedAt)}</span></div>}
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Reason</span>
              <p className="text-slate-800 whitespace-pre-wrap">{req.reason}</p>
              {req.customerNote && <p className="text-slate-500 whitespace-pre-wrap">Customer note: {req.customerNote}</p>}
              {req.adminNote && <p className="text-slate-500 whitespace-pre-wrap">Staff note: {req.adminNote}</p>}
              {req.images?.length > 0 && <div className="flex flex-wrap gap-2 pt-1">{req.images.map((im) => <a key={im.url} href={im.url} target="_blank" rel="noopener noreferrer"><img src={im.url} alt={im.alt || "Return evidence"} className="w-16 h-16 rounded-lg object-cover border border-slate-200" /></a>)}</div>}
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 text-[10px] uppercase tracking-wider font-bold text-slate-500">Items</div>
              <ul className="divide-y divide-slate-100">
                {req.items.map((i) => <li key={i._id} className="px-4 py-3 flex justify-between gap-3">
                    <div><div className="font-semibold text-slate-900">{i.productName}</div><div className="text-slate-500">{[i.colorName, i.size, i.skuCode].filter(Boolean).join(" · ")}</div><div className="text-slate-500 mt-0.5">Condition: {humanize(i.condition)}{i.restockedQuantity > 0 && ` · restocked ${i.restockedQuantity}`}</div></div>
                    <div className="text-right font-mono"><div>{i.quantity} × {formatMoney(i.unitPrice)}</div><div className="font-bold">{formatMoney(i.lineAmount)}</div></div>
                  </li>)}
              </ul>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1.5">
              <div className="flex justify-between items-center"><span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Refund</span><StatusBadge status={req.refund?.status || "not_required"} /></div>
              {req.refund?.required ? <>
                <div className="flex justify-between"><span className="text-slate-500">Amount ({req.refund.type})</span><span className="font-mono font-bold">{formatMoney(req.refund.amount)}</span></div>
                {pay?.paymentNumber && <div className="flex justify-between"><span className="text-slate-500">Payment</span><span className="font-mono">{pay.paymentNumber} · {pay.gateway === "jazzcash" ? "JazzCash" : "COD"}</span></div>}
                {req.refund.processedBy && <div className="flex justify-between"><span className="text-slate-500">Processed by</span><span>{req.refund.processedBy.name}</span></div>}
                {req.refund.processedAt && <div className="flex justify-between"><span className="text-slate-500">Processed</span><span>{formatDateTime(req.refund.processedAt)}</span></div>}
                {req.refund.failureMessage && <div className="p-2 rounded bg-rose-50 text-rose-700">{req.refund.failureMessage}</div>}
                {pay?.gateway === "jazzcash" && req.refund.status === "pending" && <p className="text-amber-700 bg-amber-50 border border-amber-100 rounded p-2">JazzCash refunds are not issued automatically by the system. This refund is recorded as pending and must be settled in the JazzCash merchant portal.</p>}
              </> : <p className="text-slate-500">No refund has been recorded yet.</p>}
            </div>
            {canManage ? <div className="flex flex-wrap gap-2">
                {req.returnStatus === "pending" && <><button className={primary} onClick={() => openDialog("approve")}>Approve</button><button className={danger} onClick={() => openDialog("reject")}>Reject</button></>}
                {req.returnStatus === "approved" && <button className={primary} onClick={() => openDialog("receive")}>Mark received</button>}
                {req.returnStatus === "received" && <button className={primary} onClick={() => openDialog("inspect")}>Record inspection</button>}
                {["inspected", "completed"].includes(req.returnStatus) && req.refund?.status !== "completed" && <button className={primary} onClick={() => openDialog("refund")}>{req.refund?.required ? "Update refund" : "Prepare refund"}</button>}
                {req.refund?.status === "pending" && pay?.gateway === "cod" && <button className={ghost} onClick={() => openDialog("cod")}>Mark COD refund paid</button>}
              </div> : <p className="text-slate-400">You have read-only access to returns.</p>}
          </div>}
      </Drawer>

      <ConfirmDialog isOpen={dialog?.type === "cod"} onClose={closeDialog} onConfirm={() => act.mutate({ type: "cod" })} isLoading={act.isPending} title="Complete COD refund" message={`Confirm that ${req ? formatMoney(req.refund?.amount) : ""} was handed back to the customer in cash?`} confirmLabel="Mark refunded" isDestructive={false} type="info" />

      <Modal isOpen={["approve", "reject", "receive"].includes(dialog?.type)} onClose={closeDialog} title={{ approve: "Approve return", reject: "Reject return", receive: "Mark return received" }[dialog?.type] || ""} maxWidth="md">
        <div className="space-y-3 text-xs">
          <label className="block"><span className="font-semibold text-slate-700">Note (optional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} className="mt-1 w-full border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-[#00130d] outline-none" /></label>
          {formError && <p className="text-rose-600">{formError}</p>}
          <div className="flex justify-end gap-2"><button className={ghost} onClick={closeDialog} disabled={act.isPending}>Cancel</button>
            <button className={dialog?.type === "reject" ? `${btn} bg-rose-700 text-white hover:bg-rose-600` : primary} disabled={act.isPending} onClick={() => act.mutate({ type: dialog.type, payload: { note: note.trim() } })}>{act.isPending ? "Saving…" : "Confirm"}</button></div>
        </div>
      </Modal>

      <Modal isOpen={dialog?.type === "inspect"} onClose={closeDialog} title="Record inspection" maxWidth="lg">
        {req && dialog?.type === "inspect" && <div className="space-y-3 text-xs">
            {req.items.map((i) => <div key={i._id} className="p-3 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
                <div><div className="font-semibold">{i.productName}</div><div className="text-slate-500">{[i.colorName, i.size].filter(Boolean).join(" · ")} · returned {i.quantity}</div></div>
                <div className="flex items-center gap-2">
                  <select value={inspection[i._id]?.condition} onChange={(e) => setInspection((s) => ({ ...s, [i._id]: { ...s[i._id], condition: e.target.value } }))} className={sel}>{ITEM_CONDITIONS.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</select>
                  {inspection[i._id]?.condition === "restockable" && <label className="flex items-center gap-1 text-slate-500">Restock<input type="number" min={0} max={i.quantity} value={inspection[i._id].restockQuantity} onChange={(e) => setInspection((s) => ({ ...s, [i._id]: { ...s[i._id], restockQuantity: e.target.value } }))} className={`${sel} w-16`} /></label>}
                </div>
              </div>)}
            <label className="block"><span className="font-semibold text-slate-700">Note (optional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} className="mt-1 w-full border border-slate-200 rounded-lg p-2 outline-none" /></label>
            {formError && <p className="text-rose-600">{formError}</p>}
            <div className="flex justify-end gap-2"><button className={ghost} onClick={closeDialog} disabled={act.isPending}>Cancel</button><button className={primary} onClick={submitInspect} disabled={act.isPending}>{act.isPending ? "Saving…" : "Save inspection"}</button></div>
          </div>}
      </Modal>

      <Modal isOpen={dialog?.type === "refund"} onClose={closeDialog} title="Prepare refund" maxWidth="md">
        {req && dialog?.type === "refund" && <div className="space-y-3 text-xs">
            {!can("payments.read") ? <p className="text-amber-700">Selecting a payment requires the Payments permission.</p> : payOptionsQuery.isLoading ? <LoadingSkeleton rows={2} /> : payOptionsQuery.isError ? <ErrorState error={payOptionsQuery.error} onRetry={() => payOptionsQuery.refetch()} /> : payOptions.length === 0 ? <p className="text-amber-700">This order has no paid payment, so there is nothing to refund yet. For COD orders, confirm cash receipt in Payments first.</p> : <label className="block"><span className="font-semibold text-slate-700">Refund against payment</span>
                <select value={refund.paymentId} onChange={(e) => { const p = payOptions.find((x) => x._id === e.target.value); setRefund({ paymentId: e.target.value, amount: refund.amount || String(Math.min(suggested, p?.amount || suggested)) }); }} className={`${sel} w-full mt-1`}>
                  <option value="">Select payment…</option>
                  {payOptions.map((p) => <option key={p._id} value={p._id}>{p.paymentNumber} · {p.gateway === "jazzcash" ? "JazzCash" : "COD"} · {formatMoney(p.amount)}</option>)}
                </select></label>}
            <label className="block"><span className="font-semibold text-slate-700">Refund amount (PKR)</span>
              <input type="number" min={0} step="0.01" value={refund.amount} onChange={(e) => setRefund((s) => ({ ...s, amount: e.target.value }))} className={`${sel} w-full mt-1`} />
              <span className="text-slate-400">Value of returned items: {formatMoney(suggested)}. The backend rejects amounts above the payment's refundable balance.</span></label>
            {formError && <p className="text-rose-600">{formError}</p>}
            <div className="flex justify-end gap-2"><button className={ghost} onClick={closeDialog} disabled={act.isPending}>Cancel</button><button className={primary} onClick={submitRefund} disabled={act.isPending || payOptions.length === 0}>{act.isPending ? "Saving…" : "Record refund"}</button></div>
          </div>}
      </Modal>
    </div>;
};
