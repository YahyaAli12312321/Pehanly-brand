import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search, X, ShoppingBag, Shirt, ArrowRight, FileText, Loader2 } from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useAuth } from "../../hooks/useAuth";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { productsApi } from "../../services/productsApi";
import { ordersApi } from "../../services/ordersApi";
import { customersApi } from "../../services/customersApi";
import { quotesApi } from "../../services/quotesApi";
import { formatMoney } from "../../lib/format";

const NAV = [["Products", "/products", "catalog.read"], ["Orders", "/orders", "orders.read"], ["Inventory", "/inventory", "inventory.read"], ["Quotes", "/quotes", "quotes.read"]];
const Section = ({ title, children }) => <div><span className="font-bold uppercase tracking-wider text-slate-400 text-[10px] px-2 block mb-1.5">{title}</span><div className="space-y-1">{children}</div></div>;
const Row = ({ onClick, icon, left, right }) => <div onClick={onClick} className="p-2 rounded-lg hover:bg-slate-50 cursor-pointer flex items-center justify-between gap-3 transition-colors"><div className="flex items-center gap-2.5 min-w-0"><div className="w-7 h-7 rounded bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">{icon}</div><div className="min-w-0 truncate">{left}</div></div>{right}</div>;

/** Global search (Ctrl/Cmd+K or "/"): live, debounced, server-side lookups limited to the modules the user may read. */
export const CommandPaletteModal = () => {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const { can } = useAuth();
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const dq = useDebouncedValue(query, 300).trim();
  const searching = commandPaletteOpen && dq.length >= 2;

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCommandPaletteOpen(!commandPaletteOpen); }
      else if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) && !e.target.isContentEditable) { e.preventDefault(); setCommandPaletteOpen(true); }
      else if (e.key === "Escape" && commandPaletteOpen) setCommandPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const products = useQuery({ queryKey: ["palette", "products", dq], queryFn: () => productsApi.list({ search: dq, limit: 4 }), enabled: searching && can("catalog.read") });
  const orders = useQuery({ queryKey: ["palette", "orders", dq], queryFn: () => ordersApi.list({ search: dq, limit: 4 }), enabled: searching && can("orders.read") });
  const customers = useQuery({ queryKey: ["palette", "customers", dq], queryFn: () => customersApi.list({ search: dq, limit: 3 }), enabled: searching && can("customers.read") });
  const quotes = useQuery({ queryKey: ["palette", "quotes", dq], queryFn: () => quotesApi.list({ search: dq, limit: 3 }), enabled: searching && can("quotes.read") });

  if (!commandPaletteOpen) return null;
  const go = (url) => { setCommandPaletteOpen(false); setQuery(""); navigate(url); };
  const pItems = products.data?.items || [], oItems = orders.data?.items || [], cItems = customers.data?.items || [], qItems = quotes.data?.items || [];
  const busy = [products, orders, customers, quotes].some((q) => q.isFetching);
  const none = searching && !busy && !pItems.length && !oItems.length && !cItems.length && !qItems.length;
  const failed = [products, orders, customers, quotes].some((q) => q.isError);

  return <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      <div onClick={() => setCommandPaletteOpen(false)} className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col animate-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input type="text" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products, orders, customers or quotes…" className="w-full text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none bg-transparent" />
          {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          <button type="button" onClick={() => setCommandPaletteOpen(false)} className="p-1 rounded text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4 text-xs">
          <Section title="Quick Navigation">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {NAV.filter(([, , perm]) => can(perm)).map(([label, url]) => <button key={url} type="button" onClick={() => go(url)} className="p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-800 text-left font-semibold flex items-center justify-between transition-colors"><span>{label}</span><ArrowRight className="w-3.5 h-3.5 text-slate-400" /></button>)}
            </div>
          </Section>
          {query.trim().length > 0 && !searching && <p className="text-slate-400 px-2">Type at least 2 characters to search.</p>}
          {failed && <p className="text-rose-600 px-2">Some results couldn't be loaded.</p>}
          {none && !failed && <p className="text-slate-400 px-2">No matches for “{dq}”.</p>}
          {pItems.length > 0 && <Section title="Products">{pItems.map((p) => <Row key={p._id} onClick={() => go(`/products/${p._id}`)} icon={<Shirt className="w-3.5 h-3.5" />} left={<span className="font-semibold text-slate-900">{p.name}</span>} right={p.summary?.priceMin != null && <span className="font-mono font-bold text-slate-800">{formatMoney(p.summary.priceMin)}</span>} />)}</Section>}
          {oItems.length > 0 && <Section title="Orders">{oItems.map((o) => <Row key={o._id} onClick={() => go(`/orders/${o._id}`)} icon={<ShoppingBag className="w-3.5 h-3.5" />} left={<><span className="font-mono font-bold text-slate-900">{o.orderNumber}</span><span className="text-slate-500 text-[11px] ml-2">{o.customer?.name}</span></>} right={<span className="font-mono font-bold text-emerald-800">{formatMoney(o.pricing?.total)}</span>} />)}</Section>}
          {cItems.length > 0 && <Section title="Customers">{cItems.map((c) => <Row key={c._id} onClick={() => go(`/customers/${c._id}`)} icon={<span className="font-bold text-[10px]">{(c.name || "?").substring(0, 2).toUpperCase()}</span>} left={<><span className="font-semibold text-slate-900">{c.name}</span><span className="text-slate-400 text-[11px] ml-2">{c.email}</span></>} right={<span className="text-slate-500 font-mono text-[11px]">{c.customerNumber}</span>} />)}</Section>}
          {qItems.length > 0 && <Section title="Quotes">{qItems.map((x) => <Row key={x._id} onClick={() => go(`/quotes/${x._id}`)} icon={<FileText className="w-3.5 h-3.5" />} left={<><span className="font-mono font-bold text-slate-900">{x.quoteNumber}</span><span className="text-slate-500 text-[11px] ml-2">{x.customer?.businessName || x.customer?.name}</span></>} right={<span className="font-mono font-bold text-slate-800">{formatMoney(x.pricing?.total)}</span>} />)}</Section>}
        </div>
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400"><span>Search runs against the live backend</span><span>Press ESC to close</span></div>
      </div>
    </div>;
};
