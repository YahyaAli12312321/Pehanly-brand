import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Shirt } from "lucide-react";
import { Drawer } from "../common/Drawer";
import { SearchInput } from "../common/SearchInput";
import { LoadingSkeleton } from "../common/LoadingSkeleton";
import { ErrorState } from "../common/ErrorState";
import { useUIStore } from "../../store/uiStore";
import { useAuth } from "../../hooks/useAuth";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { inventoryApi } from "../../services/inventoryApi";
import { keys } from "../../lib/queryKeys";
import { formatNumber } from "../../lib/format";

const FILTERS = [["low", "All alerts"], ["out", "Out of stock"], ["critical", "Critical"]];

/** Stock alerts come from GET /admin/inventory?filter=… (filter=low means low + out). Restocking is done on the Inventory page via a stock adjustment. */
export const InventoryAlertsDrawer = () => {
  const { inventoryAlertsOpen, setInventoryAlertsOpen } = useUIStore();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("low");
  const [search, setSearch] = useState("");
  const dq = useDebouncedValue(search, 350);
  const params = { filter, search: dq.trim() || undefined, limit: 25 };
  const q = useQuery({ queryKey: [...keys.inventory.lists(), "alerts-drawer", params], queryFn: () => inventoryApi.list(params), enabled: inventoryAlertsOpen && can("inventory.read") });
  const items = q.data?.items || [];
  const total = q.data?.meta?.total;
  const go = (to) => { setInventoryAlertsOpen(false); navigate(to); };

  return <Drawer isOpen={inventoryAlertsOpen} onClose={() => setInventoryAlertsOpen(false)} title="Inventory Alerts" subtitle="Available = On-Hand − Reserved Orders"
      badge={<span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 font-semibold text-xs">{total ?? "…"} Items Alert</span>}
      footer={<>
        <button type="button" onClick={() => go(`/inventory?filter=${filter}`)} className="flex-1 py-2.5 rounded-lg bg-[#0f2922] text-white hover:bg-[#1a3d34] text-xs font-semibold transition-colors text-center shadow-xs">Open Inventory</button>
        <button type="button" onClick={() => setInventoryAlertsOpen(false)} className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors">Close</button>
      </>}>
      {!can("inventory.read") ? <p className="text-xs text-slate-500">You don't have access to inventory.</p> : <>
        <SearchInput value={search} onChange={setSearch} placeholder="Search SKU or product..." />
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {FILTERS.map(([id, label]) => <button key={id} type="button" onClick={() => setFilter(id)} className={`px-3 py-1 rounded-md font-semibold transition-colors ${filter === id ? "bg-[#0f2922] text-white shadow-xs" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>)}
        </div>
        {q.isLoading ? <LoadingSkeleton rows={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : items.length === 0 ? <p className="text-xs text-slate-500 py-8 text-center">No stock alerts match.</p> : <div className="flex flex-col gap-2.5">
            {items.map((i) => <div key={i.sku} onClick={() => go(`/inventory?search=${encodeURIComponent(i.sku)}`)} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 cursor-pointer flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0"><Shirt className="w-4 h-4 text-slate-500" /></div>
                <div className="flex-1 min-w-0"><div className="text-xs font-bold text-slate-900 truncate">{i.product?.name}</div><div className="text-[11px] text-slate-500 truncate">{[i.variant?.colorName, i.size].filter(Boolean).join(" · ")} · <span className="font-mono">{i.sku}</span></div></div>
                <div className="text-right shrink-0"><div className={`text-xs font-bold ${i.available <= 0 ? "text-rose-700" : "text-amber-700"}`}>{i.available <= 0 ? "Out of stock" : `${formatNumber(i.available)} left`}</div><div className="text-[10px] text-slate-400">on hand {formatNumber(i.stock)} · reserved {formatNumber(i.reservedStock)}</div></div>
              </div>)}
            {total > items.length && <p className="text-[11px] text-slate-400 text-center">Showing {items.length} of {total}. Open Inventory to see the rest.</p>}
          </div>}
      </>}
    </Drawer>;
};
