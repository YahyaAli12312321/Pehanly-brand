import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, Eye, Mail, Phone, Loader2 } from "lucide-react";
import { quotesApi, QUOTE_STATUSES, QUOTE_SOURCES } from "../services/quotesApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useUIStore } from "../store/uiStore";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { splitFormError } from "../lib/formErrors";
import { formatDate, formatDateTime, formatMoney, formatNumber, humanize, isoToDateInput } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { SearchInput } from "../components/common/SearchInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { Pagination } from "../components/common/Pagination";
import { Drawer } from "../components/common/Drawer";
import { Modal } from "../components/common/Modal";
import { FormField } from "../components/common/FormField";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";

const sel = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";
const inp = "w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#00130d] outline-none";
const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50";
const SOURCE_LABEL = { wholesale: "Wholesale", manufacturing: "Manufacturing", printing: "Printing & Branding" };
const requestOf = (q) => q.wholesaleRequest || q.manufacturingRequest || q.printingRequest;
const units = (q) => (q.items || []).reduce((s, i) => s + (i.quantity || 0), 0);

export const QuotesPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const setNewQuoteModalOpen = useUIStore((s) => s.setNewQuoteModalOpen);
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const { can } = useAuth();
  const canManage = can("quotes.manage");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeId, setActiveId] = useState(routeId || null);
  const [dialog, setDialog] = useState(null); // 'edit' | 'send' | 'convert'
  const dq = useDebouncedValue(search, 350);
  useEffect(() => { if (routeId) setActiveId(routeId); }, [routeId]);

  const params = { search: dq.trim() || undefined, status: status === "all" ? undefined : status, sourceType: source === "all" ? undefined : source, page, limit: pageSize };
  const listQuery = useQuery({ queryKey: keys.quotes.list(params), queryFn: () => quotesApi.list(params), placeholderData: keepPreviousData });
  const detailQuery = useQuery({ queryKey: keys.quotes.detail(activeId), queryFn: () => quotesApi.get(activeId), enabled: !!activeId });
  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const stats = listQuery.data?.stats;
  const q = detailQuery.data;

  const refreshAll = () => { for (const k of ["quotes", "wholesale", "manufacturing", "printing", "orders", "dashboard"]) queryClient.invalidateQueries({ queryKey: [k] }); };

  /* edit draft */
  const [edit, setEdit] = useState({});
  const [editErr, setEditErr] = useState({});
  const [editGeneral, setEditGeneral] = useState("");
  const openEdit = () => { setEdit({ discount: q.pricing.discount, shipping: q.pricing.shipping, additionalCharges: q.pricing.additionalCharges, validUntil: q.validUntil ? isoToDateInput(q.validUntil) : "", adminNotes: q.adminNotes || "", terms: q.terms || "" }); setEditErr({}); setEditGeneral(""); setDialog("edit"); };
  const editM = useMutation({
    mutationFn: (b) => quotesApi.update(activeId, b),
    onSuccess: () => { refreshAll(); addToast("Quote updated."); setDialog(null); },
    onError: (err) => { const { fields, general } = splitFormError(err, "Could not update the quote"); setEditErr(fields); setEditGeneral(general); },
  });
  const submitEdit = () => {
    const e = {};
    for (const k of ["discount", "shipping", "additionalCharges"]) if (edit[k] === "" || Number(edit[k]) < 0 || Number.isNaN(Number(edit[k]))) e[k] = "Must be zero or more.";
    setEditErr(e); setEditGeneral("");
    if (Object.keys(e).length) return;
    editM.mutate({ discount: Number(edit.discount), shipping: Number(edit.shipping), additionalCharges: Number(edit.additionalCharges), validUntil: edit.validUntil ? new Date(`${edit.validUntil}T23:59:59`).toISOString() : null, adminNotes: edit.adminNotes.trim(), terms: edit.terms.trim() });
  };

  /* send */
  const sendM = useMutation({ mutationFn: () => quotesApi.send(activeId), onSuccess: () => { refreshAll(); addToast("Quote sent to the customer."); setDialog(null); }, onError: (e) => { setDialog(null); addToast(errorMessage(e, "Could not send the quote"), "error"); } });

  /* convert */
  const [addr, setAddr] = useState({});
  const [addrErr, setAddrErr] = useState({});
  const [addrGeneral, setAddrGeneral] = useState("");
  const openConvert = () => { setAddr({ fullName: q.customer?.name || "", phone: q.customer?.phone || "", addressLine1: "", addressLine2: "", city: "", province: "", postalCode: "", country: "Pakistan" }); setAddrErr({}); setAddrGeneral(""); setDialog("convert"); };
  const convertM = useMutation({
    mutationFn: (a) => quotesApi.convertToOrder(activeId, a),
    onSuccess: (res) => { refreshAll(); addToast(`Order ${res?.order?.orderNumber || res?.orderNumber || ""} created from the quote.`.replace("  ", " ")); setDialog(null); },
    onError: (err) => { const { fields, general } = splitFormError(err, "Could not convert the quote"); const flat = {}; for (const [k, v] of Object.entries(fields)) flat[k.replace(/^shippingAddress\./, "")] = v; setAddrErr(flat); setAddrGeneral(general); },
  });
  const submitConvert = () => {
    const e = {};
    if (!addr.fullName.trim()) e.fullName = "Required."; if (!addr.phone.trim()) e.phone = "Required."; if (!addr.addressLine1.trim()) e.addressLine1 = "Required."; if (!addr.city.trim()) e.city = "Required."; if (!addr.country.trim()) e.country = "Required.";
    setAddrErr(e); setAddrGeneral("");
    if (Object.keys(e).length) return;
    const body = {}; for (const [k, v] of Object.entries(addr)) if (v.trim()) body[k] = v.trim();
    convertM.mutate(body);
  };

  const open = (id) => { setActiveId(id); if (routeId !== id) navigate(`/quotes/${id}`); };
  const close = () => { setActiveId(null); setDialog(null); if (routeId) navigate("/quotes"); };
  const reset = (setter) => (v) => { setter(v); setPage(1); };
  const filtersActive = dq || status !== "all" || source !== "all";
  const setA = (k) => (e) => setAddr((s) => ({ ...s, [k]: e.target.value }));
  const setE = (k) => (e) => setEdit((s) => ({ ...s, [k]: e.target.value }));
  const req = q && requestOf(q);

  return <div className="space-y-6">
      <PageHeader breadcrumb={[{ label: "Commerce" }, { label: "Quotes" }]} title="B2B Quotations & RFQ Proposals"
        description="Quotations built from approved wholesale, manufacturing and printing requests. Customers accept or reject; accepted quotes are converted to orders here."
        actions={canManage && <button onClick={() => setNewQuoteModalOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold uppercase tracking-wider rounded-lg shadow-sm hover:bg-[#1a2634] transition-colors"><Plus className="w-4 h-4" />Formulate New Quote</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[["Total Formulated", stats?.totalFormulated, "text-slate-900", "Quotes created", false], ["Active Proposals", stats?.activeProposals, "text-amber-600", "Sent, awaiting customer", false], ["Converted Orders", stats?.convertedOrders, "text-emerald-800", "Quotes turned into orders", false], ["Pipeline Value", stats?.pipelineValue, "text-blue-600", "Value of open proposals", true]].map(([label, v, c, hint, money]) => <div key={label} className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span><div className={`text-2xl font-bold font-mono mt-1 ${c}`}>{v == null ? "—" : money ? formatMoney(v, { compact: true }) : formatNumber(v)}</div><span className="text-xs text-slate-500 mt-1 block">{hint}</span></div>)}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="max-w-md w-full"><SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by quote #, client, organization, email..." /></div>
        <div className="flex items-center gap-2">
          <select value={source} onChange={(e) => reset(setSource)(e.target.value)} className={sel}><option value="all">All Sources</option>{QUOTE_SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</select>
          <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={sel}><option value="all">All Statuses</option>{QUOTE_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={6} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title={filtersActive ? "No Quotes Match" : "No Quotes Yet"} description={filtersActive ? "No quotes match the filters." : "Approve a wholesale, manufacturing or printing request, then create its quote."} /></div> : <div className="overflow-x-auto"><table className="w-full text-left border-collapse">
            <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-3 px-4">Quote # & Date</th><th className="py-3 px-4">Client & Organization</th><th className="py-3 px-4">Source Stream</th><th className="py-3 px-4">Validity</th><th className="py-3 px-4 text-center">Volume</th><th className="py-3 px-4 text-right">Grand Total (PKR)</th><th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100 text-xs">{items.map((x) => <tr key={x._id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => open(x._id)}>
                <td className="py-3.5 px-4"><span className="font-mono font-bold text-slate-900">{x.quoteNumber}</span><div className="text-[10px] text-slate-400 mt-0.5">{formatDate(x.createdAt)}</div></td>
                <td className="py-3.5 px-4"><div className="font-semibold text-slate-900">{x.customer?.businessName || x.customer?.name}</div><div className="text-slate-500 text-[11px]">{x.customer?.name}</div></td>
                <td className="py-3.5 px-4"><span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-700">{SOURCE_LABEL[x.sourceType] || humanize(x.sourceType)}</span></td>
                <td className="py-3.5 px-4 text-slate-600">{x.validUntil ? formatDate(x.validUntil) : "No expiry"}</td>
                <td className="py-3.5 px-4 text-center font-mono font-bold">{formatNumber(units(x))}</td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">{formatMoney(x.pricing?.total)}</td>
                <td className="py-3.5 px-4"><StatusBadge status={x.status} /></td>
                <td className="py-3.5 px-4 text-right"><button onClick={(e) => { e.stopPropagation(); open(x._id); }} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title="View quote"><Eye className="w-4 h-4" /></button></td>
              </tr>)}</tbody></table></div>}
        {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="quote" labelPlural="quotes" />}
        {listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
      </div>

      <Drawer isOpen={Boolean(activeId)} onClose={close} title={q ? `Quote ${q.quoteNumber}` : "Quote"} subtitle={q ? `${SOURCE_LABEL[q.sourceType] || ""} • ${q.customer?.businessName || q.customer?.name || ""}` : ""} badge={q && <StatusBadge status={q.status} />}
        headerActions={q && canManage && <div className="flex items-center gap-1.5">
          {q.status === "draft" && <><button className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={openEdit}>Edit charges</button><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={() => setDialog("send")}>Send to customer</button></>}
          {q.status === "accepted" && <button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={openConvert}>Convert to order</button>}
        </div>}>
        {detailQuery.isLoading ? <LoadingSkeleton rows={5} /> : detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} /> : q && <div className="space-y-5 text-xs">
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2"><h5 className="font-bold text-slate-900">Client</h5><p className="font-semibold">{q.customer?.name}{q.customer?.businessName ? ` · ${q.customer.businessName}` : ""}</p><div className="flex items-center gap-2 text-slate-500"><Mail className="w-3.5 h-3.5" />{q.customer?.email}</div><div className="flex items-center gap-2 text-slate-500"><Phone className="w-3.5 h-3.5" />{q.customer?.phone}</div>{q.customer?.taxNtn && <div className="text-slate-500 font-mono">NTN {q.customer.taxNtn}</div>}</div>
            <div className="border border-slate-200 rounded-xl overflow-hidden"><div className="px-4 py-2 bg-slate-50 text-[10px] uppercase tracking-wider font-bold text-slate-500">Line items</div><ul className="divide-y divide-slate-100">{q.items.map((i) => <li key={i._id} className="px-4 py-3 flex justify-between gap-3"><div><div className="font-semibold">{i.productName}</div><div className="text-slate-500">{[i.colorName, i.size, i.skuCode, i.manufacturingVariantName, i.printingServiceName].filter(Boolean).join(" · ")}</div>{i.description && <div className="text-slate-400 mt-0.5 line-clamp-2">{i.description}</div>}</div><div className="text-right font-mono"><div>{formatNumber(i.quantity)} × {formatMoney(i.unitPrice)}</div><div className="font-bold">{formatMoney(i.lineTotal)}</div></div></li>)}</ul></div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 font-mono">
              <div className="flex justify-between"><span className="text-slate-500 font-sans">Subtotal</span><span>{formatMoney(q.pricing.subtotal)}</span></div>
              {q.pricing.discount > 0 && <div className="flex justify-between"><span className="text-slate-500 font-sans">Discount</span><span>− {formatMoney(q.pricing.discount)}</span></div>}
              {q.pricing.shipping > 0 && <div className="flex justify-between"><span className="text-slate-500 font-sans">Shipping</span><span>{formatMoney(q.pricing.shipping)}</span></div>}
              {q.pricing.additionalCharges > 0 && <div className="flex justify-between"><span className="text-slate-500 font-sans">Additional charges</span><span>{formatMoney(q.pricing.additionalCharges)}</span></div>}
              <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-sm"><span className="font-sans">Grand total</span><span className="text-emerald-800">{formatMoney(q.pricing.total)}</span></div>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1.5">
              {req && <div className="flex justify-between"><span className="text-slate-500">Source request</span><span className="font-mono">{req.requestNumber}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">Valid until</span><span>{q.validUntil ? formatDate(q.validUntil) : "No expiry"}</span></div>
              {q.sentAt && <div className="flex justify-between"><span className="text-slate-500">Sent</span><span>{formatDateTime(q.sentAt)}</span></div>}
              {q.acceptedAt && <div className="flex justify-between"><span className="text-slate-500">Accepted</span><span>{formatDateTime(q.acceptedAt)}</span></div>}
              {q.rejectedAt && <div className="flex justify-between"><span className="text-slate-500">Rejected</span><span>{formatDateTime(q.rejectedAt)}</span></div>}
              {q.expiredAt && <div className="flex justify-between"><span className="text-slate-500">Expired</span><span>{formatDateTime(q.expiredAt)}</span></div>}
              {q.order && <div className="flex justify-between"><span className="text-slate-500">Order</span><Link to={`/orders/${q.order._id}`} className="font-mono text-emerald-700 hover:underline">{q.order.orderNumber}</Link></div>}
            </div>
            {q.customerNotes && <div className="p-4 bg-white border border-slate-200 rounded-xl"><h5 className="font-bold text-slate-900 mb-1">Customer notes</h5><p className="text-slate-600 whitespace-pre-wrap">{q.customerNotes}</p></div>}
            {q.terms && <div className="p-4 bg-white border border-slate-200 rounded-xl"><h5 className="font-bold text-slate-900 mb-1">Terms</h5><p className="text-slate-600 whitespace-pre-wrap">{q.terms}</p></div>}
            {q.adminNotes && <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl"><h5 className="font-bold text-slate-900 mb-1">Internal notes</h5><p className="text-slate-600 whitespace-pre-wrap">{q.adminNotes}</p></div>}
            {q.status === "sent" && <p className="text-slate-500">Waiting for the customer to accept or reject this quote.</p>}
            {q.auditTrail?.length > 0 && <div className="border border-slate-200 rounded-xl overflow-hidden"><div className="px-4 py-2 bg-slate-50 text-[10px] uppercase tracking-wider font-bold text-slate-500">History</div><ul className="divide-y divide-slate-100">{[...q.auditTrail].reverse().map((a) => <li key={a._id} className="px-4 py-2 flex justify-between gap-3"><span>{humanize(a.action)}{a.note ? ` — ${a.note}` : ""} <span className="text-slate-400">({a.actorType})</span></span><span className="text-slate-400 shrink-0">{formatDateTime(a.createdAt)}</span></li>)}</ul></div>}
          </div>}
      </Drawer>

      <Modal isOpen={dialog === "edit"} onClose={() => !editM.isPending && setDialog(null)} title="Edit draft quote" maxWidth="md">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Line prices are fixed by the source request. Only charges, validity and notes can change while the quote is a draft.</p>
          <div className="grid grid-cols-3 gap-3">{[["discount", "Discount"], ["shipping", "Shipping"], ["additionalCharges", "Extra charges"]].map(([k, l]) => <FormField key={k} label={l} error={editErr[k]}><input type="number" min={0} className={inp} value={edit[k] ?? ""} onChange={setE(k)} /></FormField>)}</div>
          <FormField label="Valid until" error={editErr.validUntil}><input type="date" className={inp} value={edit.validUntil || ""} onChange={setE("validUntil")} /></FormField>
          <FormField label="Internal notes" error={editErr.adminNotes}><textarea rows={2} maxLength={5000} className={inp} value={edit.adminNotes || ""} onChange={setE("adminNotes")} /></FormField>
          <FormField label="Terms" error={editErr.terms}><textarea rows={3} maxLength={10000} className={inp} value={edit.terms || ""} onChange={setE("terms")} /></FormField>
          {editGeneral && <p className="text-xs text-rose-600">{editGeneral}</p>}
          <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={() => setDialog(null)} disabled={editM.isPending}>Cancel</button><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={submitEdit} disabled={editM.isPending}>{editM.isPending ? "Saving…" : "Save changes"}</button></div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={dialog === "send"} onClose={() => !sendM.isPending && setDialog(null)} onConfirm={() => sendM.mutate()} isLoading={sendM.isPending} title="Send quote to customer" message={`Send quote ${q?.quoteNumber} (${q ? formatMoney(q.pricing.total) : ""}) to ${q?.customer?.email}? It can no longer be edited after sending.`} confirmLabel="Send quote" isDestructive={false} type="info" />

      <Modal isOpen={dialog === "convert"} onClose={() => !convertM.isPending && setDialog(null)} title="Convert quote to order" subtitle="Enter the delivery address for the new order." maxWidth="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Full name" required error={addrErr.fullName}><input className={inp} maxLength={120} value={addr.fullName || ""} onChange={setA("fullName")} /></FormField>
            <FormField label="Phone" required error={addrErr.phone}><input className={inp} maxLength={20} value={addr.phone || ""} onChange={setA("phone")} /></FormField>
          </div>
          <FormField label="Address line 1" required error={addrErr.addressLine1}><input className={inp} maxLength={250} value={addr.addressLine1 || ""} onChange={setA("addressLine1")} /></FormField>
          <FormField label="Address line 2" error={addrErr.addressLine2}><input className={inp} maxLength={250} value={addr.addressLine2 || ""} onChange={setA("addressLine2")} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="City" required error={addrErr.city}><input className={inp} maxLength={100} value={addr.city || ""} onChange={setA("city")} /></FormField>
            <FormField label="Province" error={addrErr.province}><input className={inp} maxLength={100} value={addr.province || ""} onChange={setA("province")} /></FormField>
            <FormField label="Postal code" error={addrErr.postalCode}><input className={inp} maxLength={30} value={addr.postalCode || ""} onChange={setA("postalCode")} /></FormField>
            <FormField label="Country" required error={addrErr.country}><input className={inp} maxLength={80} value={addr.country || ""} onChange={setA("country")} /></FormField>
          </div>
          {addrGeneral && <p className="text-xs text-rose-600">{addrGeneral}</p>}
          <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={() => setDialog(null)} disabled={convertM.isPending}>Cancel</button><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={submitConvert} disabled={convertM.isPending}>{convertM.isPending ? "Converting…" : "Create order"}</button></div>
        </div>
      </Modal>
    </div>;
};
