import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Mail, Phone, Eye, Pencil, Plus, Trash2, Loader2, FileImage } from "lucide-react";
import { printingApi, PRINT_STATUSES, GARMENT_SOURCES } from "../services/printingApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { splitFormError } from "../lib/formErrors";
import { formatDateTime, formatMoney, formatNumber, humanize } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { SearchInput } from "../components/common/SearchInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { Pagination } from "../components/common/Pagination";
import { Drawer } from "../components/common/Drawer";
import { Modal } from "../components/common/Modal";
import { FormField } from "../components/common/FormField";
import { Toggle } from "../components/common/Toggle";
import { ImageGalleryUpload } from "../components/common/ImageGalleryUpload";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { CreateQuoteModal } from "../components/quotes/CreateQuoteModal";

const sel = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";
const inp = "w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#00130d] outline-none";
const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* ------------------------------- Services tab ------------------------------ */
const ServiceEditor = ({ service, onClose }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const isEdit = Boolean(service);
  const [f, setF] = useState(() => ({ name: service?.name || "", slug: service?.slug || "", description: service?.description || "", isActive: service?.isActive ?? true, sortOrder: service?.sortOrder ?? 0, media: (service?.media || []).map((m) => ({ url: m.url, publicId: m.publicId, alt: m.alt })) }));
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = useMutation({
    mutationFn: (b) => (isEdit ? printingApi.updateService(service._id, b) : printingApi.createService(b)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.printing.all }); addToast(isEdit ? "Service updated." : "Service created."); onClose(); },
    onError: (err) => { const { fields, general: g } = splitFormError(err, "Could not save the service"); setErrors(fields); setGeneral(g); },
  });
  const submit = () => {
    const e = {};
    if (!f.name.trim()) e.name = "Name is required.";
    if (!SLUG_RE.test(f.slug)) e.slug = "Use lowercase letters, numbers and hyphens only.";
    if (Number(f.sortOrder) < 0) e.sortOrder = "Must be zero or more.";
    setErrors(e); setGeneral("");
    if (Object.keys(e).length) return;
    save.mutate({ name: f.name.trim(), slug: f.slug, ...(f.description.trim() ? { description: f.description.trim() } : {}), media: f.media.map((m, i) => ({ url: m.url, ...(m.publicId ? { publicId: m.publicId } : {}), ...(m.alt ? { alt: m.alt } : {}), sortOrder: i })), isActive: f.isActive, sortOrder: Number(f.sortOrder) || 0 });
  };
  return <Modal isOpen onClose={() => !save.isPending && onClose()} title={isEdit ? `Edit service · ${service.name}` : "New printing service"} maxWidth="md">
      <div className="space-y-3">
        <FormField label="Technique name" required error={errors.name}><input className={inp} maxLength={160} value={f.name} onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} /></FormField>
        <FormField label="Slug" required error={errors.slug}><input className={inp} maxLength={180} value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} /></FormField>
        <FormField label="Description" error={errors.description}><textarea rows={3} className={inp} maxLength={3000} value={f.description} onChange={(e) => set("description", e.target.value)} /></FormField>
        <FormField label="Sample images" error={errors.media}><ImageGalleryUpload purpose="product_image" max={20} value={f.media} onChange={(v) => set("media", v)} /></FormField>
        <div className="grid grid-cols-2 gap-3 items-end"><FormField label="Sort order" error={errors.sortOrder}><input type="number" min={0} className={inp} value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></FormField><label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Toggle checked={f.isActive} onChange={(v) => set("isActive", v)} /> Offered to customers</label></div>
        {general && <p className="text-xs text-rose-600">{general}</p>}
        <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={onClose} disabled={save.isPending}>Cancel</button><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</button></div>
      </div>
    </Modal>;
};

const ServicesTab = ({ canManage }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const dq = useDebouncedValue(search, 350);
  const params = { search: dq.trim() || undefined, page, limit: pageSize };
  const q = useQuery({ queryKey: keys.printing.services(params), queryFn: () => printingApi.listServices(params), placeholderData: keepPreviousData });
  const toggle = useMutation({ mutationFn: ({ id, isActive }) => printingApi.updateService(id, { isActive }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.printing.all }); addToast("Service updated."); }, onError: (e) => addToast(errorMessage(e, "Could not update"), "error") });
  const remove = useMutation({ mutationFn: (id) => printingApi.deleteService(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.printing.all }); addToast("Service deleted."); setRemoving(null); }, onError: (e) => { setRemoving(null); addToast(errorMessage(e, "Could not delete the service"), "error"); } });
  const items = q.data?.items || [];
  return <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100">
        <div className="max-w-md w-full"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search services..." /></div>
        {canManage && <button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={() => setEditor({ service: null })}><Plus className="w-3.5 h-3.5" />New service</button>}
      </div>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} className="border-0" /> : q.isLoading ? <div className="p-6"><LoadingSkeleton rows={4} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title="No Printing Services" description="Add the branding techniques customers can request." /></div> : <div className="overflow-x-auto"><table className="w-full text-left border-collapse">
          <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-3 px-4">Technique</th><th className="py-3 px-4">Description</th><th className="py-3 px-4 text-center">Order</th><th className="py-3 px-4">Active</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100 text-xs">{items.map((s) => <tr key={s._id} className="hover:bg-slate-50/70">
              <td className="py-3.5 px-4"><div className="flex items-center gap-3">{s.media?.[0]?.url && <img src={s.media[0].url} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200" />}<div><div className="font-semibold text-slate-900">{s.name}</div><div className="text-[10px] font-mono text-slate-400">{s.slug}</div></div></div></td>
              <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">{s.description || "—"}</td>
              <td className="py-3.5 px-4 text-center font-mono">{s.sortOrder}</td>
              <td className="py-3.5 px-4"><Toggle checked={s.isActive} disabled={!canManage || toggle.isPending} onChange={(v) => toggle.mutate({ id: s._id, isActive: v })} /></td>
              <td className="py-3.5 px-4 text-right">{canManage && <div className="inline-flex gap-1"><button onClick={() => setEditor({ service: s })} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title="Edit"><Pencil className="w-4 h-4" /></button><button onClick={() => setRemoving(s)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button></div>}</td>
            </tr>)}</tbody></table></div>}
      {q.data?.meta && items.length > 0 && <Pagination currentPage={q.data.meta.page} totalItems={q.data.meta.total} pageSize={q.data.meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="service" labelPlural="services" />}
      {editor && <ServiceEditor key={editor.service?._id || "new"} service={editor.service} onClose={() => setEditor(null)} />}
      <ConfirmDialog isOpen={Boolean(removing)} onClose={() => !remove.isPending && setRemoving(null)} onConfirm={() => remove.mutate(removing._id)} isLoading={remove.isPending} title="Delete printing service" message={`Delete "${removing?.name}"? Existing requests keep their snapshot, but customers can no longer choose it. Consider switching it off instead.`} confirmLabel="Delete" isDestructive />
    </div>;
};

/* ------------------------------ Requests tab ------------------------------- */
const useCount = (extra) => useQuery({ queryKey: [...keys.printing.all, "count", extra || "all"], queryFn: async () => (await printingApi.listRequests({ status: extra, limit: 1 })).meta.total });

export const PrintingPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const { can } = useAuth();
  const canManage = can("printing.manage");
  const canQuote = can("quotes.manage");

  const [tab, setTab] = useState("requests");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeId, setActiveId] = useState(routeId || null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [notesDialog, setNotesDialog] = useState(null); // 'approve' | 'reject'
  const [notes, setNotes] = useState("");
  const [notesError, setNotesError] = useState("");
  const dq = useDebouncedValue(search, 350);
  useEffect(() => { if (routeId) setActiveId(routeId); }, [routeId]);

  const params = { search: dq.trim() || undefined, status: status === "all" ? undefined : status, garmentSource: source === "all" ? undefined : source, page, limit: pageSize };
  const listQuery = useQuery({ queryKey: keys.printing.list(params), queryFn: () => printingApi.listRequests(params), placeholderData: keepPreviousData, enabled: tab === "requests" });
  const detailQuery = useQuery({ queryKey: keys.printing.detail(activeId), queryFn: () => printingApi.getRequest(activeId), enabled: !!activeId });
  const total = useCount(undefined), pending = useCount("pending"), review = useCount("under_review"), approved = useCount("approved");
  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const r = detailQuery.data;

  const done = (msg) => { queryClient.invalidateQueries({ queryKey: keys.printing.all }); addToast(msg); setNotesDialog(null); setNotes(""); setNotesError(""); };
  const reviewM = useMutation({ mutationFn: () => printingApi.review(activeId), onSuccess: () => done("Request moved to review."), onError: (e) => addToast(errorMessage(e, "Action failed"), "error") });
  const decideM = useMutation({ mutationFn: ({ kind, adminNotes }) => (kind === "approve" ? printingApi.approve(activeId, adminNotes) : printingApi.reject(activeId, adminNotes)), onSuccess: (_d, v) => done(v.kind === "approve" ? "Request approved." : "Request rejected."), onError: (e) => { const { fields, general } = splitFormError(e, "Action failed"); setNotesError(fields.adminNotes || general); } });

  const submitDecision = () => {
    if (notesDialog === "reject" && !notes.trim()) return setNotesError("Give the customer a reason for the rejection.");
    setNotesError("");
    decideM.mutate({ kind: notesDialog, adminNotes: notes });
  };
  const open = (id) => { setActiveId(id); if (routeId !== id) navigate(`/printing/${id}`); };
  const close = () => { setActiveId(null); if (routeId) navigate("/printing"); };
  const reset = (setter) => (v) => { setter(v); setPage(1); };
  const filtersActive = dq || status !== "all" || source !== "all";
  const tabBtn = (id, label) => <button onClick={() => setTab(id)} className={`px-4 py-2 text-xs font-semibold rounded-lg ${tab === id ? "bg-[#0f2922] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>;
  const stat = (label, q, c, hint) => <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span><div className={`text-2xl font-bold font-mono mt-1 ${c}`}>{q.data == null ? "—" : formatNumber(q.data)}</div><span className="text-xs text-slate-500 mt-1 block">{hint}</span></div>;

  return <div className="space-y-6">
      <PageHeader breadcrumb={[{ label: "B2B Manufacturing" }, { label: "Printing & Branding" }]} title="Custom Printing & Branding Studio" description="Review customer branding requests (garment, colours, placements and artwork), then approve, reject or quote them. Manage the techniques customers can choose." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stat("All Requests", total, "text-slate-900", "Submitted by customers")}
        {stat("Pending", pending, "text-amber-600", "Awaiting first review")}
        {stat("Under Review", review, "text-purple-600", "Being assessed")}
        {stat("Approved", approved, "text-emerald-800", "Ready for a quote")}
      </div>

      <div className="flex gap-2">{tabBtn("requests", "Requests")}{tabBtn("services", "Techniques")}</div>

      {tab === "services" ? <ServicesTab canManage={canManage} /> : <>
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="max-w-md w-full"><SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by request #, client, technique..." /></div>
          <div className="flex items-center gap-2">
            <select value={source} onChange={(e) => reset(setSource)(e.target.value)} className={sel}><option value="all">All Garment Sources</option>{Object.entries(GARMENT_SOURCES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={sel}><option value="all">All Statuses</option>{PRINT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={6} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title={filtersActive ? "No Requests Match" : "No Printing Requests"} description={filtersActive ? "No requests match the filters." : "Requests submitted by customers appear here."} /></div> : <div className="overflow-x-auto"><table className="w-full text-left border-collapse">
              <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-3 px-4">Request # & Date</th><th className="py-3 px-4">Client / Brand</th><th className="py-3 px-4">Technique</th><th className="py-3 px-4">Garment</th><th className="py-3 px-4 text-center">Quantity</th><th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100 text-xs">{items.map((x) => <tr key={x._id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => open(x._id)}>
                  <td className="py-3.5 px-4"><span className="font-mono font-bold text-slate-900">{x.requestNumber}</span><div className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(x.createdAt)}</div></td>
                  <td className="py-3.5 px-4"><div className="font-semibold text-slate-900">{x.customer?.businessName || x.customer?.name}</div><div className="text-slate-500 text-[11px]">{x.customer?.name}</div></td>
                  <td className="py-3.5 px-4"><span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-700">{x.selection?.serviceName || "—"}</span></td>
                  <td className="py-3.5 px-4"><div className="text-slate-800 font-medium">{GARMENT_SOURCES[x.garmentSource] || humanize(x.garmentSource)}</div><div className="text-slate-500 text-[11px] max-w-[200px] truncate">{x.garmentDetails}</div></td>
                  <td className="py-3.5 px-4 text-center font-mono font-bold">{formatNumber(x.quantity)} pcs</td>
                  <td className="py-3.5 px-4"><StatusBadge status={x.status} /></td>
                  <td className="py-3.5 px-4 text-right"><button onClick={(e) => { e.stopPropagation(); open(x._id); }} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title="Review request"><Eye className="w-4 h-4" /></button></td>
                </tr>)}</tbody></table></div>}
          {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="request" labelPlural="requests" />}
          {listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
        </div>
      </>}

      <Drawer isOpen={Boolean(activeId)} onClose={close} title={r ? `Request ${r.requestNumber}` : "Printing request"} subtitle={r ? `${r.selection?.serviceName || ""} • ${r.customer?.businessName || r.customer?.name || ""}` : ""} badge={r && <StatusBadge status={r.status} />}
        headerActions={r && <div className="flex items-center gap-1.5">
          {canManage && r.status === "pending" && <button className={`${btn} bg-amber-50 text-amber-800 hover:bg-amber-100`} disabled={reviewM.isPending} onClick={() => reviewM.mutate()}>Start review</button>}
          {canManage && ["pending", "under_review"].includes(r.status) && <><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={() => { setNotes(""); setNotesError(""); setNotesDialog("approve"); }}>Approve</button><button className={`${btn} bg-rose-50 text-rose-700 hover:bg-rose-100`} onClick={() => { setNotes(""); setNotesError(""); setNotesDialog("reject"); }}>Reject</button></>}
          {canQuote && r.status === "approved" && !r.quote && <button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={() => setQuoteOpen(true)}>Create quote</button>}
        </div>}>
        {detailQuery.isLoading ? <LoadingSkeleton rows={5} /> : detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} /> : r && <div className="space-y-5 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between"><span className="text-slate-400 text-[10px]">Technique</span><span className="font-semibold">{r.selection?.serviceName}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-[10px]">Garment source</span><span className="font-semibold">{GARMENT_SOURCES[r.garmentSource] || humanize(r.garmentSource)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-[10px]">Quantity</span><span className="font-mono font-bold text-emerald-800">{formatNumber(r.quantity)} pcs</span></div>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2"><h5 className="font-bold text-slate-900">Garment details</h5><p className="text-slate-600 whitespace-pre-wrap">{r.garmentDetails}</p>
              {r.colors?.length > 0 && <div className="flex flex-wrap gap-1.5 pt-1">{r.colors.map((c) => <span key={c} className="px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-700">{c}</span>)}</div>}</div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1"><h5 className="font-bold text-slate-900">Requirements</h5><p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{r.requirements}</p>{r.customerNotes && <p className="text-slate-500 whitespace-pre-wrap pt-1">Notes: {r.customerNotes}</p>}</div>
            {r.placements?.length > 0 && <div className="border border-slate-200 rounded-xl overflow-hidden"><div className="px-4 py-2 bg-slate-50 text-[10px] uppercase tracking-wider font-bold text-slate-500">Print placements</div><ul className="divide-y divide-slate-100">{r.placements.map((p, i) => <li key={i} className="px-4 py-2.5"><div className="font-semibold">{p.name}</div>{p.description && <div className="text-slate-500">{p.description}</div>}</li>)}</ul></div>}
            {r.artwork?.length > 0 && <div className="border border-slate-200 rounded-xl overflow-hidden"><div className="px-4 py-2 bg-slate-50 text-[10px] uppercase tracking-wider font-bold text-slate-500">Artwork files</div><ul className="divide-y divide-slate-100">{r.artwork.map((a) => <li key={a.publicId} className="px-4 py-2.5"><a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-emerald-700 hover:underline"><FileImage className="w-4 h-4" />{a.originalName || a.publicId}{a.format ? ` (${a.format.toUpperCase()})` : ""}{a.bytes ? ` · ${(a.bytes / 1024).toFixed(0)} KB` : ""}</a></li>)}</ul></div>}
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2"><h5 className="font-bold text-slate-900">Client</h5><p className="font-semibold">{r.customer?.name}{r.customer?.businessName ? ` · ${r.customer.businessName}` : ""}</p><div className="flex items-center gap-2 text-slate-500"><Mail className="w-3.5 h-3.5" />{r.customer?.email}</div><div className="flex items-center gap-2 text-slate-500"><Phone className="w-3.5 h-3.5" />{r.customer?.phone}</div></div>
            {r.adminNotes && <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl"><h5 className="font-bold text-slate-900 mb-1">Staff Notes</h5><p className="text-slate-600 whitespace-pre-wrap">{r.adminNotes}</p></div>}
            {r.quote && <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1"><h5 className="font-bold text-slate-900">Quote</h5><div className="flex justify-between"><span className="font-mono">{r.quote.quoteNumber}</span><StatusBadge status={r.quote.status} /></div>{r.quote.pricing?.total != null && <div className="font-mono font-bold">{formatMoney(r.quote.pricing.total)}</div>}</div>}
            {r.order && <div className="p-4 bg-white border border-slate-200 rounded-xl flex justify-between"><span className="font-bold">Order</span><span className="font-mono">{r.order.orderNumber}</span></div>}
          </div>}
      </Drawer>

      <Modal isOpen={Boolean(notesDialog)} onClose={() => !decideM.isPending && setNotesDialog(null)} title={notesDialog === "reject" ? "Reject request" : "Approve request"} maxWidth="md">
        <div className="space-y-3">
          <FormField label={notesDialog === "reject" ? "Reason" : "Notes (optional)"} required={notesDialog === "reject"} error={notesError}><textarea rows={3} maxLength={5000} className={inp} value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
          <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={() => setNotesDialog(null)} disabled={decideM.isPending}>Cancel</button><button className={`${btn} ${notesDialog === "reject" ? "bg-rose-700 text-white hover:bg-rose-600" : "bg-emerald-800 text-white hover:bg-emerald-700"}`} onClick={submitDecision} disabled={decideM.isPending}>{decideM.isPending ? "Saving…" : "Confirm"}</button></div>
        </div>
      </Modal>
      {quoteOpen && r && <CreateQuoteModal sourceType="printing" requestId={r._id} requestNumber={r.requestNumber} quantity={r.quantity} onClose={() => setQuoteOpen(false)} />}
    </div>;
};
