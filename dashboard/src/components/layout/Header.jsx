
import { useLocation } from "react-router-dom";
import { Search, Bell, Menu } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useQuery } from "@tanstack/react-query";
import { notificationsApi } from "../../services/notificationsApi";
import { useAuth } from "../../hooks/useAuth";
import { keys } from "../../lib/queryKeys";
import { findBreadcrumb } from "../../config/navigation";

export const Header = () => {
  const location = useLocation();

  const {
    toggleSidebarMobile,
    setCommandPaletteOpen,
    setNotificationsDrawerOpen
  } = useUIStore();

  const { isOwner } = useAuth();

  // Notifications are owner-only on the backend; staff never call them.
  const { data: unreadCount = 0 } = useQuery({
    queryKey: keys.notifications.unread,
    queryFn: notificationsApi.unreadCount,
    enabled: isOwner,
    refetchInterval: 60000
  });

  const breadcrumb = findBreadcrumb(location.pathname);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 shadow-xs backdrop-blur-md sm:px-8">

      {/* Mobile Menu & Breadcrumbs */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={toggleSidebarMobile}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 lg:hidden"
          title="Toggle Navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex min-w-0 items-center gap-1.5 truncate text-xs text-slate-500">
          <span className="hidden sm:inline">
            {breadcrumb.section}
          </span>
          <span className="hidden text-slate-300 sm:inline">/</span>
          <span className="truncate font-semibold text-slate-900">
            {breadcrumb.current}
          </span>
        </div>
      </div>

      {/* Search & Notifications */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">

        {/* Global Search */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="group relative flex h-8 w-9 items-center rounded-md border border-slate-200 bg-slate-50 text-left text-xs text-slate-400 shadow-2xs transition-all hover:bg-white hover:text-slate-600 sm:w-64 sm:pl-8 sm:pr-7"
          title="Search orders, SKUs..."
        >
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-[#0F2922]" />

          <span className="hidden truncate sm:inline">
            Search orders, SKUs...
          </span>

          <kbd className="absolute right-2 hidden rounded bg-slate-200/70 px-1 font-mono text-[10px] text-slate-400 sm:inline">
            ⌘K
          </kbd>
        </button>

        {/* Divider */}
        <div className="hidden h-4 w-px bg-slate-200 sm:block" />

        {/* Notifications (owner only) */}
        {isOwner && <button
          type="button"
          onClick={() => setNotificationsDrawerOpen(true)}
          className="relative rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#0F2922]"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />

          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
          )}
        </button>}

      </div>
    </header>
  );
};
