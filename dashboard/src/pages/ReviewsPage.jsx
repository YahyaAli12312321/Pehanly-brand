import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, BadgeCheck, MessageSquareReply, Check, X, Loader2 } from "lucide-react";
import { reviewsApi, REVIEW_STATUSES } from "../services/reviewsApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { splitFormError } from "../lib/formErrors";
import { formatDate, formatNumber, humanize } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { SearchInput } from "../components/common/SearchInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { Pagination } from "../components/common/Pagination";
import { Modal } from "../components/common/Modal";
import { FormField } from "../components/common/FormField";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";

const sel = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";
const inp = "w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#00130d] outline-none";
const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50";

const Stars = ({ n }) => <span className="inline-flex" aria-label={`${n} out of 5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`w-3.5 h-3.5 ${i <= n ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />)}</span>;
const useCount = (status) => useQuery({ queryKey: [...keys.reviews.all, "count", status || "all"], queryFn: async () => (await reviewsApi.list({ status, limit: 1 })).meta.total });

export const ReviewsPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { can } = useAuth();
  const canManage = can("reviews.manage");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [rating, setRating] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dialog, setDialog] = useState(null); // {type:'reject'|'reply', review}
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const dq = useDebouncedValue(search, 350);

  const params = { search: dq.trim() || undefined, status: status === "all" ? undefined : status, rating: rating === "all" ? undefined : Number(rating), page, limit: pageSize };
  const listQuery = useQuery({ queryKey: keys.reviews.list(params), queryFn: () => reviewsApi.list(params), placeholderData: keepPreviousData });
  const total = useCount(undefined), pending = useCount("pending"), approved = useCount("approved"), rejected = useCount("rejected");
  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;

  const done = (msg) => { queryClient.invalidateQueries({ queryKey: keys.reviews.all }); queryClient.invalidateQueries({ queryKey: keys.dashboard.summary }); addToast(msg); setDialog(null); setText(""); setErr(""); };
  const approveM = useMutation({ mutationFn: (id) => reviewsApi.approve(id), onSuccess: () => done("Review approved and published."), onError: (e) => addToast(errorMessage(e, "Could not approve the review"), "error") });
  const rejectM = useMutation({ mutationFn: ({ id, reason }) => reviewsApi.reject(id, reason), onSuccess: () => done("Review rejected."), onError: (e) => setErr(splitFormError(e, "Could not reject the review").general) });
  const replyM = useMutation({ mutationFn: ({ id, message }) => reviewsApi.reply(id, message), onSuccess: () => done("Official reply published."), onError: (e) => { const { fields, general } = splitFormError(e, "Could not publish the reply"); setErr(fields.message || general); } });

  const openDialog = (type, review) => { setText(type === "reply" ? review.brandReply?.message || "" : ""); setErr(""); setDialog({ type, review }); };
  const submit = () => {
    if (dialog.type === "reply") { if (!text.trim()) return setErr("Write the reply first."); replyM.mutate({ id: dialog.review._id, message: text }); }
    else rejectM.mutate({ id: dialog.review._id, reason: text });
  };
  const busy = rejectM.isPending || replyM.isPending;
  const reset = (setter) => (v) => { setter(v); setPage(1); };
  const filtersActive = dq || status !== "all" || rating !== "all";
  const stat = (label, q, c, hint) => <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span><div className={`text-2xl font-bold font-mono mt-1 ${c}`}>{q.data == null ? "—" : formatNumber(q.data)}</div><span className="text-xs text-slate-500 mt-1 block">{hint}</span></div>;

  return <div className="space-y-6">
      <PageHeader breadcrumb={[{ label: "Support" }, { label: "Customer Reviews" }]} title="Garment Reviews & Moderation" description="Approve or reject customer reviews and publish official PEHAN LY brand replies on approved ones." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stat("Total Reviews", total, "text-slate-900", "Submitted by customers")}
        {stat("Pending Review", pending, "text-amber-600", "Awaiting moderation")}
        {stat("Approved", approved, "text-emerald-800", "Visible on the storefront")}
        {stat("Rejected", rejected, "text-rose-600", "Hidden from customers")}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="max-w-md w-full"><SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by product, customer or review text..." /></div>
        <div className="flex items-center gap-2">
          <select value={rating} onChange={(e) => reset(setRating)(e.target.value)} className={sel}><option value="all">All Ratings</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>)}</select>
          <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={sel}><option value="all">All Statuses</option>{REVIEW_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select>
        </div>
      </div>

      <div className="space-y-3">
        {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} /> : listQuery.isLoading ? <div className="bg-white rounded-xl border border-slate-200 p-6"><LoadingSkeleton rows={5} /></div> : items.length === 0 ? <div className="bg-white rounded-xl border border-slate-200 p-12"><EmptyState title={filtersActive ? "No Reviews Match" : "No Reviews Yet"} description={filtersActive ? "No reviews match the filters." : "Customer reviews will appear here for moderation."} /></div> : items.map((r) => <div key={r._id} className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {r.product?.generalImages?.[0]?.url && <img src={r.product.generalImages[0].url} alt="" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />}
                <div><div className="font-semibold text-slate-900 text-sm">{r.product?.name || "Deleted product"}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5"><Stars n={r.rating} /><span>{r.customer?.name || r.user?.name || "Customer"}</span>{r.verifiedPurchase && <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><BadgeCheck className="w-3.5 h-3.5" />Verified buyer</span>}<span>· {formatDate(r.createdAt)}</span></div></div>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div><div className="font-semibold text-slate-900 text-xs">{r.title}</div><p className="text-xs text-slate-600 whitespace-pre-wrap mt-1">{r.comment}</p></div>
            {r.status === "rejected" && r.rejectionReason && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-2">Rejected: {r.rejectionReason}</p>}
            {r.brandReply?.message && <div className="text-xs bg-emerald-50/60 border border-emerald-100 rounded-lg p-3"><div className="font-semibold text-emerald-900 flex items-center gap-1.5"><MessageSquareReply className="w-3.5 h-3.5" />Official reply{r.brandReply.repliedBy?.name ? ` · ${r.brandReply.repliedBy.name}` : ""}</div><p className="text-emerald-900/80 mt-1 whitespace-pre-wrap">{r.brandReply.message}</p></div>}
            {canManage && <div className="flex flex-wrap gap-2 pt-1">
                {r.status !== "approved" && <button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} disabled={approveM.isPending} onClick={() => approveM.mutate(r._id)}><Check className="w-3.5 h-3.5" />Approve</button>}
                {r.status !== "rejected" && <button className={`${btn} bg-rose-50 text-rose-700 hover:bg-rose-100`} onClick={() => openDialog("reject", r)}><X className="w-3.5 h-3.5" />Reject</button>}
                {r.status === "approved" && <button className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`} onClick={() => openDialog("reply", r)}><MessageSquareReply className="w-3.5 h-3.5" />{r.brandReply?.message ? "Edit reply" : "Reply as brand"}</button>}
              </div>}
          </div>)}
        {meta && items.length > 0 && <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden"><Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="review" labelPlural="reviews" /></div>}
        {listQuery.isFetching && !listQuery.isLoading && <div className="text-[11px] text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
      </div>

      <Modal isOpen={Boolean(dialog)} onClose={() => !busy && setDialog(null)} title={dialog?.type === "reply" ? "Official brand reply" : "Reject review"} maxWidth="md">
        <div className="space-y-3">
          <FormField label={dialog?.type === "reply" ? "Reply (public)" : "Reason (optional)"} required={dialog?.type === "reply"} error={err}><textarea rows={4} className={inp} maxLength={dialog?.type === "reply" ? 3000 : 1000} value={text} onChange={(e) => setText(e.target.value)} /></FormField>
          <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={() => setDialog(null)} disabled={busy}>Cancel</button><button className={`${btn} ${dialog?.type === "reply" ? "bg-emerald-800 text-white hover:bg-emerald-700" : "bg-rose-700 text-white hover:bg-rose-600"}`} onClick={submit} disabled={busy}>{busy ? "Saving…" : dialog?.type === "reply" ? "Publish reply" : "Reject review"}</button></div>
        </div>
      </Modal>
    </div>;
};
