import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Mail, Phone, Eye, Pencil, Plus, Loader2 } from "lucide-react";
import { manufacturingApi, MFG_STATUSES } from "../services/manufacturingApi";
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
import { CreateQuoteModal } from "../components/quotes/CreateQuoteModal";

const sel = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";
const inp = "w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#00130d] outline-none";
const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* ------------------------------- Catalog tab ------------------------------- */
const CatalogEditor = ({ type, row, categories, styles, onClose }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const isEdit = Boolean(row);
  const [f, setF] = useState(() => ({
    name: row?.name || "", slug: row?.slug || "", description: row?.description || "", isActive: row?.isActive ?? true, sortOrder: row?.sortOrder ?? 0,
    category: row?.category?._id || row?.category || "", style: row?.style?._id || row?.style || "", variantCode: row?.variantCode || "", colorName: row?.colorName || "",
    media: (row?.media || []).map((m) => ({ url: m.url, publicId: m.publicId, alt: m.alt, viewType: m.viewType, sortOrder: m.sortOrder })),
  }));
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: (body) => {
      if (type === "category") return isEdit ? manufacturingApi.updateCategory(row._id, body) : manufacturingApi.createCategory(body);
      if (type === "style") return isEdit ? manufacturingApi.updateStyle(row._id, body) : manufacturingApi.createStyle(body);
      return isEdit ? manufacturingApi.updateVariant(row._id, body) : manufacturingApi.createVariant(body);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.manufacturing.all }); addToast(`${humanize(type)} ${isEdit ? "updated" : "created"}.`); onClose(); },
    onError: (err) => { const { fields, general: g } = splitFormError(err, "Could not save"); setErrors(fields); setGeneral(g); },
  });

  const submit = () => {
    const e = {};
    if (f.name.trim().length < (type === "variant" ? 1 : 2)) e.name = "Name is too short.";
    if (type !== "variant" && !SLUG_RE.test(f.slug)) e.slug = "Use lowercase letters, numbers and hyphens only.";
    if (type === "style" && !f.category) e.category = "Select a category.";
    if (type === "variant") { if (!f.style) e.style = "Select a style."; if (!f.variantCode.trim()) e.variantCode = "Variant code is required."; }
    setErrors(e); setGeneral("");
    if (Object.keys(e).length) return;
    const body = { name: f.name.trim(), isActive: f.isActive, sortOrder: Number(f.sortOrder) || 0, ...(f.description.trim() ? { description: f.description.trim() } : {}) };
    if (type !== "variant") body.slug = f.slug;
    if (type === "style") body.category = f.category;
    if (type === "variant") {
      body.style = f.style; body.variantCode = f.variantCode.trim();
      if (f.colorName.trim()) body.colorName = f.colorName.trim();
      body.media = f.media.map((m, i) => ({ url: m.url, ...(m.publicId ? { publicId: m.publicId } : {}), ...(m.alt ? { alt: m.alt } : {}), viewType: m.viewType || "other", sortOrder: i }));
    }
    save.mutate(body);
  };

  return <Modal isOpen onClose={() => !save.isPending && onClose()} title={`${isEdit ? "Edit" : "New"} ${type}`} maxWidth="md">
      <div className="space-y-3">
        {type === "style" && <FormField label="Category" required error={errors.category}><select className={inp} value={f.category} onChange={(e) => set("category", e.target.value)}><option value="">Select…</option>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></FormField>}
        {type === "variant" && <FormField label="Style" required error={errors.style}><select className={inp} value={f.style} onChange={(e) => set("style", e.target.value)}><option value="">Select…</option>{styles.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></FormField>}
        <FormField label="Name" required error={errors.name}><input className={inp} maxLength={160} value={f.name} onChange={(e) => { set("name", e.target.value); if (type !== "variant" && !slugTouched) set("slug", slugify(e.target.value)); }} /></FormField>
        {type !== "variant" && <FormField label="Slug" required error={errors.slug}><input className={inp} maxLength={180} value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} /></FormField>}
        {type === "variant" && <div className="grid grid-cols-2 gap-3"><FormField label="Variant code" required error={errors.variantCode}><input className={inp} maxLength={60} value={f.variantCode} onChange={(e) => set("variantCode", e.target.value)} /></FormField><FormField label="Colour" error={errors.colorName}><input className={inp} maxLength={80} value={f.colorName} onChange={(e) => set("colorName", e.target.value)} /></FormField></div>}
        <FormField label="Description" error={errors.description}><textarea rows={2} className={inp} maxLength={3000} value={f.description} onChange={(e) => set("description", e.target.value)} /></FormField>
        {type === "variant" && <FormField label="Images" error={errors.media}><ImageGalleryUpload purpose="manufacturing_catalog" max={30} value={f.media} onChange={(v) => set("media", v.map((m) => ({ viewType: "other", ...m })))} /></FormField>}
        <div className="grid grid-cols-2 gap-3 items-end"><FormField label="Sort order"><input type="number" className={inp} value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></FormField><label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Toggle checked={f.isActive} onChange={(v) => set("isActive", v)} /> Active</label></div>
        {general && <p className="text-xs text-rose-600">{general}</p>}
        <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={onClose} disabled={save.isPending}>Cancel</button><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</button></div>
      </div>
    </Modal>;
};

const CatalogTab = ({ canManage }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [type, setType] = useState("category");
  const [editor, setEditor] = useState(null);
  const q = useQuery({ queryKey: keys.manufacturing.catalog(type), queryFn: () => manufacturingApi.catalog(type) });
  const cats = useQuery({ queryKey: keys.manufacturing.catalog("category"), queryFn: () => manufacturingApi.catalog("category") });
  const styles = useQuery({ queryKey: keys.manufacturing.catalog("style"), queryFn: () => manufacturingApi.catalog("style") });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }) => manufacturingApi.setCatalogActive(type, id, isActive),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.manufacturing.all }); addToast("Status updated."); },
    onError: (err) => addToast(errorMessage(err, "Could not update status"), "error"),
  });
  const rows = q.data || [];
  const parent = (r) => (type === "style" ? r.category?.name : type === "variant" ? r.style?.name : null);
  const pill = (id, label) => <button onClick={() => setType(id)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${type === id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>;
  return <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-slate-100">
        <div className="flex gap-2">{pill("category", "Categories")}{pill("style", "Styles")}{pill("variant", "Variants")}</div>
        {canManage && <button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={() => setEditor({ row: null })}><Plus className="w-3.5 h-3.5" />New {type}</button>}
      </div>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} className="border-0" /> : q.isLoading ? <div className="p-6"><LoadingSkeleton rows={4} /></div> : rows.length === 0 ? <div className="p-12"><EmptyState title={`No ${humanize(type)}s`} description="Customers pick from this catalog when submitting a manufacturing request." /></div> : <div className="overflow-x-auto"><table className="w-full text-left border-collapse">
          <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-3 px-4">Name</th>{type !== "category" && <th className="py-3 px-4">{type === "style" ? "Category" : "Style"}</th>}{type === "variant" && <th className="py-3 px-4">Code</th>}<th className="py-3 px-4 text-center">Order</th><th className="py-3 px-4">Active</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100 text-xs">{rows.map((r) => <tr key={r._id} className="hover:bg-slate-50/70"><td className="py-3 px-4"><div className="font-semibold text-slate-900">{r.name}</div>{r.slug && <div className="text-[10px] font-mono text-slate-400">{r.slug}</div>}</td>{type !== "category" && <td className="py-3 px-4 text-slate-600">{parent(r) || "—"}</td>}{type === "variant" && <td className="py-3 px-4 font-mono">{r.variantCode}</td>}<td className="py-3 px-4 text-center font-mono">{r.sortOrder}</td><td className="py-3 px-4"><Toggle checked={r.isActive} disabled={!canManage || toggle.isPending} onChange={(v) => toggle.mutate({ id: r._id, isActive: v })} /></td><td className="py-3 px-4 text-right">{canManage && <button onClick={() => setEditor({ row: r })} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg"><Pencil className="w-4 h-4" /></button>}</td></tr>)}</tbody></table></div>}
      {editor && <CatalogEditor key={editor.row?._id || "new"} type={type} row={editor.row} categories={cats.data || []} styles={styles.data || []} onClose={() => setEditor(null)} />}
    </div>;
};

/* ------------------------------ Requests tab ------------------------------- */
const useStatusTotal = (status) => useQuery({ queryKey: [...keys.manufacturing.all, "count", status || "all"], queryFn: async () => (await manufacturingApi.listRequests({ status, limit: 1 })).meta.total });

export const ManufacturingPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const { can } = useAuth();
  const canManage = can("manufacturing.manage");
  const canQuote = can("quotes.manage");

  const [tab, setTab] = useState("requests");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeId, setActiveId] = useState(routeId || null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const dq = useDebouncedValue(search, 350);
  useEffect(() => { if (routeId) setActiveId(routeId); }, [routeId]);

  const params = { search: dq.trim() || undefined, status: status === "all" ? undefined : status, page, limit: pageSize };
  const listQuery = useQuery({ queryKey: keys.manufacturing.list(params), queryFn: () => manufacturingApi.listRequests(params), placeholderData: keepPreviousData, enabled: tab === "requests" });
  const detailQuery = useQuery({ queryKey: keys.manufacturing.detail(activeId), queryFn: () => manufacturingApi.getRequest(activeId), enabled: !!activeId });
  const total = useStatusTotal(undefined), pending = useStatusTotal("pending"), review = useStatusTotal("under_review"), approved = useStatusTotal("approved");
  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const r = detailQuery.data;

  const afterAction = (msg) => { queryClient.invalidateQueries({ queryKey: keys.manufacturing.all }); addToast(msg); };
  const reviewM = useMutation({ mutationFn: (p) => manufacturingApi.review(activeId, p), onSuccess: (_d, v) => afterAction(v.action === "reject" ? "Request rejected." : "Request moved to review."), onError: (e) => addToast(errorMessage(e, "Action failed"), "error") });
  const approveM = useMutation({ mutationFn: () => manufacturingApi.approve(activeId), onSuccess: () => afterAction("Request approved."), onError: (e) => addToast(errorMessage(e, "Action failed"), "error") });

  const open = (id) => { setActiveId(id); if (routeId !== id) navigate(`/manufacturing/${id}`); };
  const close = () => { setActiveId(null); if (routeId) navigate("/manufacturing"); };
  const reset = (setter) => (v) => { setter(v); setPage(1); };
  const filtersActive = dq || status !== "all";
  const tabBtn = (id, label) => <button onClick={() => setTab(id)} className={`px-4 py-2 text-xs font-semibold rounded-lg ${tab === id ? "bg-[#0f2922] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>;
  const stat = (label, q, c, hint) => <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span><div className={`text-2xl font-bold font-mono mt-1 ${c}`}>{q.data == null ? "—" : formatNumber(q.data)}</div><span className="text-xs text-slate-500 mt-1 block">{hint}</span></div>;

  return <div className="space-y-6">
      <PageHeader breadcrumb={[{ label: "B2B Manufacturing" }, { label: "Manufacturing" }]} title="Cut & Sew Manufacturing Requests" description="Review custom manufacturing requests, move them to quotation, and maintain the category / style / variant catalog customers choose from." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stat("All Requests", total, "text-slate-900", "Submitted by customers")}
        {stat("Pending", pending, "text-amber-600", "Awaiting first review")}
        {stat("Under Review", review, "text-purple-600", "Being assessed")}
        {stat("Approved", approved, "text-emerald-800", "Ready for a quote")}
      </div>

      <div className="flex gap-2">{tabBtn("requests", "Requests")}{tabBtn("catalog", "Catalog")}</div>

      {tab === "catalog" ? <CatalogTab canManage={canManage} /> : <>
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="max-w-md w-full"><SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by request #, client, style, variant code..." /></div>
          <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={sel}><option value="all">All Statuses</option>{MFG_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={6} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title={filtersActive ? "No Requests Match" : "No Manufacturing Requests"} description={filtersActive ? "No requests match the filters." : "Requests submitted by customers appear here."} /></div> : <div className="overflow-x-auto"><table className="w-full text-left border-collapse">
              <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-3 px-4">Request # & Date</th><th className="py-3 px-4">Client / Brand</th><th className="py-3 px-4">Style & Variant</th><th className="py-3 px-4 text-center">Quantity</th><th className="py-3 px-4">Quote</th><th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100 text-xs">{items.map((x) => <tr key={x._id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => open(x._id)}>
                  <td className="py-3.5 px-4"><span className="font-mono font-bold text-slate-900">{x.requestNumber}</span><div className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(x.createdAt)}</div></td>
                  <td className="py-3.5 px-4"><div className="font-semibold text-slate-900">{x.customer?.businessName || x.customer?.name}</div><div className="text-slate-500 text-[11px]">{x.customer?.name}</div></td>
                  <td className="py-3.5 px-4"><div className="text-slate-800 font-medium">{x.selection?.categoryName} · {x.selection?.styleName}</div><div className="text-slate-500 text-[11px]">{[x.selection?.variantName, x.selection?.variantCode].filter(Boolean).join(" · ") || "No variant"}</div></td>
                  <td className="py-3.5 px-4 text-center font-mono font-bold">{formatNumber(x.quantity)} pcs</td>
                  <td className="py-3.5 px-4 font-mono text-slate-600">{x.quote?.quoteNumber || "—"}</td>
                  <td className="py-3.5 px-4"><StatusBadge status={x.status} /></td>
                  <td className="py-3.5 px-4 text-right"><button onClick={(e) => { e.stopPropagation(); open(x._id); }} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title="Review request"><Eye className="w-4 h-4" /></button></td>
                </tr>)}</tbody></table></div>}
          {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="request" labelPlural="requests" />}
          {listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
        </div>
      </>}

      <Drawer isOpen={Boolean(activeId)} onClose={close} title={r ? `Request ${r.requestNumber}` : "Manufacturing request"} subtitle={r ? `${r.selection?.categoryName || ""} • ${r.customer?.businessName || r.customer?.name || ""}` : ""} badge={r && <StatusBadge status={r.status} />}
        headerActions={r && <div className="flex items-center gap-1.5">
          {canManage && r.status === "pending" && <button className={`${btn} bg-amber-50 text-amber-800 hover:bg-amber-100`} disabled={reviewM.isPending} onClick={() => reviewM.mutate({ action: "review" })}>Start review</button>}
          {canManage && ["pending", "under_review"].includes(r.status) && <><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} disabled={approveM.isPending} onClick={() => approveM.mutate()}>Approve</button><button className={`${btn} bg-rose-50 text-rose-700 hover:bg-rose-100`} disabled={reviewM.isPending} onClick={() => reviewM.mutate({ action: "reject" })}>Reject</button></>}
          {canQuote && r.status === "approved" && !r.quote && <button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={() => setQuoteOpen(true)}>Create quote</button>}
        </div>}>
        {detailQuery.isLoading ? <LoadingSkeleton rows={5} /> : detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} /> : r && <div className="space-y-5 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between"><span className="text-slate-400 text-[10px]">Category</span><span className="font-semibold">{r.selection?.categoryName}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-[10px]">Style</span><span className="font-semibold">{r.selection?.styleName}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-[10px]">Variant</span><span className="font-semibold">{[r.selection?.variantName, r.selection?.variantCode, r.selection?.colorName].filter(Boolean).join(" · ") || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-[10px]">Quantity</span><span className="font-mono font-bold text-emerald-800">{formatNumber(r.quantity)} pcs</span></div>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2"><h5 className="font-bold text-slate-900">Client</h5><p className="font-semibold">{r.customer?.name}{r.customer?.businessName ? ` · ${r.customer.businessName}` : ""}</p><div className="flex items-center gap-2 text-slate-500"><Mail className="w-3.5 h-3.5" />{r.customer?.email}</div><div className="flex items-center gap-2 text-slate-500"><Phone className="w-3.5 h-3.5" />{r.customer?.phone}</div>{r.customer?.taxNtn && <div className="text-slate-500 font-mono">NTN {r.customer.taxNtn}</div>}</div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1"><h5 className="font-bold text-slate-900">Requirements</h5><p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{r.requirements}</p>{r.customerNotes && <p className="text-slate-500 whitespace-pre-wrap pt-1">Notes: {r.customerNotes}</p>}</div>
            {r.adminNotes && <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl"><h5 className="font-bold text-slate-900 mb-1">Staff Notes</h5><p className="text-slate-600 whitespace-pre-wrap">{r.adminNotes}</p></div>}
            {r.quote && <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1"><h5 className="font-bold text-slate-900">Quote</h5><div className="flex justify-between"><span className="font-mono">{r.quote.quoteNumber}</span><StatusBadge status={r.quote.status} /></div>{r.quote.pricing?.total != null && <div className="font-mono font-bold">{formatMoney(r.quote.pricing.total)}</div>}</div>}
            {r.order && <div className="p-4 bg-white border border-slate-200 rounded-xl flex justify-between"><span className="font-bold">Order</span><span className="font-mono">{r.order.orderNumber}</span></div>}
            <div className="text-slate-500 space-y-1">{r.reviewedBy && <div>Reviewed by {r.reviewedBy.name} · {formatDateTime(r.reviewedAt)}</div>}{r.approvedBy && <div>Approved by {r.approvedBy.name} · {formatDateTime(r.approvedAt)}</div>}</div>
          </div>}
      </Drawer>
      {quoteOpen && r && <CreateQuoteModal sourceType="manufacturing" requestId={r._id} requestNumber={r.requestNumber} quantity={r.quantity} onClose={() => setQuoteOpen(false)} />}
    </div>;
};
