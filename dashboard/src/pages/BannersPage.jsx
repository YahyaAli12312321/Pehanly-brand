import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { bannersApi, PLACEMENTS, BANNER_STATUS_FILTERS } from "../services/bannersApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { splitFormError } from "../lib/formErrors";
import { formatDate, formatNumber, humanize, isoToDateInput } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { SearchInput } from "../components/common/SearchInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { Pagination } from "../components/common/Pagination";
import { Modal } from "../components/common/Modal";
import { FormField } from "../components/common/FormField";
import { Toggle } from "../components/common/Toggle";
import { ImageUpload } from "../components/common/ImageUpload";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";

const sel = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";
const inp = "w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#00130d] outline-none";
const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50";
const isSafeLink = (v) => /^\/(?!\/)/.test(v) || /^https?:\/\/\S+$/i.test(v);

const BannerEditor = ({ banner, onClose }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const isEdit = Boolean(banner);
  const [f, setF] = useState(() => ({
    title: banner?.title || "", subtitle: banner?.subtitle || "", placement: banner?.placement || "home_hero", image: banner?.image?.url ? banner.image : null, mobileImage: banner?.mobileImage?.url ? banner.mobileImage : null,
    ctaLabel: banner?.cta?.label || "", ctaTarget: banner?.cta?.target || "", isActive: banner?.isActive ?? true, sortOrder: banner?.sortOrder ?? 0,
    startsAt: banner?.startsAt ? isoToDateInput(banner.startsAt) : "", endsAt: banner?.endsAt ? isoToDateInput(banner.endsAt) : "",
  }));
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const img = (m) => (m ? { url: m.url, ...(m.publicId ? { publicId: m.publicId } : {}), ...(m.alt ? { alt: m.alt } : {}) } : undefined);

  const save = useMutation({
    mutationFn: (b) => (isEdit ? bannersApi.update(banner._id, b) : bannersApi.create(b)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.banners.all }); addToast(isEdit ? "Banner updated." : "Banner created."); onClose(); },
    onError: (err) => { const { fields, general: g } = splitFormError(err, "Could not save the banner"); setErrors(fields); setGeneral(g); },
  });
  const submit = () => {
    const e = {};
    if (!f.title.trim()) e.title = "Headline is required.";
    if (!f.image) e.image = "Upload the banner image.";
    if (f.ctaLabel.trim() && !f.ctaTarget.trim()) e.ctaTarget = "Add a link for the button.";
    if (f.ctaTarget.trim() && !isSafeLink(f.ctaTarget.trim())) e.ctaTarget = 'Use an http(s) URL or an app path starting with "/".';
    if (Number(f.sortOrder) < 0 || !Number.isInteger(Number(f.sortOrder))) e.sortOrder = "Whole number, zero or more.";
    if (f.startsAt && f.endsAt && f.endsAt <= f.startsAt) e.endsAt = "End date must be after the start date.";
    setErrors(e); setGeneral("");
    if (Object.keys(e).length) return;
    const cta = f.ctaTarget.trim() ? { ...(f.ctaLabel.trim() ? { label: f.ctaLabel.trim() } : {}), target: f.ctaTarget.trim() } : null;
    save.mutate({
      title: f.title.trim(), subtitle: f.subtitle.trim(), placement: f.placement, image: img(f.image), mobileImage: isEdit ? img(f.mobileImage) || null : img(f.mobileImage),
      cta: isEdit ? cta : cta || undefined, isActive: f.isActive, sortOrder: Number(f.sortOrder) || 0,
      startsAt: f.startsAt ? new Date(`${f.startsAt}T00:00:00`).toISOString() : null, endsAt: f.endsAt ? new Date(`${f.endsAt}T23:59:59`).toISOString() : null,
    });
  };
  return <Modal isOpen onClose={() => !save.isPending && onClose()} title={isEdit ? "Edit banner" : "Add storefront banner"} maxWidth="lg">
      <div className="space-y-3">
        <FormField label="Headline" required error={errors.title}><input className={inp} maxLength={160} value={f.title} onChange={set("title")} /></FormField>
        <FormField label="Subtitle" error={errors.subtitle}><input className={inp} maxLength={500} value={f.subtitle} onChange={set("subtitle")} /></FormField>
        <FormField label="Placement" required error={errors.placement}><select className={inp} value={f.placement} onChange={set("placement")}>{Object.entries(PLACEMENTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ImageUpload label="Banner image *" purpose="banner_image" value={f.image} onChange={(v) => setF((s) => ({ ...s, image: v }))} error={errors.image} />
          <ImageUpload label="Mobile image (optional)" purpose="banner_image" value={f.mobileImage} onChange={(v) => setF((s) => ({ ...s, mobileImage: v }))} error={errors.mobileImage} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Button label" error={errors.ctaLabel}><input className={inp} maxLength={80} value={f.ctaLabel} onChange={set("ctaLabel")} /></FormField>
          <FormField label="Button link" error={errors.ctaTarget} hint='e.g. /shop or https://…'><input className={inp} maxLength={500} value={f.ctaTarget} onChange={set("ctaTarget")} /></FormField>
          <FormField label="Starts" error={errors.startsAt}><input type="date" className={inp} value={f.startsAt} onChange={set("startsAt")} /></FormField>
          <FormField label="Ends" error={errors.endsAt}><input type="date" className={inp} value={f.endsAt} min={f.startsAt || undefined} onChange={set("endsAt")} /></FormField>
          <FormField label="Sort order" error={errors.sortOrder}><input type="number" min={0} className={inp} value={f.sortOrder} onChange={set("sortOrder")} /></FormField>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 self-end pb-2"><Toggle checked={f.isActive} onChange={(v) => setF((s) => ({ ...s, isActive: v }))} /> Live on storefront</label>
        </div>
        {general && <p className="text-xs text-rose-600">{general}</p>}
        <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={onClose} disabled={save.isPending}>Cancel</button><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create banner"}</button></div>
      </div>
    </Modal>;
};

export const BannersPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { can } = useAuth();
  const canManage = can("banners.manage");
  const [search, setSearch] = useState("");
  const [placement, setPlacement] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editor, setEditor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const dq = useDebouncedValue(search, 350);

  const params = { search: dq.trim() || undefined, placement: placement === "all" ? undefined : placement, status: status === "all" ? undefined : status, page, limit: pageSize };
  const listQuery = useQuery({ queryKey: keys.banners.list(params), queryFn: () => bannersApi.list(params), placeholderData: keepPreviousData });
  const statsQuery = useQuery({ queryKey: keys.banners.stats, queryFn: bannersApi.stats });
  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const stats = statsQuery.data;

  const toggle = useMutation({ mutationFn: ({ id, isActive }) => bannersApi.setActive(id, isActive), onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.banners.all }); addToast("Banner status updated."); }, onError: (e) => addToast(errorMessage(e, "Could not update the banner"), "error") });
  const remove = useMutation({ mutationFn: (id) => bannersApi.remove(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.banners.all }); addToast("Banner deleted."); setRemoving(null); }, onError: (e) => { setRemoving(null); addToast(errorMessage(e, "Could not delete the banner"), "error"); } });
  const reset = (setter) => (v) => { setter(v); setPage(1); };
  const filtersActive = dq || placement !== "all" || status !== "all";
  const stat = (label, v, c, hint, fmt = formatNumber) => <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span><div className={`text-2xl font-bold font-mono mt-1 ${c}`}>{v == null ? "—" : fmt(v)}</div><span className="text-xs text-slate-500 mt-1 block">{hint}</span></div>;

  return <div className="space-y-6">
      <PageHeader breadcrumb={[{ label: "Marketing" }, { label: "Banners" }]} title="Storefront Banners" description="Hero and promotional banners for the retail, wholesale and manufacturing storefront sections, with scheduling and engagement numbers."
        actions={canManage && <button onClick={() => setEditor({ banner: null })} className="inline-flex items-center gap-2 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold uppercase tracking-wider rounded-lg shadow-sm hover:bg-[#1a2634] transition-colors"><Plus className="w-4 h-4" />Add Storefront Banner</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stat("Total Banners", stats?.totalBanners, "text-slate-900", "Configured slots")}
        {stat("Live Slots", stats?.liveSlots, "text-emerald-800", "Active on the storefront now")}
        {stat("Average CTR", stats?.averageCtr, "text-blue-600", "Clicks ÷ impressions, all time", (v) => `${v}%`)}
        {stat("Impressions", stats?.impressions, "text-purple-600", "All-time banner views")}
      </div>
      {statsQuery.isError && <p className="text-xs text-rose-600">Couldn't load banner totals. <button className="underline" onClick={() => statsQuery.refetch()}>Retry</button></p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="max-w-md w-full"><SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by headline..." /></div>
        <div className="flex items-center gap-2">
          <select value={placement} onChange={(e) => reset(setPlacement)(e.target.value)} className={sel}><option value="all">All Placements</option>{Object.entries(PLACEMENTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={sel}><option value="all">All Statuses</option>{BANNER_STATUS_FILTERS.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={5} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title={filtersActive ? "No Banners Match" : "No Banners Yet"} description={filtersActive ? "No banners match the filters." : "Add a banner to promote a campaign on the storefront."} /></div> : <div className="overflow-x-auto"><table className="w-full text-left border-collapse">
            <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-3 px-4">Banner</th><th className="py-3 px-4">Placement</th><th className="py-3 px-4">Schedule</th><th className="py-3 px-4 text-center">Views / Clicks</th><th className="py-3 px-4 text-center">CTR</th><th className="py-3 px-4">Status</th><th className="py-3 px-4">Live</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100 text-xs">{items.map((b) => <tr key={b._id} className="hover:bg-slate-50/70">
                <td className="py-3.5 px-4"><div className="flex items-center gap-3"><img src={b.image?.url} alt={b.image?.alt || ""} className="w-20 h-12 rounded-lg object-cover border border-slate-200 bg-slate-100" /><div><div className="font-semibold text-slate-900">{b.title}</div>{b.subtitle && <div className="text-[11px] text-slate-500 max-w-[220px] truncate">{b.subtitle}</div>}</div></div></td>
                <td className="py-3.5 px-4"><span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-700">{PLACEMENTS[b.placement] || humanize(b.placement)}</span></td>
                <td className="py-3.5 px-4 text-slate-600">{b.startsAt ? formatDate(b.startsAt) : "Any time"} → {b.endsAt ? formatDate(b.endsAt) : "No end"}</td>
                <td className="py-3.5 px-4 text-center font-mono">{formatNumber(b.impressions)} / {formatNumber(b.clicks)}</td>
                <td className="py-3.5 px-4 text-center font-mono">{b.ctr}%</td>
                <td className="py-3.5 px-4"><StatusBadge status={b.status} /></td>
                <td className="py-3.5 px-4"><Toggle checked={b.isActive} disabled={!canManage || toggle.isPending} onChange={(v) => toggle.mutate({ id: b._id, isActive: v })} /></td>
                <td className="py-3.5 px-4 text-right">{canManage && <div className="inline-flex gap-1"><button onClick={() => setEditor({ banner: b })} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title="Edit"><Pencil className="w-4 h-4" /></button><button onClick={() => setRemoving(b)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button></div>}</td>
              </tr>)}</tbody></table></div>}
        {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="banner" labelPlural="banners" />}
        {listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
      </div>

      {editor && <BannerEditor key={editor.banner?._id || "new"} banner={editor.banner} onClose={() => setEditor(null)} />}
      <ConfirmDialog isOpen={Boolean(removing)} onClose={() => !remove.isPending && setRemoving(null)} onConfirm={() => remove.mutate(removing._id)} isLoading={remove.isPending} title="Delete banner" message={`Delete "${removing?.title}"? It disappears from the storefront immediately.`} confirmLabel="Delete" isDestructive />
    </div>;
};
