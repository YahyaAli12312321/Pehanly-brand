import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, LogOut, Shirt, X } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useAuth } from "../../hooks/useAuth";
import { NAV_SECTIONS } from "../../config/navigation";
import { healthApi } from "../../services/healthApi";
import { keys } from "../../lib/queryKeys";
import { initials, roleLabel } from "../../lib/permissions";

const navSectionClass = "px-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase select-none";
const linkClass = ({ isActive }) => `flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors font-medium ${isActive ? "bg-[#0f2922] text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`;
const childLinkClass = ({ isActive }) => `px-2 py-1 rounded text-xs transition-colors font-medium flex items-center justify-between ${isActive ? "bg-[#0f2922] text-white font-semibold" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`;

export const Sidebar = () => {
  const location = useLocation();
  const { sidebarOpenMobile, setSidebarOpenMobile } = useUIStore();
  const { user, can, isOwner, logout, isLoggingOut } = useAuth();
  const [catalogOpen, setCatalogOpen] = useState(true);
  const close = () => setSidebarOpenMobile(false);

  const { data: health, isError: healthDown } = useQuery({
    queryKey: keys.health,
    queryFn: healthApi.ready,
    refetchInterval: 60000,
    retry: false,
    staleTime: 30000,
  });
  const online = Boolean(health) && !healthDown;

  const visible = (item) => (item.ownerOnly ? isOwner : item.permission ? can(item.permission) : true);

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items
      .map((item) => (item.group ? { ...item, children: item.children.filter(visible) } : item))
      .filter((item) => (item.group ? item.children.length > 0 : visible(item))),
  })).filter((section) => (section.ownerOnly ? isOwner : true) && section.items.length > 0);

  return <>
      {sidebarOpenMobile && <div
    onClick={close}
    className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-xs transition-opacity"
  />}

      <aside
    className={`fixed left-0 top-0 h-screen w-64 bg-white z-50 flex flex-col justify-between border-r border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.03)] transition-transform duration-300 lg:translate-x-0 ${sidebarOpenMobile ? "translate-x-0" : "-translate-x-full"}`}
  >
        <div className="flex flex-col flex-1 min-h-0">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col gap-1 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-[#0f2922] flex items-center justify-center text-white font-bold text-sm tracking-wider">
                  P
                </div>
                <span className="text-base font-bold tracking-wider text-[#0f2922] uppercase font-sans">
                  PEHAN LY
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-[#cce9de] text-[#052019]">
                  PK Ops
                </span>
                <button
    type="button"
    onClick={close}
    className="p-1 rounded text-slate-400 hover:text-slate-700 lg:hidden"
    aria-label="Close menu"
  >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 tracking-wider uppercase pl-9 font-medium">
              Wear Your Identity
            </p>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-4 text-[13px] font-sans">
            {sections.map((section) => <div key={section.title} className="flex flex-col gap-1">
                <span className={navSectionClass}>{section.title}</span>
                {section.items.map((item) => {
    if (item.group) {
      const active = item.children.some((c) => location.pathname.startsWith(c.to));
      return <div key={item.label} className="flex flex-col gap-0.5">
                        <button
        type="button"
        onClick={() => setCatalogOpen(!catalogOpen)}
        className={`flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors text-left ${active ? "bg-slate-100 text-slate-900 font-semibold" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"}`}
      >
                          <div className="flex items-center gap-2.5">
                            <Shirt className="w-[18px] h-[18px] text-slate-500" />
                            <span>{item.label}</span>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${catalogOpen ? "rotate-180" : ""}`} />
                        </button>
                        {catalogOpen && <div className="pl-8 flex flex-col gap-0.5 mt-0.5">
                            {item.children.map((child) => <NavLink key={child.to} to={child.to} onClick={close} className={childLinkClass}>
                                <span>{child.label}</span>
                              </NavLink>)}
                          </div>}
                      </div>;
    }
    const Icon = item.icon;
    return <NavLink key={item.to} to={item.to} end={item.end} onClick={close} className={linkClass}>
                      <Icon className="w-[18px] h-[18px]" />
                      <span>{item.label}</span>
                    </NavLink>;
  })}
              </div>)}
            <div className="pb-4" />
          </nav>
        </div>

        <div className="shrink-0 flex flex-col border-t border-slate-200/80 bg-slate-50">
          <div className="px-3.5 pt-3 pb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5" title={online ? "API and database reachable" : "API is not responding"}>
              <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
              <span className="text-xs font-semibold text-slate-800">{online ? "API Online" : "API Offline"}</span>
            </div>
          </div>

          <div className="p-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#0f2922] text-white flex items-center justify-center font-bold text-xs shrink-0 ring-2 ring-emerald-600/20">
                {initials(user?.name)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-slate-900 truncate leading-tight">
                  {user?.name}
                </span>
                <span className="text-[11px] text-slate-500 truncate">{roleLabel(user)}</span>
              </div>
            </div>
            <button
    type="button"
    onClick={() => logout()}
    disabled={isLoggingOut}
    title="Sign out"
    aria-label="Sign out"
    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-50"
  >
              {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>
    </>;
};
