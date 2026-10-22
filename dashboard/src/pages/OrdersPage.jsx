import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Truck, Eye, User, Phone, Printer, Loader2, Save } from "lucide-react";
import { ordersApi } from "../services/ordersApi";
import { keys } from "../lib/queryKeys";
import { ORDER_STATUSES, ORDER_STATUS_TRANSITIONS, ORDER_TYPES, PAYMENT_STATUSES, typeBadgeClass, itemTitle, itemSubtitle } from "../lib/orderLifecycle";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { splitFormError } from "../lib/formErrors";
import { dateInputToIso, formatDate, formatDateTime, formatMoney, formatNumber, humanize } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { SearchInput } from "../components/common/SearchInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { Pagination } from "../components/common/Pagination";
import { Modal } from "../components/common/Modal";
import { Drawer } from "../components/common/Drawer";
import { OrderTimeline } from "../components/common/OrderTimeline";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { FormField } from "../components/common/FormField";

const sel = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";
const fld = "w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-[#00130d]";

function CancellationsPanel({ canManage }) {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [review, setReview] = useState(null); // { request, action }
  const [note, setNote] = useState("");
  const params = { status: status === "all" ? undefined : status, page, limit: pageSize };
  const q = useQuery({ queryKey: keys.cancellations.list(params), queryFn: () => ordersApi.cancellations.list(params), placeholderData: keepPreviousData });
  const mutation = useMutation({
    mutationFn: ({ id, action, note: n }) => ordersApi.cancellations.review(id, action, n),
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: keys.cancellations.all });
      queryClient.invalidateQueries({ queryKey: keys.orders.all });
      queryClient.invalidateQueries({ queryKey: keys.inventory.all });
      queryClient.invalidateQueries({ queryKey: keys.dashboard.summary });
      addToast(`Cancellation ${vars.action === "approve" ? "approved — order cancelled" : "rejected"}.`);
      setReview(null);
      setNote("");
    },
    onError: (err) => addToast(errorMessage(err), "error"),
  });
  const items = q.data?.items || [];
  const meta = q.data?.meta;
  return <>
      <div className="p-4 border-b border-slate-100 flex items-center gap-2">
        <span className="text-xs text-slate-500 font-medium">Show:</span>
        {["pending", "approved", "rejected", "all"].map((s) => <button key={s} onClick={() => { setStatus(s); setPage(1); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${status === s ? "bg-[#00130d] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{humanize(s)}</button>)}
      </div>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} className="border-0" /> : q.isLoading ? <div className="p-6"><LoadingSkeleton rows={4} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title="No cancellation requests" description={status === "pending" ? "Nothing is waiting for review." : "No requests match this filter."} /></div> : <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Order</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Requested</th>
                <th className="py-3 px-4">Order Status</th>
                <th className="py-3 px-4">Request</th>
                <th className="py-3 px-4 text-right">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {items.map((r) => <tr key={r._id} className="hover:bg-slate-50/70">
                  <td className="py-3.5 px-4">
                    <Link to={`/orders/${r.order?._id}`} className="font-mono font-bold text-slate-900 hover:text-emerald-700">{r.order?.orderNumber || "—"}</Link>
                    <div className="text-[11px] text-slate-400">{formatMoney(r.order?.pricing?.total, { currency: r.order?.currency || "PKR" })}</div>
                  </td>
                  <td className="py-3.5 px-4"><div className="font-semibold text-slate-800">{r.user?.name || r.order?.customer?.name || "Guest"}</div><div className="text-[11px] text-slate-400">{r.requestedBy === "admin" ? "Requested by staff" : "Requested by customer"}</div></td>
                  <td className="py-3.5 px-4 max-w-xs"><div className="text-slate-700 line-clamp-2">{r.reason}</div>{r.adminNote && <div className="text-[11px] text-slate-400 mt-0.5">Note: {r.adminNote}</div>}</td>
                  <td className="py-3.5 px-4 text-slate-500">{formatDateTime(r.createdAt)}</td>
                  <td className="py-3.5 px-4">{r.order?.orderStatus && <StatusBadge status={r.order.orderStatus} size="sm" />}</td>
                  <td className="py-3.5 px-4"><StatusBadge status={r.status} size="sm" /></td>
                  <td className="py-3.5 px-4 text-right">
                    {r.status === "pending" && canManage ? <div className="inline-flex gap-1.5">
                        <button onClick={() => { setReview({ request: r, action: "approve" }); setNote(""); }} className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold">Approve &amp; cancel</button>
                        <button onClick={() => { setReview({ request: r, action: "reject" }); setNote(""); }} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold">Reject</button>
                      </div> : <span className="text-[11px] text-slate-400">{r.reviewedAt ? formatDate(r.reviewedAt) : "—"}</span>}
                  </td>
                </tr>)}
            </tbody>
          </table>
        </div>}
      {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="request" labelPlural="requests" />}
      <ConfirmDialog
    isOpen={Boolean(review)}
    onClose={() => !mutation.isPending && setReview(null)}
    onConfirm={() => mutation.mutate({ id: review.request._id, action: review.action, note })}
    isLoading={mutation.isPending}
    title={review?.action === "approve" ? "Approve cancellation" : "Reject cancellation"}
    message={<span className="block space-y-2">
          <span className="block">{review?.action === "approve" ? `Order ${review?.request.order?.orderNumber} will be cancelled and its reserved stock released.` : `Order ${review?.request.order?.orderNumber} will continue as normal.`}</span>
          <input type="text" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the customer / audit log" className={fld} />
        </span>}
    confirmLabel={review?.action === "approve" ? "Approve & cancel order" : "Reject request"}
    isDestructive={review?.action === "approve"}
  />
    </>;
}

export const OrdersPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const { can } = useAuth();
  const canManage = can("orders.manage");

  const [tab, setTab] = useState("orders");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [payment, setPayment] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeId, setActiveId] = useState(routeId || null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 350);

  useEffect(() => {
    if (routeId) setActiveId(routeId);
  }, [routeId]);

  const params = {
    search: debouncedSearch.trim() || undefined,
    status: status === "all" ? undefined : status,
    type: type === "all" ? undefined : type,
    paymentStatus: payment === "all" ? undefined : payment,
    from: dateInputToIso(from),
    to: dateInputToIso(to, true),
    page,
    limit: pageSize,
  };
  const listQuery = useQuery({ queryKey: keys.orders.list(params), queryFn: () => ordersApi.list(params), placeholderData: keepPreviousData, enabled: tab === "orders" });
  const summaryQuery = useQuery({ queryKey: keys.orders.summary, queryFn: ordersApi.summary });
  const pendingCancellations = useQuery({
    queryKey: keys.cancellations.list({ status: "pending", page: 1, limit: 1 }),
    queryFn: () => ordersApi.cancellations.list({ status: "pending", page: 1, limit: 1 }),
  });
  const detailQuery = useQuery({ queryKey: keys.orders.detail(activeId), queryFn: () => ordersApi.get(activeId), enabled: !!activeId });

  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const summary = summaryQuery.data;
  const order = detailQuery.data;
  const pendingCount = pendingCancellations.data?.meta?.total ?? 0;

  const reset = (setter) => (v) => { setter(v); setPage(1); };
  const filtersActive = debouncedSearch || status !== "all" || type !== "all" || payment !== "all" || from || to;

  const openOrder = (id) => { setActiveId(id); if (routeId !== id) navigate(`/orders/${id}`); };
  const closeOrder = () => { setActiveId(null); setInvoiceOpen(false); if (routeId) navigate("/orders"); };

  // ---- drawer form state -------------------------------------------------
  const [nextStatus, setNextStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [ship, setShip] = useState({ courierName: "", trackingNumber: "", trackingUrl: "" });
  const [shipErr, setShipErr] = useState({ fields: {}, general: "" });
  const [adminNotes, setAdminNotes] = useState("");
  const allowed = order ? ORDER_STATUS_TRANSITIONS[order.orderStatus] || [] : [];

  useEffect(() => {
    if (!order) return;
    setNextStatus((ORDER_STATUS_TRANSITIONS[order.orderStatus] || [])[0] || "");
    setStatusNote("");
    setShip({ courierName: order.shipment?.courierName || "", trackingNumber: order.shipment?.trackingNumber || "", trackingUrl: order.shipment?.trackingUrl || "" });
    setShipErr({ fields: {}, general: "" });
    setAdminNotes(order.adminNotes || "");
  }, [order?._id, order?.orderStatus, order?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const afterChange = (updated) => {
    queryClient.setQueryData(keys.orders.detail(updated._id), updated);
    queryClient.invalidateQueries({ queryKey: keys.orders.lists() });
    queryClient.invalidateQueries({ queryKey: keys.orders.summary });
    queryClient.invalidateQueries({ queryKey: keys.inventory.all });
    queryClient.invalidateQueries({ queryKey: keys.payments.all });
    queryClient.invalidateQueries({ queryKey: keys.dashboard.summary });
  };
  const statusMutation = useMutation({
    mutationFn: ({ id, status: s, note }) => ordersApi.updateStatus(id, s, note),
    onSuccess: (updated) => { afterChange(updated); addToast(`Order ${updated.orderNumber} moved to ${humanize(updated.orderStatus)}.`); setConfirmCancel(false); },
    onError: (err) => { setConfirmCancel(false); addToast(errorMessage(err, "Failed to update order status"), "error"); },
  });
  const shipMutation = useMutation({
    mutationFn: ({ id, data }) => ordersApi.updateShipment(id, data),
    onSuccess: (updated) => { afterChange(updated); addToast("Shipment details saved."); setShipErr({ fields: {}, general: "" }); },
    onError: (err) => setShipErr(splitFormError(err, "Could not save shipment")),
  });
  const notesMutation = useMutation({
    mutationFn: ({ id, notes }) => ordersApi.updateNotes(id, notes),
    onSuccess: (updated) => { afterChange(updated); addToast("Internal notes saved."); },
    onError: (err) => addToast(errorMessage(err, "Could not save notes"), "error"),
  });

  const applyStatus = () => {
    if (!order || !nextStatus || statusMutation.isPending) return;
    if (nextStatus === "cancelled") return setConfirmCancel(true);
    statusMutation.mutate({ id: order._id, status: nextStatus, note: statusNote });
  };
  const shipLocked = order && (order.orderStatus === "delivered" || order.orderStatus === "cancelled");
  const saveShipment = () => {
    if (!ship.courierName.trim() && !ship.trackingNumber.trim() && !ship.trackingUrl.trim()) {
      return setShipErr({ fields: {}, general: "Enter at least one shipment field." });
    }
    setShipErr({ fields: {}, general: "" });
    shipMutation.mutate({ id: order._id, data: ship });
  };

  const timeline = useMemo(
    () => [...(order?.statusHistory || [])].sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt)).map((h) => ({ status: humanize(h.status), timestamp: formatDateTime(h.changedAt), note: h.note })),
    [order],
  );

  return <div className="space-y-6">
      <PageHeader
    breadcrumb={[{ label: "Commerce" }, { label: "Orders" }]}
    title="Central Orders Ledger"
    description="Order pipeline across Retail, B2B Wholesale, Cut & Sew Manufacturing and Custom Printing. Orders are placed by customers or created from accepted quotes."
  />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Orders</span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{summary ? formatNumber(summary.total) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">All commerce streams</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Pending Fulfillment</span>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1">{summary ? formatNumber(summary.pending + summary.confirmed + summary.processing) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">{summary ? `${summary.pending} new · ${summary.confirmed} confirmed · ${summary.processing} processing` : "Awaiting dispatch"}</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">In Transit Courier</span>
          <div className="text-2xl font-bold font-mono text-blue-600 mt-1">{summary ? formatNumber(summary.shipped) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">Dispatched, not yet delivered</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Delivered</span>
          <div className="text-2xl font-bold font-mono text-emerald-800 mt-1">{summary ? formatNumber(summary.delivered) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">{summary ? `${summary.cancelled} cancelled` : "Completed orders"}</span>
        </div>
      </div>
      {summaryQuery.isError && <p className="text-xs text-rose-600">Couldn't load order totals. <button className="underline" onClick={() => summaryQuery.refetch()}>Retry</button></p>}

      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 border border-slate-200 w-fit text-xs">
        <button onClick={() => setTab("orders")} className={`px-4 py-1.5 rounded font-semibold transition-all ${tab === "orders" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"}`}>Orders</button>
        <button onClick={() => setTab("cancellations")} className={`px-4 py-1.5 rounded font-semibold transition-all flex items-center gap-1.5 ${tab === "cancellations" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"}`}>
          Cancellation Requests
          {pendingCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold">{pendingCount}</span>}
        </button>
      </div>

      {tab === "orders" && <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="max-w-md w-full">
              <SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by order #, client name, email, phone..." />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
              <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={sel}>
                <option value="all">All Statuses</option>
                {ORDER_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
              </select>
              <select value={type} onChange={(e) => reset(setType)(e.target.value)} className={sel}>
                <option value="all">All Channels</option>
                {Object.entries(ORDER_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={payment} onChange={(e) => reset(setPayment)(e.target.value)} className={sel}>
                <option value="all">All Payments</option>
                {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
              </select>
              <input type="date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} className={sel} aria-label="From date" />
              <input type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} className={sel} aria-label="To date" />
            </div>
          </div>
        </div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {tab === "cancellations" ? <CancellationsPanel canManage={canManage} /> : listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={6} /></div> : items.length === 0 ? <div className="p-12">
            <EmptyState
    title={filtersActive ? "No Orders Found" : "No Orders Yet"}
    description={filtersActive ? "No orders match the specified filters." : "Orders will appear here as customers check out."}
    action={filtersActive ? <button onClick={() => { setSearch(""); setStatus("all"); setType("all"); setPayment("all"); setFrom(""); setTo(""); setPage(1); }} className="px-4 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors">Reset Filters</button> : null}
  />
          </div> : <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Order # &amp; Date</th>
                  <th className="py-3 px-4">Sales Stream</th>
                  <th className="py-3 px-4">Customer &amp; City</th>
                  <th className="py-3 px-4">Cart Breakdown</th>
                  <th className="py-3 px-4">Total Amount</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Fulfillment Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {items.map((o) => <tr key={o._id} className="hover:bg-slate-50/70 transition-colors cursor-pointer" onClick={() => openOrder(o._id)}>
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-slate-900">{o.orderNumber}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{formatDate(o.placedAt || o.createdAt)}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border ${typeBadgeClass(o.orderType)}`}>{ORDER_TYPES[o.orderType] || humanize(o.orderType)}</span>
                      {o.quote && <div className="text-[10px] text-slate-400 font-mono mt-0.5">From quote</div>}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{o.customer?.name}</div>
                      <div className="text-[11px] text-slate-400">{o.shippingAddress?.city}, {o.shippingAddress?.country}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-800 font-medium">{o.items?.length} {o.items?.length === 1 ? "line item" : "line items"}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{o.items?.[0] && itemTitle(o.items[0])}</div>
                    </td>
                    <td className="py-3.5 px-4"><div className="font-mono font-bold text-slate-900">{formatMoney(o.pricing?.total, { currency: o.currency || "PKR" })}</div></td>
                    <td className="py-3.5 px-4"><StatusBadge status={o.paymentStatus} /></td>
                    <td className="py-3.5 px-4"><StatusBadge status={o.orderStatus} /></td>
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openOrder(o._id)} title="Inspect order details" className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"><Eye className="w-4 h-4" /></button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>}
        {tab === "orders" && meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="order" labelPlural="orders" />}
        {tab === "orders" && listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
      </div>

      <Drawer
    isOpen={Boolean(activeId)}
    onClose={closeOrder}
    title={order ? `Order ${order.orderNumber}` : "Order"}
    subtitle={order ? `Channel: ${ORDER_TYPES[order.orderType] || humanize(order.orderType)}` : ""}
    badge={order && <StatusBadge status={order.orderStatus} />}
    headerActions={order && <button onClick={() => setInvoiceOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"><Printer className="w-3.5 h-3.5" />Invoice</button>}
  >
        {detailQuery.isLoading ? <LoadingSkeleton rows={5} /> : detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} /> : order && <div className="space-y-6">
            {canManage && <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-800 block">Update Order Status</span>
                {allowed.length === 0 ? <p className="text-xs text-slate-500">This order is {humanize(order.orderStatus)} — no further status changes are possible.</p> : <>
                    <div className="flex gap-2">
                      <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="flex-1 text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg font-semibold focus:ring-1 focus:ring-[#00130d] outline-none">
                        {allowed.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                      </select>
                      <button onClick={applyStatus} disabled={statusMutation.isPending} className="px-4 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60 inline-flex items-center gap-1.5">
                        {statusMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Apply
                      </button>
                    </div>
                    <input type="text" value={statusNote} maxLength={1000} onChange={(e) => setStatusNote(e.target.value)} placeholder="Optional audit log comment..." className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none" />
                    <p className="text-[11px] text-slate-500">Shipping an order deducts its reserved stock; cancelling releases it.</p>
                  </>}
              </div>}

            <div>
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Purchased Items ({order.items.length})</h5>
              <div className="space-y-2">
                {order.items.map((item) => <div key={item._id} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl">
                    {item.image?.url ? <img src={item.image.url} alt={itemTitle(item)} className="w-12 h-14 object-cover rounded-lg border border-slate-200 flex-shrink-0" /> : <div className="w-12 h-14 rounded-lg border border-slate-200 bg-slate-50 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs text-slate-900 truncate">{itemTitle(item)}</div>
                      <div className="flex items-center flex-wrap gap-x-2 mt-0.5 text-[11px] text-slate-500">{itemSubtitle(item).map((t, i) => <span key={i} className={i === itemSubtitle(item).length - 1 && item.skuCode ? "font-mono text-slate-400" : ""}>{t}</span>)}</div>
                      {(item.manufacturingRequirements || item.printingRequirements) && <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{item.manufacturingRequirements || item.printingRequirements}</div>}
                      <div className="flex items-center justify-between mt-1 text-xs font-mono">
                        <span className="text-slate-500">{item.quantity} × {formatMoney(item.unitPrice, { currency: order.currency || "PKR" })}</span>
                        <span className="font-bold text-slate-900">{formatMoney(item.lineTotal, { currency: order.currency || "PKR" })}</span>
                      </div>
                    </div>
                  </div>)}
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-mono font-medium">{formatMoney(order.pricing?.subtotal, { currency: order.currency || "PKR" })}</span></div>
              <div className="flex justify-between text-slate-500"><span>Courier Logistics</span><span className="font-mono font-medium">{formatMoney(order.pricing?.shipping, { currency: order.currency || "PKR" })}</span></div>
              {order.pricing?.additionalCharges > 0 && <div className="flex justify-between text-slate-500"><span>Additional Charges</span><span className="font-mono font-medium">{formatMoney(order.pricing.additionalCharges, { currency: order.currency || "PKR" })}</span></div>}
              {order.pricing?.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount{order.coupon?.code ? ` (${order.coupon.code})` : ""}</span><span className="font-mono font-medium">- {formatMoney(order.pricing.discount, { currency: order.currency || "PKR" })}</span></div>}
              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-sm"><span>Order Total</span><span className="font-mono text-[#00130d]">{formatMoney(order.pricing?.total, { currency: order.currency || "PKR" })}</span></div>
              <div className="flex items-center justify-between pt-1"><span className="text-slate-500">Payment</span><span className="flex items-center gap-2"><StatusBadge status={order.paymentStatus} size="sm" /><Link to={`/payments?search=${encodeURIComponent(order.orderNumber)}`} className="text-[11px] text-emerald-700 hover:underline">View payment</Link></span></div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900"><Truck className="w-4 h-4 text-slate-500" />Courier Tracking &amp; Transit</div>
              {shipErr.general && <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-100 text-xs text-rose-700 font-medium" role="alert">{shipErr.general}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Logistics Partner" error={shipErr.fields.courierName}><input disabled={!canManage || shipLocked} type="text" maxLength={120} value={ship.courierName} onChange={(e) => setShip((s) => ({ ...s, courierName: e.target.value }))} className={fld} /></FormField>
                <FormField label="Tracking Waybill" error={shipErr.fields.trackingNumber}><input disabled={!canManage || shipLocked} type="text" maxLength={160} value={ship.trackingNumber} onChange={(e) => setShip((s) => ({ ...s, trackingNumber: e.target.value }))} className={`${fld} font-mono`} /></FormField>
              </div>
              <FormField label="Tracking URL" error={shipErr.fields.trackingUrl}><input disabled={!canManage || shipLocked} type="url" maxLength={500} value={ship.trackingUrl} onChange={(e) => setShip((s) => ({ ...s, trackingUrl: e.target.value }))} placeholder="https://…" className={fld} /></FormField>
              {order.shipment?.shippedAt && <div className="text-[11px] text-slate-500">Shipped {formatDateTime(order.shipment.shippedAt)}{order.shipment.deliveredAt ? ` · Delivered ${formatDateTime(order.shipment.deliveredAt)}` : ""}</div>}
              {canManage && !shipLocked && <div className="flex justify-end"><button onClick={saveShipment} disabled={shipMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60">{shipMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save shipment</button></div>}
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-slate-900"><User className="w-4 h-4 text-slate-500" />Customer &amp; Destination</div>
              <div className="text-slate-700 font-semibold">{order.shippingAddress?.fullName}</div>
              <div className="text-slate-500">{order.customer?.email}</div>
              <div className="text-slate-500">{[order.shippingAddress?.addressLine1, order.shippingAddress?.addressLine2].filter(Boolean).join(", ")}</div>
              <div className="text-slate-500">{[order.shippingAddress?.city, order.shippingAddress?.province, order.shippingAddress?.postalCode, order.shippingAddress?.country].filter(Boolean).join(", ")}</div>
              <div className="text-slate-500 flex items-center gap-1.5 pt-1"><Phone className="w-3.5 h-3.5 text-slate-400" />{order.shippingAddress?.phone}</div>
              {order.customerNotes && <div className="pt-2 mt-1 border-t border-slate-100"><span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Customer note</span><p className="text-slate-600 whitespace-pre-wrap">{order.customerNotes}</p></div>}
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
              <span className="text-xs font-bold text-slate-900 block">Internal Notes</span>
              <textarea rows={3} maxLength={5000} disabled={!canManage} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Visible to staff only…" className={`${fld} resize-none`} />
              {canManage && <div className="flex justify-end"><button onClick={() => notesMutation.mutate({ id: order._id, notes: adminNotes })} disabled={notesMutation.isPending || adminNotes === (order.adminNotes || "")} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg disabled:opacity-50">{notesMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save notes</button></div>}
            </div>

            <div>
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Order Timeline</h5>
              <OrderTimeline events={timeline} />
            </div>
          </div>}
      </Drawer>

      <ConfirmDialog
    isOpen={confirmCancel}
    onClose={() => setConfirmCancel(false)}
    onConfirm={() => statusMutation.mutate({ id: order._id, status: "cancelled", note: statusNote })}
    isLoading={statusMutation.isPending}
    title="Cancel this order?"
    message={`Order ${order?.orderNumber} will be cancelled and its reserved stock released. This cannot be undone.`}
    confirmLabel="Cancel order"
  />

      <Modal isOpen={invoiceOpen && Boolean(order)} onClose={() => setInvoiceOpen(false)} title={order ? `Invoice ${order.orderNumber}` : "Invoice"} subtitle="PEHAN LY order invoice" maxWidth="max-w-2xl">
        {order && <div className="p-6 bg-white space-y-6 text-slate-800 print-area">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-black tracking-tight text-[#00130d]">PEHAN LY</h2>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Order Invoice</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold text-slate-900 block">{order.orderNumber}</span>
                <span className="text-[11px] text-slate-400 block">Date: {formatDate(order.placedAt || order.createdAt)}</span>
                <span className="text-[11px] text-emerald-700 font-semibold block">Payment: {humanize(order.paymentStatus)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">Consignee / Customer</span>
                <p className="font-bold text-slate-900 mt-1">{order.shippingAddress?.fullName}</p>
                <p className="text-slate-600">{[order.shippingAddress?.addressLine1, order.shippingAddress?.addressLine2].filter(Boolean).join(", ")}</p>
                <p className="text-slate-600">{[order.shippingAddress?.city, order.shippingAddress?.country].filter(Boolean).join(", ")}</p>
                <p className="text-slate-600">{order.shippingAddress?.phone}</p>
              </div>
              <div>
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px] block">Logistics</span>
                <p className="font-semibold text-slate-800 mt-1">Courier: {order.shipment?.courierName || "—"}</p>
                <p className="text-slate-600 font-mono">Waybill: {order.shipment?.trackingNumber || "—"}</p>
              </div>
            </div>
            <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
              <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200"><tr><th className="p-2.5">Item &amp; Specification</th><th className="p-2.5 text-center">Qty</th><th className="p-2.5 text-right">Unit Price</th><th className="p-2.5 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {order.items.map((item) => <tr key={item._id}>
                    <td className="p-2.5"><span className="font-bold text-slate-800 font-sans block">{itemTitle(item)}</span><span className="text-[10px] text-slate-400 font-sans">{[item.colorName, item.size && `Size ${item.size}`, item.skuCode].filter(Boolean).join(" / ")}</span></td>
                    <td className="p-2.5 text-center">{item.quantity}</td>
                    <td className="p-2.5 text-right">{formatMoney(item.unitPrice, { currency: order.currency || "PKR" })}</td>
                    <td className="p-2.5 text-right font-bold">{formatMoney(item.lineTotal, { currency: order.currency || "PKR" })}</td>
                  </tr>)}
              </tbody>
            </table>
            <div className="flex justify-end text-xs">
              <div className="w-64 space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-500"><span>Subtotal:</span><span>{formatMoney(order.pricing?.subtotal, { currency: order.currency || "PKR" })}</span></div>
                {order.pricing?.discount > 0 && <div className="flex justify-between text-slate-500"><span>Discount:</span><span>- {formatMoney(order.pricing.discount, { currency: order.currency || "PKR" })}</span></div>}
                <div className="flex justify-between text-slate-500"><span>Delivery:</span><span>{formatMoney(order.pricing?.shipping, { currency: order.currency || "PKR" })}</span></div>
                {order.pricing?.additionalCharges > 0 && <div className="flex justify-between text-slate-500"><span>Additional:</span><span>{formatMoney(order.pricing.additionalCharges, { currency: order.currency || "PKR" })}</span></div>}
                <div className="flex justify-between font-bold text-sm text-slate-900 pt-2 border-t border-slate-200"><span>Total:</span><span className="text-[#00130d]">{formatMoney(order.pricing?.total, { currency: order.currency || "PKR" })}</span></div>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800"><Printer className="w-4 h-4" />Print Invoice</button>
            </div>
          </div>}
      </Modal>
    </div>;
};
