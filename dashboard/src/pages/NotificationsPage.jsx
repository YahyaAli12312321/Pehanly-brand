import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { notificationsApi } from "../services/notificationsApi";
import { useToastStore } from "../store/toastStore";
import { PageHeader } from "../components/common/PageHeader";
import { useNavigate } from "react-router-dom";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { Pagination } from "../components/common/Pagination";
import { Select } from "../components/common/Select";
import { keys } from "../lib/queryKeys";
import { errorMessage } from "../lib/apiError";
import { formatDateTime, humanize } from "../lib/format";
import { notificationGroup } from "../lib/notificationTypes";
import {
  Bell,
  CheckCircle2,
  ShoppingBag,
  Warehouse,
  FileSpreadsheet,
  CreditCard,
  Check,
  ExternalLink
} from "lucide-react";

const TYPE_OPTIONS = [
  "new_order",
  "new_wholesale_request",
  "new_manufacturing_request",
  "new_printing_request",
  "low_stock",
  "out_of_stock",
  "back_in_stock",
  "new_return_request",
  "quote_accepted",
  "quote_rejected",
  "payment_success",
  "payment_failed",
  "new_review"
];

const ICONS = {
  inventory: <Warehouse className="w-4 h-4 text-rose-600" />,
  order: <ShoppingBag className="w-4 h-4 text-emerald-600" />,
  b2b: <FileSpreadsheet className="w-4 h-4 text-amber-600" />,
  payment: <CreditCard className="w-4 h-4 text-amber-600" />,
  other: <Bell className="w-4 h-4 text-blue-600" />
};

export const NotificationsPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { addToast } = useToastStore();
  const [activeTab, setActiveTab] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const params = { page, limit: pageSize, unreadOnly: activeTab === "unread" ? true : undefined, type: type === "all" ? undefined : type };
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.notifications.list(params),
    queryFn: () => notificationsApi.list(params),
    placeholderData: keepPreviousData
  });
  const notifications = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const onChanged = () => queryClient.invalidateQueries({ queryKey: keys.notifications.all });
  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      onChanged();
      addToast("All notifications marked as read", "success");
    },
    onError: (err) => addToast(errorMessage(err), "error")
  });
  const markSingleMutation = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess: onChanged,
    onError: (err) => addToast(errorMessage(err), "error")
  });

  const handleNotificationClick = (item) => {
    if (!item.isRead) markSingleMutation.mutate(item._id);
    if (item.actionUrl) navigate(item.actionUrl);
  };

  const selectTab = (id) => {
    setActiveTab(id);
    setPage(1);
  };

  return <div className="space-y-6">
      <PageHeader
    breadcrumb={[{ label: "System & Insights" }, { label: "Notifications" }]}
    title="Operations Notifications Center"
    description="Alerts for new orders, low stock, wholesale and printing requests, quotes, returns, payments and reviews."
    badge={unreadCount > 0 ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
              {unreadCount} Unread Events
            </span> : <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              All Clear
            </span>}
    actions={unreadCount > 0 ? <button
      onClick={() => markAllMutation.mutate()}
      disabled={markAllMutation.isPending}
      className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50"
    >
              <Check className="w-4 h-4" />
              Mark All as Read
            </button> : null}
  />

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-2 flex items-center gap-2 overflow-x-auto">
        {[
    { id: "all", label: "All Alerts" },
    { id: "unread", label: `Unread (${unreadCount})` }
  ].map((t) => <button
    key={t.id}
    onClick={() => selectTab(t.id)}
    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${activeTab === t.id ? "bg-[#00130d] text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"}`}
  >
            {t.label}
          </button>)}
        <div className="ml-auto w-56 shrink-0">
          <Select
    value={type}
    onChange={(e) => {
      setType(e.target.value);
      setPage(1);
    }}
    aria-label="Filter by type"
  >
            <option value="all">All types</option>
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? <div className="p-6">
            <LoadingSkeleton rows={5} />
          </div> : isError ? <ErrorState error={error} onRetry={refetch} /> : notifications.length === 0 ? <div className="p-12">
            <EmptyState
    title="No Notifications in this Category"
    description="Your operations queue is completely up to date."
  />
          </div> : <div className="divide-y divide-slate-100">
            {notifications.map((item) => <div
      key={item._id}
      onClick={() => handleNotificationClick(item)}
      className={`p-4 flex items-start gap-4 transition-colors cursor-pointer hover:bg-slate-50 ${!item.isRead ? "bg-slate-50/50" : "bg-white"}`}
    >
                  <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex-shrink-0 mt-0.5">
                    {ICONS[notificationGroup(item.type)]}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${!item.isRead ? "text-slate-900" : "text-slate-700"}`}>
                          {item.title}
                        </span>
                        {!item.isRead && <span className="w-2 h-2 rounded-full bg-emerald-600 flex-shrink-0" />}
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 whitespace-nowrap">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.message}</p>

                    {item.actionUrl && <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#00130d] hover:underline">
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </div>}
                  </div>
                </div>)}
          </div>}

        <Pagination
    currentPage={page}
    totalItems={data?.meta?.total ?? 0}
    pageSize={pageSize}
    onPageChange={setPage}
    onPageSizeChange={(size) => {
      setPageSize(size);
      setPage(1);
    }}
  />
      </div>
    </div>;
};
