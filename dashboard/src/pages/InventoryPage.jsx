import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Plus, Minus, RefreshCw, History, Loader2 } from "lucide-react";
import { inventoryApi, ADJUST_REASONS } from "../services/inventoryApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { splitFormError } from "../lib/formErrors";
import { formatDateTime, formatNumber, humanize } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { SearchInput } from "../components/common/SearchInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { Pagination } from "../components/common/Pagination";
import { Modal } from "../components/common/Modal";
import { Drawer } from "../components/common/Drawer";
import { FormField } from "../components/common/FormField";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";

const FILTERS = [
  { id: "all", label: "All Inventory" },
  { id: "out", label: "Out of Stock" },
  { id: "critical", label: "Critical < 5" },
  { id: "low", label: "Low Stock" },
];
const statusLabel = { ok: "In Stock", low: "Low Stock", out: "Out of Stock" };
const field = "w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none";

export const InventoryPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { can } = useAuth();
  const canManage = can("inventory.manage");
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [filter, setFilter] = useState(FILTERS.some((f) => f.id === searchParams.get("filter")) ? searchParams.get("filter") : "all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState(null);
  const [historySku, setHistorySku] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 350);

  const [direction, setDirection] = useState("add");
  const [quantity, setQuantity] = useState("10");
  const [reason, setReason] = useState(ADJUST_REASONS[0].value);
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [formErr, setFormErr] = useState({ fields: {}, general: "" });

  const params = { search: debouncedSearch.trim() || undefined, filter, page, limit: pageSize };
  const listQuery = useQuery({ queryKey: keys.inventory.list(params), queryFn: () => inventoryApi.list(params), placeholderData: keepPreviousData });
  const summaryQuery = useQuery({ queryKey: keys.inventory.summary, queryFn: inventoryApi.summary });
  const historyQuery = useQuery({
    queryKey: keys.inventory.history(historySku, historyPage),
    queryFn: () => inventoryApi.history(historySku, { page: historyPage, limit: 20 }),
    enabled: !!historySku,
  });

  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const summary = summaryQuery.data;

  const adjustMutation = useMutation({
    mutationFn: ({ sku, ...body }) => inventoryApi.adjust(sku, body),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: keys.inventory.all });
      queryClient.invalidateQueries({ queryKey: keys.products.all });
      queryClient.invalidateQueries({ queryKey: keys.dashboard.summary });
      addToast(`Stock for ${res.sku} adjusted. Available: ${res.available} units`);
      setSelected(null);
    },
    onError: (err) => setFormErr(splitFormError(err, "Failed to adjust stock")),
  });

  const openAdjust = (item) => {
    setSelected(item);
    setDirection("add");
    setQuantity("10");
    setReason(ADJUST_REASONS[0].value);
    setNotes("");
    setReference("");
    setFormErr({ fields: {}, general: "" });
  };
  const reasonMeta = ADJUST_REASONS.find((r) => r.value === reason);
  const onReason = (value) => {
    setReason(value);
    if (ADJUST_REASONS.find((r) => r.value === value)?.addOnly) setDirection("add");
  };

  const submit = (e) => {
    e.preventDefault();
    if (!selected || adjustMutation.isPending) return;
    const qty = Math.round(Number(quantity));
    if (!(qty >= 1)) return setFormErr({ fields: { quantity: "Enter a quantity of at least 1" }, general: "" });
    if (direction === "remove" && qty > selected.available) {
      return setFormErr({ fields: { quantity: `Only ${selected.available} units are available to deduct (reserved units can't be removed)` }, general: "" });
    }
    setFormErr({ fields: {}, general: "" });
    adjustMutation.mutate({ sku: selected.sku, direction, quantity: qty, reason, notes, reference });
  };

  const resetFilters = () => {
    setSearch("");
    setFilter("all");
    setPage(1);
  };
  const filtersActive = debouncedSearch || filter !== "all";

  return <div className="space-y-6">
      <PageHeader
    breadcrumb={[{ label: "Operations" }, { label: "Inventory" }]}
    title="Central Inventory & Stock Ledger"
    description="Warehouse stock balancing, reserved units, reorder thresholds and physical reconciliations. Every change is written to the audit ledger."
    badge={<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">Available = On-Hand – Reserved</span>}
  />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tracked SKUs</span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{summary ? formatNumber(summary.trackedSkus) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">{summary ? `${formatNumber(summary.availableToSell)} units available to sell` : "All SKU variants"}</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Warehouse On-Hand</span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{summary ? formatNumber(summary.warehouseOnHand) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">Physical count in racks</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Reserved for Orders</span>
          <div className="text-2xl font-bold font-mono text-blue-600 mt-1">{summary ? formatNumber(summary.reservedForOrders) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">Held for open orders</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Attention Required</span>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1">{summary ? formatNumber(summary.attentionRequired) : "—"}</div>
          <span className="text-xs text-slate-500 mt-1 block">{summary ? `${summary.outOfStock} out · ${summary.criticalStock} critical` : "Below safety threshold"}</span>
        </div>
      </div>
      {summaryQuery.isError && <p className="text-xs text-rose-600">Couldn't load inventory totals. <button className="underline" onClick={() => summaryQuery.refetch()}>Retry</button></p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="max-w-md w-full">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by SKU, garment title, color..." />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {FILTERS.map((f) => <button key={f.id} onClick={() => { setFilter(f.id); setPage(1); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${filter === f.id ? "bg-[#00130d] text-white shadow-2xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{f.label}</button>)}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={6} /></div> : items.length === 0 ? <div className="p-12">
            <EmptyState
    title={filtersActive ? "No Inventory Records Match" : "No SKUs Yet"}
    description={filtersActive ? "No SKUs currently match the search query or active filter." : "SKUs appear here once products have colour variants and sizes."}
    action={filtersActive ? <button onClick={resetFilters} className="px-4 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg">Clear Filters</button> : null}
  />
          </div> : <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">SKU Code</th>
                  <th className="py-3 px-4">Garment Title</th>
                  <th className="py-3 px-4">Color &amp; Size</th>
                  <th className="py-3 px-4 text-center">On-Hand</th>
                  <th className="py-3 px-4 text-center">Reserved</th>
                  <th className="py-3 px-4 text-center">Available to Sell</th>
                  <th className="py-3 px-4 text-center">Threshold</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {items.map((item) => <tr key={item.sku} className={`hover:bg-slate-50/70 transition-colors ${!item.isEnabled ? "opacity-60" : ""}`}>
                    <td className="py-3.5 px-4"><span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">{item.sku}</span></td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{item.product?.name || "—"}</div>
                      {!item.isEnabled && <div className="text-[11px] text-slate-400">SKU disabled</div>}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-700">{item.variant?.colorName || item.variant?.variantCode}</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-800">{item.size}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-slate-600">{item.stock}</td>
                    <td className="py-3.5 px-4 text-center font-mono text-blue-600">{item.reservedStock}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`font-mono font-bold px-2 py-0.5 rounded ${item.stockStatus === "out" || item.available <= 0 ? "bg-rose-50 text-rose-700 font-extrabold" : item.stockStatus === "low" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-800"}`}>{item.available}</span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-slate-400">{item.lowStockThreshold ?? "—"}</td>
                    <td className="py-3.5 px-4"><StatusBadge status={statusLabel[item.stockStatus] || humanize(item.stockStatus)} /></td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button onClick={() => { setHistorySku(item.sku); setHistoryPage(1); }} title="Stock history" className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"><History className="w-4 h-4" /></button>
                        {canManage && <button onClick={() => openAdjust(item)} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-[#00130d] hover:text-white text-slate-700 text-xs font-semibold rounded-lg transition-colors"><RefreshCw className="w-3 h-3" />Reconcile</button>}
                      </div>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>}
        {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="SKU" labelPlural="SKUs" />}
        {listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
      </div>

      <Modal
    isOpen={Boolean(selected)}
    onClose={() => !adjustMutation.isPending && setSelected(null)}
    title={selected ? `Adjust Stock: ${selected.sku}` : "Stock Adjustment"}
    subtitle={selected ? `${selected.product?.name} (${selected.variant?.colorName} - ${selected.size})` : ""}
    maxWidth="max-w-md"
  >
        {selected && <form onSubmit={submit} className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-3 gap-2 text-center text-xs">
              <div><span className="text-[10px] text-slate-400 block">On-Hand</span><span className="font-mono font-bold text-slate-800">{selected.stock}</span></div>
              <div><span className="text-[10px] text-slate-400 block">Reserved</span><span className="font-mono font-bold text-blue-600">{selected.reservedStock}</span></div>
              <div><span className="text-[10px] text-slate-400 block">Available</span><span className="font-mono font-bold text-emerald-700">{selected.available}</span></div>
            </div>
            {formErr.general && <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-xs text-rose-700 font-medium" role="alert">{formErr.general}</div>}

            <FormField label="Adjustment Vector (Add or Deduct)" error={formErr.fields.direction}>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setDirection("add")} className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold border transition-colors ${direction === "add" ? "bg-emerald-50 border-emerald-500 text-emerald-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}><Plus className="w-4 h-4 text-emerald-600" />Add Stock (+)</button>
                <button type="button" disabled={reasonMeta?.addOnly} onClick={() => setDirection("remove")} className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${direction === "remove" ? "bg-rose-50 border-rose-500 text-rose-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}><Minus className="w-4 h-4 text-rose-600" />Deduct Stock (–)</button>
              </div>
            </FormField>

            <FormField label="Quantity (Units)" required error={formErr.fields.quantity} hint={direction === "remove" ? `Up to ${selected.available} available units` : undefined}>
              <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${field} font-mono font-bold`} />
            </FormField>

            <FormField label="Adjustment Reason / Audit Trail" required error={formErr.fields.reason}>
              <select value={reason} onChange={(e) => onReason(e.target.value)} className={`${field} font-medium`}>
                {ADJUST_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </FormField>

            <FormField label="Reference" hint="Optional — batch, count sheet or order reference" error={formErr.fields.reference}>
              <input type="text" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} className={field} />
            </FormField>
            <FormField label="Notes" error={formErr.fields.notes}>
              <textarea rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${field} resize-none`} />
            </FormField>

            <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
              <button type="button" disabled={adjustMutation.isPending} onClick={() => setSelected(null)} className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800">Cancel</button>
              <button type="submit" disabled={adjustMutation.isPending} className="px-4 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60 inline-flex items-center gap-1.5">
                {adjustMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save Adjustment
              </button>
            </div>
          </form>}
      </Modal>

      <Drawer isOpen={Boolean(historySku)} onClose={() => setHistorySku(null)} title={`Stock history: ${historySku || ""}`} subtitle="Every receipt, adjustment, reservation and sale for this SKU">
        {historyQuery.isLoading ? <LoadingSkeleton rows={5} /> : historyQuery.isError ? <ErrorState error={historyQuery.error} onRetry={() => historyQuery.refetch()} /> : (historyQuery.data?.items || []).length === 0 ? <EmptyState title="No movements yet" description="Stock movements for this SKU will be listed here." /> : <div className="space-y-3">
            {historyQuery.data.items.map((t) => <div key={t._id} className="p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{humanize(t.type)}</span>
                  <span className={`font-mono font-bold ${t.quantity < 0 ? "text-rose-600" : "text-emerald-700"}`}>{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</span>
                </div>
                <div className="text-slate-500">{t.previousStock} → <span className="font-mono font-semibold text-slate-800">{t.newStock}</span> on hand</div>
                {t.reason && <div className="text-slate-700">{t.reason}</div>}
                {t.notes && <div className="text-slate-500">{t.notes}</div>}
                {t.reference && <div className="font-mono text-[10px] text-slate-400">Ref: {t.reference}</div>}
                <div className="text-[11px] text-slate-400">{formatDateTime(t.createdAt)}{t.createdBy?.name ? ` · ${t.createdBy.name}` : ""}</div>
              </div>)}
            {historyQuery.data.meta && historyQuery.data.meta.totalPages > 1 && <div className="flex items-center justify-between text-xs pt-2">
                <button disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Newer</button>
                <span className="text-slate-500">Page {historyQuery.data.meta.page} of {historyQuery.data.meta.totalPages}</span>
                <button disabled={historyPage >= historyQuery.data.meta.totalPages} onClick={() => setHistoryPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Older</button>
              </div>}
          </div>}
      </Drawer>
    </div>;
};
