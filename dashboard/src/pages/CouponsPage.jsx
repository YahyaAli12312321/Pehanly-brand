import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Copy, Loader2 } from "lucide-react";
import { couponsApi } from "../services/couponsApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { splitFormError } from "../lib/formErrors";
import { formatDate, formatMoney, formatNumber, isoToDateInput } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { SearchInput } from "../components/common/SearchInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { Pagination } from "../components/common/Pagination";
import { Modal } from "../components/common/Modal";
import { FormField } from "../components/common/FormField";
import { Toggle } from "../components/common/Toggle";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";

const sel = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";
const inp = "w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#00130d] outline-none";
const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50";
const CODE_RE = /^[A-Za-z0-9_-]+$/;

const lifecycle = (c) => {
  const now = Date.now();
  if (!c.isActive) return "inactive";
  if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return "expired";
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return "scheduled";
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) return "exhausted";
  return "active";
};

const CouponEditor = ({ coupon, onClose }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const isEdit = Boolean(coupon);
  const [f, setF] = useState(() => ({
    code: coupon?.code || "", name: coupon?.name || "", description: coupon?.description || "", discountType: coupon?.discountType || "percentage", discountValue: coupon?.discountValue ?? "",
    minimumOrderAmount: coupon?.minimumOrderAmount ?? 0, maximumDiscountAmount: coupon?.maximumDiscountAmount ?? "", startsAt: coupon?.startsAt ? isoToDateInput(coupon.startsAt) : "", expiresAt: coupon?.expiresAt ? isoToDateInput(coupon.expiresAt) : "",
    discountValueUSD: coupon?.discountValueUSD ?? "", minimumOrderAmountUSD: coupon?.minimumOrderAmountUSD ?? "", maximumDiscountAmountUSD: coupon?.maximumDiscountAmountUSD ?? "",
    usageLimit: coupon?.usageLimit ?? "", usageLimitPerCustomer: coupon ? (coupon.usageLimitPerCustomer ?? "") : 1, isActive: coupon?.isActive ?? true,
  }));
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: (b) => (isEdit ? couponsApi.update(coupon._id, b) : couponsApi.create(b)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.coupons.all }); addToast(isEdit ? "Coupon updated." : "Coupon created."); onClose(); },
    onError: (err) => { const { fields, general: g } = splitFormError(err, "Could not save the coupon"); setErrors(fields); setGeneral(g); },
  });
  const submit = () => {
    const e = {};
    const val = Number(f.discountValue);
    if (f.code.trim().length < 2 || !CODE_RE.test(f.code.trim())) e.code = "2–60 characters: letters, numbers, - and _ only.";
    if (f.name.trim().length < 2) e.name = "Name must be at least 2 characters.";
    if (!(val > 0)) e.discountValue = "Enter a value greater than zero.";
    else if (f.discountType === "percentage" && val > 100) e.discountValue = "A percentage cannot exceed 100.";
    if (Number(f.minimumOrderAmount) < 0) e.minimumOrderAmount = "Must be zero or more.";
    if (f.maximumDiscountAmount !== "" && Number(f.maximumDiscountAmount) < 0) e.maximumDiscountAmount = "Must be zero or more.";
    if (f.discountValueUSD !== "" && !(Number(f.discountValueUSD) > 0)) e.discountValueUSD = "Enter a value greater than zero, or leave empty.";
    if (f.discountType === "percentage" && f.discountValueUSD !== "") e.discountValueUSD = "Percentage coupons use the same percentage in USD — leave this empty.";
    if (f.minimumOrderAmountUSD !== "" && Number(f.minimumOrderAmountUSD) < 0) e.minimumOrderAmountUSD = "Must be zero or more.";
    if (f.maximumDiscountAmountUSD !== "" && Number(f.maximumDiscountAmountUSD) < 0) e.maximumDiscountAmountUSD = "Must be zero or more.";
    if (f.usageLimit !== "" && (!Number.isInteger(Number(f.usageLimit)) || Number(f.usageLimit) < 1)) e.usageLimit = "Whole number of 1 or more, or leave empty for unlimited.";
    if (isEdit && f.usageLimit !== "" && Number(f.usageLimit) < coupon.usedCount) e.usageLimit = `Cannot be lower than the ${coupon.usedCount} redemptions already used.`;
    if (f.usageLimitPerCustomer !== "" && (!Number.isInteger(Number(f.usageLimitPerCustomer)) || Number(f.usageLimitPerCustomer) < 1)) e.usageLimitPerCustomer = "Whole number of 1 or more, or leave empty for unlimited.";
    if (f.startsAt && f.expiresAt && f.expiresAt <= f.startsAt) e.expiresAt = "Expiry must be after the start date.";
    setErrors(e); setGeneral("");
    if (Object.keys(e).length) return;
    save.mutate({
      code: f.code.trim().toUpperCase(), name: f.name.trim(), description: f.description.trim(), discountType: f.discountType, discountValue: val,
      minimumOrderAmount: Number(f.minimumOrderAmount) || 0, maximumDiscountAmount: f.maximumDiscountAmount === "" ? null : Number(f.maximumDiscountAmount),
      // Empty USD terms are sent as null so clearing a field really clears it.
      discountValueUSD: f.discountType === "fixed" && f.discountValueUSD !== "" ? Number(f.discountValueUSD) : null,
      minimumOrderAmountUSD: f.minimumOrderAmountUSD === "" ? null : Number(f.minimumOrderAmountUSD),
      maximumDiscountAmountUSD: f.maximumDiscountAmountUSD === "" ? null : Number(f.maximumDiscountAmountUSD),
      startsAt: f.startsAt ? new Date(`${f.startsAt}T00:00:00`).toISOString() : null, expiresAt: f.expiresAt ? new Date(`${f.expiresAt}T23:59:59`).toISOString() : null,
      usageLimit: f.usageLimit === "" ? null : Number(f.usageLimit), usageLimitPerCustomer: f.usageLimitPerCustomer === "" ? null : Number(f.usageLimitPerCustomer), isActive: f.isActive,
    });
  };
  return <Modal isOpen onClose={() => !save.isPending && onClose()} title={isEdit ? `Edit coupon · ${coupon.code}` : "New coupon"} maxWidth="lg">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Code" required error={errors.code}><input className={`${inp} uppercase font-mono`} maxLength={60} value={f.code} onChange={set("code")} /></FormField>
          <FormField label="Name" required error={errors.name}><input className={inp} maxLength={160} value={f.name} onChange={set("name")} /></FormField>
        </div>
        <FormField label="Description" error={errors.description}><textarea rows={2} maxLength={1000} className={inp} value={f.description} onChange={set("description")} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Benefit type" required><select className={inp} value={f.discountType} onChange={set("discountType")}><option value="percentage">Percentage off</option><option value="fixed">Fixed amount off (PKR)</option></select></FormField>
          <FormField label={f.discountType === "percentage" ? "Discount (%)" : "Discount (PKR)"} required error={errors.discountValue}><input type="number" min={0} step="0.01" className={inp} value={f.discountValue} onChange={set("discountValue")} /></FormField>
          <FormField label="Minimum order (PKR)" error={errors.minimumOrderAmount}><input type="number" min={0} className={inp} value={f.minimumOrderAmount} onChange={set("minimumOrderAmount")} /></FormField>
          <FormField label="Maximum discount (PKR)" error={errors.maximumDiscountAmount} hint="Leave empty for no cap."><input type="number" min={0} className={inp} value={f.maximumDiscountAmount} onChange={set("maximumDiscountAmount")} /></FormField>
          <div className="col-span-2 rounded-lg border border-sky-100 bg-sky-50/60 p-3 space-y-3">
            <p className="text-[11px] text-sky-900 leading-relaxed"><strong>USD orders (optional).</strong> USD amounts are never converted from PKR. A coupon only works on USD orders if it has the USD terms it needs: a fixed coupon needs a USD discount; a coupon with a PKR minimum needs a USD minimum; one with a PKR cap needs a USD cap. Leave empty to keep this coupon PKR-only.</p>
            <div className="grid grid-cols-3 gap-3">
              {f.discountType === "fixed" && <FormField label="Discount (USD)" error={errors.discountValueUSD}><input type="number" min={0} step="0.01" className={inp} value={f.discountValueUSD} onChange={set("discountValueUSD")} /></FormField>}
              <FormField label="Minimum order (USD)" error={errors.minimumOrderAmountUSD}><input type="number" min={0} step="0.01" className={inp} value={f.minimumOrderAmountUSD} onChange={set("minimumOrderAmountUSD")} /></FormField>
              <FormField label="Maximum discount (USD)" error={errors.maximumDiscountAmountUSD}><input type="number" min={0} step="0.01" className={inp} value={f.maximumDiscountAmountUSD} onChange={set("maximumDiscountAmountUSD")} /></FormField>
            </div>
          </div>
          <FormField label="Starts" error={errors.startsAt}><input type="date" className={inp} value={f.startsAt} onChange={set("startsAt")} /></FormField>
          <FormField label="Expires" error={errors.expiresAt}><input type="date" className={inp} value={f.expiresAt} min={f.startsAt || undefined} onChange={set("expiresAt")} /></FormField>
          <FormField label="Total redemptions allowed" error={errors.usageLimit} hint="Empty = unlimited."><input type="number" min={1} className={inp} value={f.usageLimit} onChange={set("usageLimit")} /></FormField>
          <FormField label="Per customer" error={errors.usageLimitPerCustomer} hint="Empty = unlimited."><input type="number" min={1} className={inp} value={f.usageLimitPerCustomer} onChange={set("usageLimitPerCustomer")} /></FormField>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Toggle checked={f.isActive} onChange={(v) => setF((s) => ({ ...s, isActive: v }))} /> Active at checkout</label>
        {general && <p className="text-xs text-rose-600">{general}</p>}
        <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={onClose} disabled={save.isPending}>Cancel</button><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create coupon"}</button></div>
      </div>
    </Modal>;
};

const useCount = (extra) => useQuery({ queryKey: [...keys.coupons.all, "count", extra ?? "all"], queryFn: async () => (await couponsApi.list({ isActive: extra, limit: 1 })).meta.total });

export const CouponsPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { can } = useAuth();
  const canManage = can("coupons.manage");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [active, setActive] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editor, setEditor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const dq = useDebouncedValue(search, 350);

  const params = { search: dq.trim() || undefined, discountType: type === "all" ? undefined : type, isActive: active === "all" ? undefined : active, page, limit: pageSize };
  const listQuery = useQuery({ queryKey: keys.coupons.list(params), queryFn: () => couponsApi.list(params), placeholderData: keepPreviousData });
  const total = useCount(undefined), activeCount = useCount("true"), inactiveCount = useCount("false");
  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const pageRedemptions = items.reduce((s, c) => s + (c.usedCount || 0), 0);

  const toggle = useMutation({ mutationFn: ({ id, isActive }) => couponsApi.setActive(id, isActive), onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.coupons.all }); addToast("Coupon status updated."); }, onError: (e) => addToast(errorMessage(e, "Could not update the coupon"), "error") });
  const remove = useMutation({ mutationFn: (id) => couponsApi.remove(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.coupons.all }); addToast("Coupon deleted."); setRemoving(null); }, onError: (e) => { setRemoving(null); addToast(errorMessage(e, "Could not delete the coupon"), "error"); } });
  const copy = async (code) => { try { await navigator.clipboard.writeText(code); addToast(`Copied ${code}`, "info"); } catch { addToast("Copy is not available in this browser.", "error"); } };
  const reset = (setter) => (v) => { setter(v); setPage(1); };
  const filtersActive = dq || type !== "all" || active !== "all";
  const stat = (label, v, c, hint) => <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span><div className={`text-2xl font-bold font-mono mt-1 ${c}`}>{v == null ? "—" : formatNumber(v)}</div><span className="text-xs text-slate-500 mt-1 block">{hint}</span></div>;

  return <div className="space-y-6">
      <PageHeader breadcrumb={[{ label: "Marketing" }, { label: "Coupons & Offers" }]} title="Promotions & Discount Codes" description="Checkout coupon codes with percentage or fixed discounts, validity windows and usage limits."
        actions={canManage && <button onClick={() => setEditor({ coupon: null })} className="inline-flex items-center gap-2 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold uppercase tracking-wider rounded-lg shadow-sm hover:bg-[#1a2634] transition-colors"><Plus className="w-4 h-4" />New Coupon</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stat("Total Coupons", total.data, "text-slate-900", "All codes created")}
        {stat("Enabled Codes", activeCount.data, "text-emerald-800", "Switched on (check validity dates)")}
        {stat("Disabled Codes", inactiveCount.data, "text-slate-500", "Switched off")}
        {stat("Redemptions (this page)", listQuery.isSuccess ? pageRedemptions : undefined, "text-purple-600", "Sum of the codes listed below")}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="max-w-md w-full"><SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by code, name or description..." /></div>
        <div className="flex items-center gap-2">
          <select value={type} onChange={(e) => reset(setType)(e.target.value)} className={sel}><option value="all">All Types</option><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select>
          <select value={active} onChange={(e) => reset(setActive)(e.target.value)} className={sel}><option value="all">All Codes</option><option value="true">Enabled</option><option value="false">Disabled</option></select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={6} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title={filtersActive ? "No Coupons Match" : "No Coupons Yet"} description={filtersActive ? "No coupons match the filters." : "Create a code to offer customers a discount at checkout."} /></div> : <div className="overflow-x-auto"><table className="w-full text-left border-collapse">
            <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-3 px-4">Coupon Code</th><th className="py-3 px-4">Benefit Type</th><th className="py-3 px-4">Discount Value</th><th className="py-3 px-4 text-center">Min Order (PKR)</th><th className="py-3 px-4 text-center">Redemptions</th><th className="py-3 px-4">Valid Until</th><th className="py-3 px-4">Status</th><th className="py-3 px-4">Enabled</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100 text-xs">{items.map((c) => <tr key={c._id} className="hover:bg-slate-50/70">
                <td className="py-3.5 px-4"><div className="flex items-center gap-2"><span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{c.code}</span><button onClick={() => copy(c.code)} className="text-slate-400 hover:text-slate-700" title="Copy code"><Copy className="w-3.5 h-3.5" /></button></div><div className="text-[11px] text-slate-500 mt-0.5">{c.name}</div></td>
                <td className="py-3.5 px-4 text-slate-700">{c.discountType === "percentage" ? "Percentage" : "Fixed amount"}</td>
                <td className="py-3.5 px-4 font-mono font-bold">{c.discountType === "percentage" ? `${c.discountValue}%` : formatMoney(c.discountValue)}{c.maximumDiscountAmount != null && <div className="text-[10px] font-normal text-slate-400">max {formatMoney(c.maximumDiscountAmount)}</div>}</td>
                <td className="py-3.5 px-4 text-center font-mono">{formatNumber(c.minimumOrderAmount)}</td>
                <td className="py-3.5 px-4 text-center font-mono">{formatNumber(c.usedCount)}{c.usageLimit != null ? ` / ${formatNumber(c.usageLimit)}` : " / ∞"}</td>
                <td className="py-3.5 px-4 text-slate-600">{c.expiresAt ? formatDate(c.expiresAt) : "No expiry"}</td>
                <td className="py-3.5 px-4"><StatusBadge status={lifecycle(c)} /></td>
                <td className="py-3.5 px-4"><Toggle checked={c.isActive} disabled={!canManage || toggle.isPending} onChange={(v) => toggle.mutate({ id: c._id, isActive: v })} /></td>
                <td className="py-3.5 px-4 text-right">{canManage && <div className="inline-flex gap-1"><button onClick={() => setEditor({ coupon: c })} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title="Edit"><Pencil className="w-4 h-4" /></button><button onClick={() => setRemoving(c)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button></div>}</td>
              </tr>)}</tbody></table></div>}
        {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="coupon" labelPlural="coupons" />}
        {listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
      </div>

      {editor && <CouponEditor key={editor.coupon?._id || "new"} coupon={editor.coupon} onClose={() => setEditor(null)} />}
      <ConfirmDialog isOpen={Boolean(removing)} onClose={() => !remove.isPending && setRemoving(null)} onConfirm={() => remove.mutate(removing._id)} isLoading={remove.isPending} title="Delete coupon" message={`Delete ${removing?.code}? Coupons that have already been redeemed cannot be deleted — disable them instead.`} confirmLabel="Delete" isDestructive />
    </div>;
};
