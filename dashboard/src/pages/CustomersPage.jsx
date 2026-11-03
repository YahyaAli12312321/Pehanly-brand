import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Star, Phone, MapPin, Eye, Building, Loader2 } from "lucide-react";
import { customersApi } from "../services/customersApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { formatDate, formatDateTime, formatMoney, formatNumber, humanize } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { SearchInput } from "../components/common/SearchInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { Pagination } from "../components/common/Pagination";
import { Drawer } from "../components/common/Drawer";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { ConfirmDialog } from "../components/common/ConfirmDialog";

const TIER_LABEL = { retail: "Retail Standard", vip: "Retail VIP", wholesale: "Wholesale Client" };
const sel = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";
const TierBadge = ({ tier }) => <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${tier === "wholesale" ? "bg-amber-50 text-amber-800 border-amber-200" : tier === "vip" ? "bg-purple-50 text-purple-800 border-purple-200" : "bg-slate-100 text-slate-700 border-slate-200"}`}>
    {tier === "wholesale" && <Building className="w-3 h-3" />}
    {tier === "vip" && <Star className="w-3 h-3 fill-purple-400" />}
    {TIER_LABEL[tier] || humanize(tier)}
  </span>;

export const CustomersPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const { can } = useAuth();
  const canManage = can("customers.manage");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [tier, setTier] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeId, setActiveId] = useState(routeId || null);
  const [ordersPage, setOrdersPage] = useState(1);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);

  useEffect(() => { if (routeId) setActiveId(routeId); }, [routeId]);

  const params = { search: debouncedSearch.trim() || undefined, status: status === "all" ? undefined : status, tier: tier === "all" ? undefined : tier, sortBy, sortDir: sortBy === "name" ? "asc" : "desc", page, limit: pageSize };
  const listQuery = useQuery({ queryKey: keys.customers.list(params), queryFn: () => customersApi.list(params), placeholderData: keepPreviousData });
  const summaryQuery = useQuery({ queryKey: keys.customers.summary, queryFn: customersApi.summary });
  const detailQuery = useQuery({ queryKey: keys.customers.detail(activeId), queryFn: () => customersApi.get(activeId), enabled: !!activeId });
  const ordersQuery = useQuery({ queryKey: keys.customers.orders(activeId, ordersPage), queryFn: () => customersApi.orders(activeId, { page: ordersPage, limit: 10 }), enabled: !!activeId });

  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const summary = summaryQuery.data;
  const customer = detailQuery.data;

  const statusMutation = useMutation({
    mutationFn: ({ id, status: s, reason: r }) => customersApi.setStatus(id, s, r),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: keys.customers.all });
      addToast(`Customer account ${res.status === "active" ? "reactivated" : "suspended"}.`);
      setSuspendOpen(false);
      setReason("");
    },
    onError: (err) => { setSuspendOpen(false); addToast(errorMessage(err, "Failed to update account status"), "error"); },
  });

  const reset = (setter) => (v) => { setter(v); setPage(1); };
  const open = (id) => { setActiveId(id); setOrdersPage(1); if (routeId !== id) navigate(`/customers/${id}`); };
  const close = () => { setActiveId(null); if (routeId) navigate("/customers"); };
  const filtersActive = debouncedSearch || status !== "all" || tier !== "all";
  const addr = customer?.primaryAddress;

  return <div className="space-y-6">
      <PageHeader
    breadcrumb={[{ label: "Commerce" }, { label: "Customers" }]}
    title="Customer Profiles & Institutional Accounts"
    description="Relationship management across Retail shoppers, VIP tiers and verified B2B buyers. Customers register themselves; here you review them and manage account access."
  />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Accounts</span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{summary ? formatNumber(summary.totalAccounts) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">{summary ? `${summary.activeAccounts} active · ${summary.suspendedAccounts} suspended` : "Registered in ecosystem"}</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">B2B Wholesale Accounts</span>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1">{summary ? formatNumber(summary.b2bWholesaleAccounts) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">Wholesale tier</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Retail VIP Patrons</span>
          <div className="text-2xl font-bold font-mono text-blue-600 mt-1">{summary ? formatNumber(summary.retailVipPatrons) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">VIP tier</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Cumulative LTV</span>
          <div className="text-2xl font-bold font-mono text-emerald-800 mt-1">{summary ? formatMoney(summary.cumulativeLtv, { compact: true }) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">Delivered orders by registered customers</span>
        </div>
      </div>
      {summaryQuery.isError && <p className="text-xs text-rose-600">Couldn't load account totals. <button className="underline" onClick={() => summaryQuery.refetch()}>Retry</button></p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="max-w-md w-full"><SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by name, email, phone or client #..." /></div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={sel}>
            <option value="all">All Statuses</option>
            <option value="active">Active Accounts</option>
            <option value="suspended">Suspended</option>
          </select>
          <select value={tier} onChange={(e) => reset(setTier)(e.target.value)} className={sel}>
            <option value="all">All Tiers</option>
            <option value="retail">Retail Standard</option>
            <option value="vip">Retail VIP</option>
            <option value="wholesale">Wholesale Client</option>
          </select>
          <select value={sortBy} onChange={(e) => reset(setSortBy)(e.target.value)} className={sel}>
            <option value="createdAt">Newest first</option>
            <option value="name">Name (A-Z)</option>
            <option value="orders">Most orders</option>
            <option value="ltv">Highest LTV</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={6} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title={filtersActive ? "No Customers Found" : "No Customers Yet"} description={filtersActive ? "No accounts match your query criteria." : "Customers appear here after they register on the storefront."} /></div> : <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Client ID &amp; Name</th>
                  <th className="py-3 px-4">Account Tier</th>
                  <th className="py-3 px-4">Contact Info</th>
                  <th className="py-3 px-4">City / Region</th>
                  <th className="py-3 px-4 text-center">Orders</th>
                  <th className="py-3 px-4 text-right">Lifetime Value (LTV)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {items.map((c) => <tr key={c._id} className="hover:bg-slate-50/70 transition-colors cursor-pointer" onClick={() => open(c._id)}>
                    <td className="py-3.5 px-4"><div className="font-semibold text-slate-900">{c.name}</div><div className="font-mono text-[10px] text-slate-400 mt-0.5">{c.customerNumber}</div></td>
                    <td className="py-3.5 px-4"><TierBadge tier={c.accountTier} /></td>
                    <td className="py-3.5 px-4"><div className="text-slate-700">{c.email}</div><div className="text-slate-400 text-[11px]">{c.phone}</div></td>
                    <td className="py-3.5 px-4 text-slate-600">{[c.city, c.region].filter(Boolean).join(", ") || "—"}</td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-800">{c.totalOrders}</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">{formatMoney(c.lifetimeValue)}</td>
                    <td className="py-3.5 px-4"><StatusBadge status={c.status} /></td>
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => open(c._id)} title="Inspect profile & history" className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"><Eye className="w-4 h-4" /></button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>}
        {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="customer" labelPlural="customers" />}
        {listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
      </div>

      <Drawer
    isOpen={Boolean(activeId)}
    onClose={close}
    title={customer?.name || "Customer Account"}
    subtitle={customer ? `ID: ${customer.customerNumber}` : ""}
    badge={customer && <StatusBadge status={customer.status} />}
    headerActions={customer && canManage && (customer.status === "active" ? <button onClick={() => { setReason(""); setSuspendOpen(true); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors bg-rose-50 text-rose-700 hover:bg-rose-100">Suspend Account</button> : <button onClick={() => statusMutation.mutate({ id: customer._id, status: "active" })} disabled={statusMutation.isPending} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-60">{statusMutation.isPending ? "Working…" : "Reactivate Account"}</button>)}
  >
        {detailQuery.isLoading ? <LoadingSkeleton rows={4} /> : detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} /> : customer && <div className="space-y-6">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div><h4 className="font-bold text-slate-900 text-sm">{customer.name}</h4><p className="text-xs text-slate-500">{customer.email}</p></div>
                <TierBadge tier={customer.accountTier} />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs">
                <div><span className="text-slate-400 block text-[10px]">Total Orders</span><span className="font-mono font-bold text-slate-900">{customer.totalOrders}</span></div>
                <div><span className="text-slate-400 block text-[10px]">Lifetime Spend (delivered)</span><span className="font-mono font-bold text-emerald-800">{formatMoney(customer.lifetimeValue)}</span></div>
                <div><span className="text-slate-400 block text-[10px]">Joined</span><span className="font-medium text-slate-700">{formatDate(customer.createdAt)}</span></div>
                <div><span className="text-slate-400 block text-[10px]">Last sign-in</span><span className="font-medium text-slate-700">{customer.lastLoginAt ? formatDateTime(customer.lastLoginAt) : "—"}</span></div>
              </div>
              {customer.status === "suspended" && <div className="pt-2 border-t border-slate-200/60 text-xs text-rose-700">Suspended {customer.suspendedAt ? formatDateTime(customer.suspendedAt) : ""}{customer.suspensionReason ? ` — ${customer.suspensionReason}` : ""}</div>}
            </div>

            <div className="space-y-2 text-xs">
              <h5 className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">Contact Details</h5>
              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-slate-700"><Phone className="w-3.5 h-3.5 text-slate-400" />{customer.phone}</div>
                {addr ? <div className="flex items-start gap-2 text-slate-700"><MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5" /><span>{[addr.addressLine1, addr.addressLine2, addr.city, addr.province, addr.postalCode].filter(Boolean).join(", ")}</span></div> : <div className="flex items-center gap-2 text-slate-400"><MapPin className="w-3.5 h-3.5" />No saved address</div>}
              </div>
            </div>

            <div>
              <h5 className="font-bold uppercase tracking-wider text-slate-400 text-[10px] mb-2">Order History ({ordersQuery.data?.meta?.total ?? customer.totalOrders})</h5>
              {ordersQuery.isLoading ? <LoadingSkeleton rows={2} /> : ordersQuery.isError ? <ErrorState error={ordersQuery.error} onRetry={() => ordersQuery.refetch()} className="p-6" /> : (ordersQuery.data?.items || []).length === 0 ? <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500">No orders recorded for this account yet.</div> : <div className="space-y-2">
                  {ordersQuery.data.items.map((o) => <Link key={o._id} to={`/orders/${o._id}`} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:border-slate-300">
                      <div><div className="font-mono font-bold text-slate-900">{o.orderNumber}</div><div className="text-[10px] text-slate-400">{formatDate(o.placedAt)} • {o.itemCount} items</div></div>
                      <div className="text-right"><div className="font-mono font-bold text-slate-900">{formatMoney(o.total)}</div><div className="mt-0.5"><StatusBadge status={o.orderStatus} size="sm" /></div></div>
                    </Link>)}
                  {ordersQuery.data.meta?.totalPages > 1 && <div className="flex items-center justify-between text-xs pt-1">
                      <button disabled={ordersPage <= 1} onClick={() => setOrdersPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Newer</button>
                      <span className="text-slate-500">Page {ordersQuery.data.meta.page} of {ordersQuery.data.meta.totalPages}</span>
                      <button disabled={ordersPage >= ordersQuery.data.meta.totalPages} onClick={() => setOrdersPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Older</button>
                    </div>}
                </div>}
            </div>
          </div>}
      </Drawer>

      <ConfirmDialog
    isOpen={suspendOpen}
    onClose={() => !statusMutation.isPending && setSuspendOpen(false)}
    onConfirm={() => {
      if (reason.trim() && reason.trim().length < 3) return;
      statusMutation.mutate({ id: customer._id, status: "suspended", reason });
    }}
    isLoading={statusMutation.isPending}
    title="Suspend this account?"
    message={<span className="block space-y-2">
          <span className="block">{customer?.name} will be signed out everywhere and won't be able to sign in until reactivated.</span>
          <input type="text" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, min. 3 characters)" className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none" />
        </span>}
    confirmLabel="Suspend account"
  />
    </div>;
};
