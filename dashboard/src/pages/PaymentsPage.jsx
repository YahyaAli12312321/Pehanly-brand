import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Banknote, Smartphone, Check, Eye, Loader2 } from "lucide-react";
import { paymentsApi, GATEWAY_LABELS } from "../services/paymentsApi";
import { PAYMENT_STATUSES } from "../lib/orderLifecycle";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { dateInputToIso, formatDateTime, formatMoney, formatNumber, humanize } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { SearchInput } from "../components/common/SearchInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { Pagination } from "../components/common/Pagination";
import { Drawer } from "../components/common/Drawer";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";

const sel = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";

const GatewayBadge = ({ gateway }) => gateway === "jazzcash" ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"><Smartphone className="w-3 h-3" />JazzCash</span> : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200"><Banknote className="w-3 h-3" />{GATEWAY_LABELS[gateway] || humanize(gateway)}</span>;

export const PaymentsPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const { can } = useAuth();
  const canManage = can("payments.manage");

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [status, setStatus] = useState("all");
  const [gateway, setGateway] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeId, setActiveId] = useState(routeId || null);
  const [confirming, setConfirming] = useState(null);
  const debouncedSearch = useDebouncedValue(search, 350);

  useEffect(() => { if (routeId) setActiveId(routeId); }, [routeId]);

  const params = { search: debouncedSearch.trim() || undefined, status: status === "all" ? undefined : status, gateway: gateway === "all" ? undefined : gateway, from: dateInputToIso(from), to: dateInputToIso(to, true), page, limit: pageSize };
  const listQuery = useQuery({ queryKey: keys.payments.list(params), queryFn: () => paymentsApi.list(params), placeholderData: keepPreviousData });
  const summaryQuery = useQuery({ queryKey: ["payments", "summary"], queryFn: paymentsApi.summary });
  const detailQuery = useQuery({ queryKey: keys.payments.detail(activeId), queryFn: () => paymentsApi.get(activeId), enabled: !!activeId });

  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const summary = summaryQuery.data;
  const payment = detailQuery.data;

  const confirmMutation = useMutation({
    mutationFn: (id) => paymentsApi.confirmCod(id),
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: keys.payments.all });
      queryClient.invalidateQueries({ queryKey: keys.orders.all });
      queryClient.invalidateQueries({ queryKey: keys.dashboard.summary });
      addToast(`COD payment ${p.paymentNumber} confirmed as received.`);
      setConfirming(null);
    },
    onError: (err) => { setConfirming(null); addToast(errorMessage(err, "Could not confirm the payment"), "error"); },
  });

  const reset = (setter) => (v) => { setter(v); setPage(1); };
  const open = (id) => { setActiveId(id); if (routeId !== id) navigate(`/payments/${id}`); };
  const close = () => { setActiveId(null); if (routeId) navigate("/payments"); };
  const canConfirm = (p) => canManage && p.gateway === "cod" && ["pending", "processing"].includes(p.status);
  const filtersActive = debouncedSearch || status !== "all" || gateway !== "all" || from || to;
  const orderOf = (p) => p.orderData || p.order || {};

  return <div className="space-y-6">
      <PageHeader
    breadcrumb={[{ label: "Finance" }, { label: "Payments" }]}
    title="Payment Gateways & Ledger"
    description="Reconciliation ledger for Cash on Delivery receipts and JazzCash online payments. Refunds are handled through Returns & Refunds."
  />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Settled</span>
          <div className="text-2xl font-bold font-mono text-emerald-800 mt-1">{summary ? formatMoney(summary.totalSettled) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">Net of gateway fees</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Pending Inflow</span>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1">{summary ? formatMoney(summary.pendingGatewayInflow) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">Awaiting COD collection or gateway</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Refunded Payments</span>
          <div className="text-2xl font-bold font-mono text-rose-600 mt-1">{summary ? formatNumber(summary.refundPaymentCount) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">Fully or partially refunded</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Gateway Success Rate</span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{summary ? `${summary.gatewayEfficiency}%` : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">Online (JazzCash) payments, paid vs failed</span>
        </div>
      </div>
      {summaryQuery.isError && <p className="text-xs text-rose-600">Couldn't load payment totals ({summaryQuery.error?.message}). <button className="underline" onClick={() => summaryQuery.refetch()}>Retry</button></p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="max-w-md w-full"><SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by Payment #, Order #, customer, transaction ID..." /></div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={sel}>
            <option value="all">All Statuses</option>
            {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </select>
          <select value={gateway} onChange={(e) => reset(setGateway)(e.target.value)} className={sel}>
            <option value="all">All Gateways</option>
            <option value="cod">Cash on Delivery</option>
            <option value="jazzcash">JazzCash</option>
          </select>
          <input type="date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} className={sel} aria-label="From date" />
          <input type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} className={sel} aria-label="To date" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={6} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title={filtersActive ? "No Payments Match" : "No Payments Yet"} description={filtersActive ? "No transaction records match the filters." : "Payments are created when customers check out."} /></div> : <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Payment Ref</th>
                  <th className="py-3 px-4">Linked Order</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Gateway</th>
                  <th className="py-3 px-4 text-right">Gross Amount</th>
                  <th className="py-3 px-4 text-right">Gateway Fee</th>
                  <th className="py-3 px-4 text-right">Net Settled</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {items.map((p) => {
    const ord = orderOf(p);
    return <tr key={p._id} className="hover:bg-slate-50/70 transition-colors cursor-pointer" onClick={() => open(p._id)}>
                      <td className="py-3.5 px-4"><div className="font-mono font-bold text-slate-900">{p.paymentNumber}</div><div className="text-[10px] text-slate-400 font-mono mt-0.5">{p.transactionId || "—"}</div></td>
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>{ord._id ? <Link to={`/orders/${ord._id}`} className="font-mono font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px] hover:bg-slate-200">{ord.orderNumber}</Link> : "—"}</td>
                      <td className="py-3.5 px-4"><div className="font-semibold text-slate-900">{ord.customer?.name || "—"}</div></td>
                      <td className="py-3.5 px-4"><GatewayBadge gateway={p.gateway} /></td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">{formatMoney(p.amount)}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-400">{formatMoney(p.gatewayFee || 0)}</td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-800">{formatMoney(p.netAmount)}</td>
                      <td className="py-3.5 px-4"><StatusBadge status={p.status} /></td>
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          {canConfirm(p) && <button onClick={() => setConfirming(p)} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg transition-colors"><Check className="w-3 h-3" />Confirm COD</button>}
                          <button onClick={() => open(p._id)} title="Payment details" className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg"><Eye className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>;
  })}
              </tbody>
            </table>
          </div>}
        {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="payment" labelPlural="payments" />}
        {listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
      </div>

      <Drawer isOpen={Boolean(activeId)} onClose={close} title={payment ? `Payment ${payment.paymentNumber}` : "Payment"} subtitle={payment ? GATEWAY_LABELS[payment.gateway] || humanize(payment.gateway) : ""} badge={payment && <StatusBadge status={payment.status} />}>
        {detailQuery.isLoading ? <LoadingSkeleton rows={4} /> : detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} /> : payment && <div className="space-y-5 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between"><span className="text-slate-500">Gross amount</span><span className="font-mono font-bold">{formatMoney(payment.amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Gateway fee</span><span className="font-mono">{formatMoney(payment.gatewayFee || 0)}</span></div>
              <div className="flex justify-between pt-2 border-t border-slate-200 font-bold"><span>Net</span><span className="font-mono text-emerald-800">{formatMoney(payment.netAmount)}</span></div>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1.5">
              <div className="flex justify-between"><span className="text-slate-500">Order</span>{payment.order?._id ? <Link to={`/orders/${payment.order._id}`} className="font-mono font-semibold text-emerald-700 hover:underline">{payment.order.orderNumber}</Link> : "—"}</div>
              <div className="flex justify-between"><span className="text-slate-500">Customer</span><span className="font-medium">{payment.order?.customer?.name || payment.user?.name || "Guest"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Transaction ID</span><span className="font-mono">{payment.transactionId || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Created</span><span>{formatDateTime(payment.createdAt)}</span></div>
              {payment.paidAt && <div className="flex justify-between"><span className="text-slate-500">Paid</span><span>{formatDateTime(payment.paidAt)}</span></div>}
              {payment.failedAt && <div className="flex justify-between"><span className="text-slate-500">Failed</span><span>{formatDateTime(payment.failedAt)}</span></div>}
              {payment.cancelledAt && <div className="flex justify-between"><span className="text-slate-500">Cancelled</span><span>{formatDateTime(payment.cancelledAt)}</span></div>}
              {payment.refundedAt && <div className="flex justify-between"><span className="text-slate-500">Refunded</span><span>{formatDateTime(payment.refundedAt)}</span></div>}
            </div>
            {payment.failureReason && <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-700">{payment.failureReason}</div>}
            {payment.providerResponse && <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1"><span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Gateway response</span>{payment.providerResponse.responseCode && <div>Code: <span className="font-mono">{payment.providerResponse.responseCode}</span></div>}{payment.providerResponse.responseMessage && <div>{payment.providerResponse.responseMessage}</div>}{payment.providerResponse.reference && <div className="font-mono text-slate-500">Ref: {payment.providerResponse.reference}</div>}</div>}
            {canConfirm(payment) && <button onClick={() => setConfirming(payment)} className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-800 text-white font-semibold rounded-lg hover:bg-emerald-700"><Check className="w-4 h-4" />Confirm cash received</button>}
          </div>}
      </Drawer>

      <ConfirmDialog
    isOpen={Boolean(confirming)}
    onClose={() => !confirmMutation.isPending && setConfirming(null)}
    onConfirm={() => confirmMutation.mutate(confirming._id)}
    isLoading={confirmMutation.isPending}
    title="Confirm COD payment"
    message={`Mark ${confirming ? formatMoney(confirming.amount) : ""} as received for payment ${confirming?.paymentNumber}? The linked order will be marked paid.`}
    confirmLabel="Confirm received"
    isDestructive={false}
    type="info"
  />
    </div>;
};
