import { Drawer } from "../common/Drawer";
import { useUIStore } from "../../store/uiStore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "../../services/notificationsApi";
import { keys } from "../../lib/queryKeys";
import { errorMessage } from "../../lib/apiError";
import { timeAgo } from "../../lib/format";
import { notificationGroup } from "../../lib/notificationTypes";
import { useAuth } from "../../hooks/useAuth";
import { useToastStore } from "../../store/toastStore";
import { ErrorState } from "../common/ErrorState";
import { LoadingSkeleton } from "../common/LoadingSkeleton";
import { Check, ShoppingBag, Warehouse, FileSpreadsheet, CreditCard, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ICONS = {
  order: <ShoppingBag className="w-4 h-4 text-emerald-600" />,
  inventory: <Warehouse className="w-4 h-4 text-rose-600" />,
  b2b: <FileSpreadsheet className="w-4 h-4 text-[#0f2922]" />,
  payment: <CreditCard className="w-4 h-4 text-amber-600" />,
  other: <Info className="w-4 h-4 text-blue-600" />
};

export const NotificationsDrawer = () => {
  const { notificationsDrawerOpen, setNotificationsDrawerOpen } = useUIStore();
  const { isOwner } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const params = { limit: 20 };

  // Notifications are owner-only on the backend; staff never fire these requests.
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.notifications.list(params),
    queryFn: () => notificationsApi.list(params),
    enabled: isOwner && notificationsDrawerOpen
  });
  const notifications = data?.items ?? [];

  const onChanged = () => queryClient.invalidateQueries({ queryKey: keys.notifications.all });
  const markAllMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: onChanged,
    onError: (err) => addToast(errorMessage(err), "error")
  });
  const markReadMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: onChanged,
    onError: (err) => addToast(errorMessage(err), "error")
  });

  return <Drawer
    isOpen={notificationsDrawerOpen && isOwner}
    onClose={() => setNotificationsDrawerOpen(false)}
    title="Notifications & Activity"
    subtitle="Operational alerts, orders and B2B updates"
    badge={<span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
          {data?.unreadCount ?? 0} Unread
        </span>}
    headerActions={<button
      type="button"
      onClick={() => markAllMutation.mutate()}
      disabled={markAllMutation.isPending || !data?.unreadCount}
      className="text-xs text-[#0f2922] font-semibold hover:underline flex items-center gap-1 disabled:opacity-50 disabled:no-underline"
    >
          <Check className="w-3.5 h-3.5" />
          <span>Mark all read</span>
        </button>}
    footer={<div className="w-full flex items-center gap-2">
          <button
      type="button"
      onClick={() => {
        setNotificationsDrawerOpen(false);
        navigate("/notifications");
      }}
      className="flex-1 py-2.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors text-center"
    >
            View all
          </button>
          <button
      type="button"
      onClick={() => setNotificationsDrawerOpen(false)}
      className="flex-1 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors text-center"
    >
            Close
          </button>
        </div>}
  >
      <div className="flex flex-col gap-2.5">
        {isLoading ? <LoadingSkeleton rows={4} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : notifications.length === 0 ? <div className="py-12 text-center text-xs text-slate-400">No notifications right now</div> : notifications.map((notif) => <div
    key={notif._id}
    onClick={() => {
      if (!notif.isRead) markReadMutation.mutate(notif._id);
      if (notif.actionUrl) {
        setNotificationsDrawerOpen(false);
        navigate(notif.actionUrl);
      }
    }}
    className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${notif.isRead ? "bg-white border-slate-200/80 hover:bg-slate-50" : "bg-emerald-50/30 border-emerald-200/80 hover:bg-emerald-50/60"}`}
  >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  {ICONS[notificationGroup(notif.type)]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900 truncate">{notif.title}</h4>
                    <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                      {timeAgo(notif.createdAt)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{notif.message}</p>

                  {notif.actionUrl && <span className="text-[11px] text-[#0f2922] font-semibold hover:underline mt-2 inline-flex items-center gap-1">
                      View Details →
                    </span>}
                </div>
              </div>
            </div>)}
      </div>
    </Drawer>;
};
