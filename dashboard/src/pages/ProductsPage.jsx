import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, Eye, Edit2, Package, Star, Loader2 } from "lucide-react";
import { productsApi } from "../services/productsApi";
import { categoriesApi } from "../services/categoriesApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { formatMoney, formatNumber } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { SearchInput } from "../components/common/SearchInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { Pagination } from "../components/common/Pagination";
import { Drawer } from "../components/common/Drawer";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { ProductEditor } from "../components/products/ProductEditor";

const selectCls = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";
const priceRange = (s) => (s?.priceMin == null ? "—" : s.priceMin === s.priceMax ? formatMoney(s.priceMin) : `${formatMoney(s.priceMin)} – ${formatNumber(s.priceMax)}`);

export const ProductsPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useAuth();
  const canManage = can("catalog.manage");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(searchParams.get("category") || "all");
  const [status, setStatus] = useState("all");
  const [stock, setStock] = useState("all");
  const [featured, setFeatured] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState([]);
  const [editor, setEditor] = useState({ open: false, id: null });
  const [detailId, setDetailId] = useState(routeId || null);
  const debouncedSearch = useDebouncedValue(search, 350);

  useEffect(() => {
    if (routeId) setDetailId(routeId);
  }, [routeId]);

  const params = {
    search: debouncedSearch.trim() || undefined,
    category: category === "all" ? undefined : category,
    status: status === "all" ? undefined : status,
    stock: stock === "all" ? undefined : stock,
    featured: featured === "all" ? undefined : featured,
    page,
    limit: pageSize,
  };
  const listQuery = useQuery({ queryKey: keys.products.list(params), queryFn: () => productsApi.list(params), placeholderData: keepPreviousData });
  const summaryQuery = useQuery({ queryKey: keys.products.summary, queryFn: productsApi.summary });
  const categoriesQuery = useQuery({
    queryKey: keys.categories.list({ limit: 100, sortBy: "name", forPicker: true }),
    queryFn: () => categoriesApi.list({ limit: 100, sortBy: "name" }),
  });
  const detailQuery = useQuery({ queryKey: keys.products.detail(detailId), queryFn: () => productsApi.get(detailId), enabled: !!detailId });

  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const categories = categoriesQuery.data?.items || [];
  const summary = summaryQuery.data;

  const resetPage = (setter) => (v) => {
    setter(v);
    setPage(1);
    setSelected([]);
  };

  const bulkMutation = useMutation({
    mutationFn: ({ ids, action }) => productsApi.bulk(ids, action),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: keys.products.all });
      const ok = res.updated?.length || 0;
      const failed = res.failed || [];
      if (failed.length) addToast(`${ok} updated, ${failed.length} failed: ${failed[0].reason}${failed.length > 1 ? " (+ more)" : ""}`, ok ? "info" : "error", "Bulk action");
      else addToast(`Updated ${ok} product${ok === 1 ? "" : "s"}.`);
      setSelected([]);
    },
    onError: (err) => addToast(errorMessage(err), "error"),
  });

  const allSelected = items.length > 0 && items.every((p) => selected.includes(p._id));
  const toggleAll = () => setSelected(allSelected ? [] : items.map((p) => p._id));
  const toggleOne = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const openDetail = (id) => {
    setDetailId(id);
    if (routeId !== id) navigate(`/products/${id}`, { replace: false });
  };
  const closeDetail = () => {
    setDetailId(null);
    if (routeId) navigate("/products");
  };
  const openEditor = (id = null) => setEditor({ open: true, id });
  const closeEditor = () => {
    setEditor({ open: false, id: null });
    queryClient.invalidateQueries({ queryKey: keys.products.all });
  };
  const clearCategoryParam = () => {
    if (searchParams.get("category")) setSearchParams({}, { replace: true });
  };

  const detail = detailQuery.data;
  const filtersActive = debouncedSearch || category !== "all" || status !== "all" || stock !== "all" || featured !== "all";

  return <div className="space-y-6">
      <PageHeader
    breadcrumb={[{ label: "Commerce" }, { label: "Products" }]}
    title="Products Catalog"
    description="Oversee products, multi-colour variants, nested size SKUs, retail pricing and wholesale eligibility."
    badge={<span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#e6f4ea] text-[#137333] border border-[#ceead6]">
            <Package className="w-3.5 h-3.5" />
            {summary ? `${summary.active} active of ${summary.total}` : "—"}
          </span>}
    actions={canManage ? <button onClick={() => openEditor(null)} className="inline-flex items-center gap-2 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold uppercase tracking-wider rounded-lg shadow-sm hover:bg-[#1a2634] transition-colors">
            <Plus className="w-4 h-4" />
            Add Product
          </button> : null}
  />

      {summary && (summary.draft > 0 || summary.lowStockSkus > 0 || summary.outOfStockSkus > 0) && <div className="flex flex-wrap items-center gap-2 text-xs">
          {summary.draft > 0 && <button type="button" onClick={() => resetPage(setStatus)("draft")} className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">{summary.draft} draft</button>}
          {summary.lowStockSkus > 0 && <button type="button" onClick={() => resetPage(setStock)("low")} className="px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">{summary.lowStockSkus} low-stock SKUs in {summary.lowStockProducts} products</button>}
          {summary.outOfStockSkus > 0 && <button type="button" onClick={() => resetPage(setStock)("out")} className="px-3 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 font-semibold">{summary.outOfStockSkus} out-of-stock SKUs in {summary.outOfStockProducts} products</button>}
        </div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="max-w-md w-full">
            <SearchInput value={search} onChange={resetPage(setSearch)} placeholder="Search by title, handle or SKU..." />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <select value={category} onChange={(e) => { clearCategoryParam(); resetPage(setCategory)(e.target.value); }} className={selectCls}>
              <option value="all">All Categories</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.parentCategory ? `${c.parentCategory.name} › ${c.name}` : c.name}</option>)}
            </select>
            <select value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} className={selectCls}>
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={stock} onChange={(e) => resetPage(setStock)(e.target.value)} className={selectCls}>
              <option value="all">Any Stock</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </select>
            <select value={featured} onChange={(e) => resetPage(setFeatured)(e.target.value)} className={selectCls}>
              <option value="all">Featured: Any</option>
              <option value="true">Featured</option>
              <option value="false">Not featured</option>
            </select>
          </div>
        </div>

        {canManage && selected.length > 0 && <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs flex-wrap">
            <span className="font-semibold text-slate-700">{selected.length} Selected:</span>
            {[["activate", "Publish", "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"], ["deactivate", "Deactivate", "bg-amber-100 text-amber-800 hover:bg-amber-200"], ["feature", "Feature", "bg-slate-100 text-slate-700 hover:bg-slate-200"], ["unfeature", "Unfeature", "bg-slate-100 text-slate-700 hover:bg-slate-200"]].map(([action, label, cls]) => <button key={action} disabled={bulkMutation.isPending} onClick={() => bulkMutation.mutate({ ids: selected, action })} className={`px-2 py-1 rounded font-medium transition-colors disabled:opacity-60 ${cls}`}>{label}</button>)}
            <button onClick={() => setSelected([])} className="px-2 py-1 text-slate-500 hover:text-slate-800">Clear</button>
          </div>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={6} /></div> : items.length === 0 ? <div className="p-12">
            <EmptyState
    title={filtersActive ? "No Products Match" : "No Products Yet"}
    description={filtersActive ? "No products match these filters. Adjust or clear them." : "Create your first product to start selling."}
    action={canManage && !filtersActive ? <button onClick={() => openEditor(null)} className="inline-flex items-center gap-2 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors"><Plus className="w-4 h-4" />Add Product</button> : null}
  />
          </div> : <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {canManage && <th className="py-3 px-4 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-slate-300 text-[#00130d] focus:ring-0 cursor-pointer" aria-label="Select all" /></th>}
                  <th className="py-3 px-4">Garment &amp; Handle</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Variants</th>
                  <th className="py-3 px-4">Retail Price (PKR)</th>
                  <th className="py-3 px-4">Wholesale</th>
                  <th className="py-3 px-4">Inventory Available</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {items.map((p) => {
    const isSel = selected.includes(p._id);
    const img = p.generalImages?.[0]?.url;
    return <tr key={p._id} className={`hover:bg-slate-50/70 transition-colors ${isSel ? "bg-emerald-50/30" : ""}`}>
                      {canManage && <td className="py-3.5 px-4"><input type="checkbox" checked={isSel} onChange={() => toggleOne(p._id)} className="rounded border-slate-300 text-[#00130d] focus:ring-0 cursor-pointer" aria-label={`Select ${p.name}`} /></td>}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {img ? <img src={img} alt={p.name} className="w-12 h-14 object-cover rounded-lg border border-slate-200 bg-slate-50 flex-shrink-0" /> : <div className="w-12 h-14 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center flex-shrink-0"><Package className="w-5 h-5 text-slate-300" /></div>}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900 hover:text-emerald-700 transition-colors cursor-pointer" onClick={() => openDetail(p._id)}>{p.name}</span>
                              {p.isFeatured && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{p.slug}</span>
                              <span className="text-[11px] text-slate-400">{p.skuCount} SKUs</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4"><div className="font-medium text-slate-800">{p.category?.name || "—"}</div></td>
                      <td className="py-3.5 px-4"><span className="text-[11px] text-slate-600">{p.variantsCount} {p.variantsCount === 1 ? "color" : "colors"}</span></td>
                      <td className="py-3.5 px-4"><div className="font-mono font-semibold text-slate-900">{priceRange(p)}</div></td>
                      <td className="py-3.5 px-4">{p.wholesale?.isEnabled ? <span className="text-[11px] font-medium text-emerald-800">MOQ {p.wholesale.moq} pcs</span> : <span className="text-[11px] text-slate-400">Retail only</span>}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-semibold ${p.availableStock <= 0 ? "text-rose-600" : p.lowStockSkus > 0 ? "text-amber-600" : "text-slate-900"}`}>{formatNumber(p.availableStock)} pcs</span>
                          {p.outOfStockSkus > 0 && <span className="text-[10px] text-rose-600">{p.outOfStockSkus} out</span>}
                          {p.lowStockSkus > 0 && <span className="text-[10px] text-amber-600">{p.lowStockSkus} low</span>}
                        </div>
                      </td>
                      <td className="py-3.5 px-4"><StatusBadge status={p.status} /></td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => openDetail(p._id)} title="Inspect product detail" className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"><Eye className="w-4 h-4" /></button>
                          {canManage && <button onClick={() => openEditor(p._id)} title="Open product editor" className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>;
  })}
              </tbody>
            </table>
          </div>}

        {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={(n) => { setPage(n); setSelected([]); }} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="product" labelPlural="products" />}
        {listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
      </div>

      {editor.open && <ProductEditor isOpen productId={editor.id} canManage={canManage} onClose={closeEditor} />}

      <Drawer
    isOpen={Boolean(detailId)}
    onClose={closeDetail}
    title={detail?.name || "Garment Detail"}
    subtitle={detail ? `Handle: ${detail.slug}` : ""}
    badge={detail && <StatusBadge status={detail.status} />}
    headerActions={detail && canManage && <button onClick={() => { const id = detail._id; closeDetail(); openEditor(id); }} className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg" title="Edit"><Edit2 className="w-4 h-4" /></button>}
  >
        {detailQuery.isLoading ? <LoadingSkeleton rows={4} /> : detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} /> : detail && <div className="space-y-6">
            <div className="aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center">
              {detail.generalImages?.[0]?.url ? <img src={detail.generalImages[0].url} alt={detail.name} className="w-full h-full object-cover" /> : <Package className="w-8 h-8 text-slate-300" />}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-400 block text-[10px]">Category</span><span className="font-semibold text-slate-800">{detail.category?.name || "—"}</span></div>
              <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-400 block text-[10px]">Available</span><span className="font-semibold text-slate-800">{formatNumber(detail.summary?.availableStock)} pcs</span></div>
              <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-400 block text-[10px]">Retail Price</span><span className="font-mono font-bold text-slate-900">{priceRange(detail.summary)}</span></div>
              <div className="p-3 bg-slate-50 rounded-lg"><span className="text-slate-400 block text-[10px]">Wholesale</span><span className="font-mono font-bold text-emerald-800">{detail.wholesale?.isEnabled ? `MOQ ${detail.wholesale.moq}` : "Retail only"}</span></div>
            </div>
            {detail.shortDescription && <p className="text-xs text-slate-600 leading-relaxed">{detail.shortDescription}</p>}
            {detail.readiness && !detail.readiness.ready && <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">{detail.readiness.issues.join(" ")}</div>}
            <div>
              <h5 className="text-xs font-bold text-slate-900 mb-2">Color Variants &amp; Stock Allocation</h5>
              {detail.variants?.length ? <div className="space-y-3">
                  {detail.variants.map((v) => <div key={v._id} className="p-3 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full border border-slate-300" style={{ backgroundColor: v.color?.hexCode || "#e2e8f0" }} />
                        <span className="text-xs font-bold text-slate-800">{v.color?.name}</span>
                        <span className="font-mono text-[10px] text-slate-400">{v.variantCode}</span>
                        {!v.isEnabled && <StatusBadge status="Disabled" size="sm" />}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                        {v.sizes.map((s) => <div key={s._id} className={`p-2 rounded border flex flex-col ${s.isEnabled ? "bg-slate-50 border-slate-100" : "bg-slate-50/50 border-dashed border-slate-200 opacity-70"}`}>
                            <span className="font-bold text-slate-800">{s.size}</span>
                            <span className="font-mono text-[9px] text-slate-400">{s.sku}</span>
                            <span className="font-mono font-semibold text-slate-700 mt-1">{s.available} in stock</span>
                            {s.stockStatus !== "ok" && <StatusBadge status={s.stockStatus === "out" ? "Out of stock" : "Low stock"} size="sm" className="mt-1" />}
                          </div>)}
                      </div>
                    </div>)}
                </div> : <p className="text-xs text-slate-500">No colour variants yet.</p>}
            </div>
          </div>}
      </Drawer>
    </div>;
};
