import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FolderTree, List, Plus, RotateCcw, MoreVertical, Check, Folder, CornerDownRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { categoriesApi } from "../services/categoriesApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { splitFormError } from "../lib/formErrors";
import { humanize } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { StatCard } from "../components/common/StatCard";
import { Drawer } from "../components/common/Drawer";
import { FormField } from "../components/common/FormField";
import { Select } from "../components/common/Select";
import { SearchInput } from "../components/common/SearchInput";
import { FilterSelect } from "../components/common/FilterSelect";
import { Toggle } from "../components/common/Toggle";
import { ImageUpload } from "../components/common/ImageUpload";
import { Pagination } from "../components/common/Pagination";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";

const DEFAULT_AUDIENCES = ["men", "women", "kids", "couples", "unisex"];
const TREE_LIMIT = 100; // backend max page size
const slugify = (v) => v.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
const EMPTY_FORM = { name: "", slug: "", description: "", image: null, parentCategory: "", audience: "men", showOnHome: true, isActive: true, sortOrder: 0 };
const inputCls = (bad) => `w-full h-9 px-3 rounded-lg bg-slate-50 border text-xs font-medium text-slate-900 focus:bg-white focus:outline-none ${bad ? "border-rose-400" : "border-slate-200"}`;

export const CategoriesPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can("catalog.manage");

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("tree");
  const [audience, setAudience] = useState("all");
  const [status, setStatus] = useState("all");
  const [home, setHome] = useState("all");
  const [sortBy, setSortBy] = useState("sortOrder");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const debouncedSearch = useDebouncedValue(search, 350);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [formErrors, setFormErrors] = useState({ fields: {}, general: "" });
  const [activeMenuId, setActiveMenuId] = useState(null);

  const isTree = viewMode === "tree";
  const filters = {
    search: debouncedSearch.trim() || undefined,
    status: status === "all" ? undefined : status,
    audience: audience === "all" ? undefined : audience,
    showOnHome: home === "all" ? undefined : home === "on" ? "true" : "false",
    sortBy,
    sortDir: "asc",
  };
  const listParams = isTree ? { ...filters, page: 1, limit: TREE_LIMIT } : { ...filters, page, limit: pageSize };

  const listQuery = useQuery({
    queryKey: keys.categories.list(listParams),
    queryFn: () => categoriesApi.list(listParams),
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({ queryKey: keys.categories.summary, queryFn: categoriesApi.summary });
  const audiencesQuery = useQuery({ queryKey: keys.categories.audiences, queryFn: categoriesApi.audiences });
  // Parent picker: top-level categories only (backend allows one level of nesting).
  const parentsQuery = useQuery({
    queryKey: keys.categories.list({ parent: "root", limit: 100, forPicker: true }),
    queryFn: () => categoriesApi.list({ parent: "root", limit: 100, sortBy: "name" }),
    enabled: drawerOpen,
  });

  const audienceOptions = useMemo(() => {
    const set = new Set([...DEFAULT_AUDIENCES, ...(audiencesQuery.data || [])]);
    return [...set];
  }, [audiencesQuery.data]);

  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const summary = summaryQuery.data;

  const displayed = useMemo(() => {
    if (!isTree) return items;
    const parents = items.filter((c) => !c.parentCategory);
    const ordered = [];
    parents.forEach((p) => {
      ordered.push(p);
      ordered.push(...items.filter((c) => c.parentCategory?._id === p._id));
    });
    // Children whose parent is filtered out of the result still need to show.
    ordered.push(...items.filter((c) => c.parentCategory && !parents.some((p) => p._id === c.parentCategory._id)));
    return ordered;
  }, [items, isTree]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.categories.all });

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) => (id ? categoriesApi.update(id, data) : categoriesApi.create(data)),
    onSuccess: (saved, vars) => {
      refresh();
      addToast(`Category "${saved.name}" ${vars.id ? "updated" : "created"}.`);
      if (vars.closeAfter !== false) closeDrawer();
    },
    onError: (err, vars) => {
      if (vars.inline) addToast(errorMessage(err), "error");
      else setFormErrors(splitFormError(err, "Could not save the category"));
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }) => categoriesApi.setStatus(id, isActive),
    onSuccess: (cat) => {
      refresh();
      addToast(`"${cat.name}" is now ${cat.isActive ? "active" : "inactive"}.`);
    },
    onError: (err) => addToast(errorMessage(err), "error"),
  });
  const homeMutation = useMutation({
    mutationFn: ({ id, showOnHome }) => categoriesApi.update(id, { showOnHome }),
    onSuccess: (cat) => {
      refresh();
      addToast(`${cat.showOnHome ? "Showcased" : "Hidden"} "${cat.name}" on the homepage.`);
    },
    onError: (err) => addToast(errorMessage(err), "error"),
  });

  const openDrawer = (cat) => {
    setActiveMenuId(null);
    setFormErrors({ fields: {}, general: "" });
    if (cat) {
      setEditing(cat);
      setSlugTouched(true);
      setForm({
        name: cat.name,
        slug: cat.slug,
        description: cat.description || "",
        image: cat.image || null,
        parentCategory: cat.parentCategory?._id || "",
        audience: cat.audience || "men",
        showOnHome: !!cat.showOnHome,
        isActive: !!cat.isActive,
        sortOrder: cat.sortOrder ?? 0,
      });
    } else {
      setEditing(null);
      setSlugTouched(false);
      setForm({ ...EMPTY_FORM, sortOrder: (summary?.total ?? 0) + 1 });
    }
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
  };
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const onName = (val) => set({ name: val, ...(slugTouched ? {} : { slug: slugify(val) }) });

  const handleSave = (e) => {
    e?.preventDefault();
    if (saveMutation.isPending) return;
    const fields = {};
    if (form.name.trim().length < 2) fields.name = "Name must be at least 2 characters";
    if (form.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) fields.slug = "Use lowercase letters, numbers and hyphens";
    if (Object.keys(fields).length) return setFormErrors({ fields, general: "Please fix the highlighted fields." });
    setFormErrors({ fields: {}, general: "" });
    saveMutation.mutate({ id: editing?._id, data: form });
  };

  const resetFilters = () => {
    setSearch("");
    setAudience("all");
    setStatus("all");
    setHome("all");
    setSortBy("sortOrder");
    setPage(1);
  };
  const withReset = (setter) => (v) => {
    setter(v);
    setPage(1);
  };

  const totalShown = displayed.length;
  const totalAll = summary?.total;
  const fe = formErrors.fields;

  return <div className="space-y-6" onClick={() => activeMenuId && setActiveMenuId(null)}>
      <PageHeader
    breadcrumb={[{ label: "Catalog" }, { label: "Categories" }]}
    title="Categories"
    description="Organize and manage retail product categories, slugs and hierarchy."
    actions={canManage ? <button
      type="button"
      onClick={() => openDrawer()}
      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0f2922] text-white hover:bg-[#1a3d34] rounded-lg text-xs font-semibold transition-all shadow-xs active:scale-95"
    >
            <Plus className="w-4 h-4" />
            <span>Add Category</span>
          </button> : null}
  />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
    label="Total Categories"
    value={summary ? summary.total : "—"}
    subtext={summary ? `${summary.topLevel} top level, ${summary.total - summary.topLevel} subcategories` : summaryQuery.isError ? "Couldn't load" : "Loading…"}
    icon={<FolderTree className="w-4 h-4 text-[#0f2922]" />}
  />
        <StatCard
    label="Active Categories"
    value={summary ? summary.active : "—"}
    badge={<span className="inline-flex items-center gap-1 text-xs text-emerald-800 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />Live
          </span>}
    subtext="Visible across customer storefront"
    icon={<Check className="w-4 h-4 text-emerald-700" />}
  />
        <StatCard
    label="Featured on Home"
    value={summary ? summary.showOnHome : "—"}
    subtext="Shown in homepage carousel grid"
    icon={<Eye className="w-4 h-4 text-[#0f2922]" />}
  />
        <StatCard
    label="Hidden Categories"
    value={summary ? summary.inactive : "—"}
    subtext="Hidden from storefront navigation"
    icon={<EyeOff className="w-4 h-4 text-slate-400" />}
  />
      </div>

      <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 max-w-2xl">
          <SearchInput
    value={search}
    onChange={withReset(setSearch)}
    placeholder="Search categories or slugs..."
    shortcut={null}
    className="flex-1"
  />
          <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200 shrink-0 text-xs">
            {[["tree", "Tree View", FolderTree], ["flat", "List View", List]].map(([mode, label, Icon]) => <button
      key={mode}
      type="button"
      onClick={() => setViewMode(mode)}
      className={`px-3 py-1 rounded font-semibold transition-all flex items-center gap-1.5 ${viewMode === mode ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"}`}
    >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
    value={audience}
    onChange={withReset(setAudience)}
    options={[{ value: "all", label: "All Audiences" }, ...audienceOptions.map((a) => ({ value: a, label: humanize(a) }))]}
  />
          <FilterSelect
    value={status}
    onChange={withReset(setStatus)}
    options={[{ value: "all", label: "All Status" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
  />
          <FilterSelect
    value={home}
    onChange={withReset(setHome)}
    options={[{ value: "all", label: "Home: All" }, { value: "on", label: "Shown on Home" }, { value: "off", label: "Hidden from Home" }]}
  />
          <FilterSelect
    value={sortBy}
    onChange={withReset(setSortBy)}
    options={[{ value: "sortOrder", label: "Sort Order" }, { value: "name", label: "Name (A-Z)" }, { value: "createdAt", label: "Oldest first" }]}
  />
          <button
    type="button"
    onClick={resetFilters}
    className="h-9 w-9 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-800"
    title="Reset Filters"
  >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} /> : listQuery.isLoading ? <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs"><LoadingSkeleton rows={6} /></div> : <>
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              <span>
                Showing {totalShown} {isTree ? "categories" : `of ${meta?.total ?? totalShown} matching`}{totalAll !== undefined ? ` · ${totalAll} total` : ""}
              </span>
              {listQuery.isFetching && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            </div>
            {isTree && meta && meta.total > TREE_LIMIT && <span className="text-amber-700">Tree view shows the first {TREE_LIMIT}. Use List View for the rest.</span>}
          </div>

          {displayed.length === 0 ? <EmptyState
    title={debouncedSearch || audience !== "all" || status !== "all" || home !== "all" ? "No categories match these filters" : "No categories yet"}
    description={canManage ? "Create your first category to start organising products." : undefined}
    action={canManage && !debouncedSearch ? <button type="button" onClick={() => openDrawer()} className="px-4 py-2 bg-[#0f2922] text-white rounded-lg text-xs font-semibold">Add Category</button> : null}
  /> : <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold text-[11px] h-9">
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-4">Category</th>
                      <th className="py-2.5 px-3">Parent</th>
                      <th className="py-2.5 px-3">Audience</th>
                      <th className="py-2.5 px-3 text-right">Products</th>
                      <th className="py-2.5 px-3 text-center">Home Showcase</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center w-24">Order</th>
                      {canManage && <th className="py-2.5 px-4 text-right w-16">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayed.map((cat, idx) => {
    const isChild = Boolean(cat.parentCategory) && isTree;
    const rowNo = isTree ? idx + 1 : ((meta?.page || 1) - 1) * (meta?.limit || pageSize) + idx + 1;
    return <tr key={cat._id} className={`hover:bg-slate-50/70 transition-colors ${!cat.isActive ? "opacity-70 bg-slate-50/30" : ""}`}>
                          <td className="py-3 px-3 text-center font-mono text-slate-400">{rowNo}</td>
                          <td className="py-3 px-4">
                            <div className={`flex items-center gap-3 ${isChild ? "pl-6 relative" : ""}`}>
                              {isChild && <div className="absolute left-1 top-0 bottom-1/2 w-3.5 border-l-2 border-b-2 border-slate-200 rounded-bl-sm" />}
                              <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0 shadow-2xs flex items-center justify-center">
                                {cat.image?.url ? <img src={cat.image.url} alt={cat.name} className="w-full h-full object-cover" /> : <Folder className="w-4 h-4 text-slate-400" />}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                                  {cat.name}
                                  {!cat.parentCategory ? <Folder className="w-3.5 h-3.5 text-[#0f2922]" /> : <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">Sub</span>}
                                </span>
                                <span className="font-mono text-[11px] text-slate-400 truncate">/shop/category/{cat.slug}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {cat.parentCategory ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                                <CornerDownRight className="w-3 h-3 text-[#0f2922]" />
                                <span>{cat.parentCategory.name}</span>
                              </span> : <span className="text-slate-400 font-medium">— (Top Level)</span>}
                          </td>
                          <td className="py-3 px-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-semibold text-[11px]">{humanize(cat.audience)}</span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
      type="button"
      onClick={() => navigate(`/products?category=${cat._id}`)}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono font-bold hover:bg-slate-200 transition-colors"
    >
                              <span>{cat.productsCount ?? 0}</span>
                              <span className="text-slate-400 text-[10px] font-normal">items</span>
                            </button>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
      type="button"
      disabled={!canManage || homeMutation.isPending}
      onClick={() => homeMutation.mutate({ id: cat._id, showOnHome: !cat.showOnHome })}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all disabled:cursor-default ${cat.showOnHome ? "bg-[#0f2922] text-white shadow-xs" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
    >
                              <span className={`w-1.5 h-1.5 rounded-full ${cat.showOnHome ? "bg-emerald-400" : "bg-slate-400"}`} />
                              <span>{cat.showOnHome ? "Shown" : "Hidden"}</span>
                            </button>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
      type="button"
      disabled={!canManage || statusMutation.isPending}
      onClick={() => statusMutation.mutate({ id: cat._id, isActive: !cat.isActive })}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors disabled:cursor-default ${cat.isActive ? "bg-[#cce9de] text-[#052019]" : "bg-slate-100 text-slate-500"}`}
    >
                              <span className={`w-1.5 h-1.5 rounded-full ${cat.isActive ? "bg-emerald-600" : "bg-slate-400"}`} />
                              <span>{cat.isActive ? "Active" : "Inactive"}</span>
                            </button>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <input
      key={`${cat._id}-${cat.sortOrder}`}
      type="number"
      min={0}
      disabled={!canManage}
      defaultValue={cat.sortOrder}
      onBlur={(e) => {
        const val = Math.max(0, Math.round(Number(e.target.value)));
        if (Number.isFinite(val) && val !== cat.sortOrder) {
          saveMutation.mutate({ id: cat._id, data: { sortOrder: val }, inline: true, closeAfter: false });
        }
      }}
      className="w-14 h-7 text-center rounded bg-slate-50 border border-slate-200 text-slate-800 font-mono text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0f2922] disabled:opacity-60"
    />
                          </td>
                          {canManage && <td className="py-3 px-4 text-right relative">
                              <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setActiveMenuId(activeMenuId === cat._id ? null : cat._id);
      }}
      className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
      aria-label={`Actions for ${cat.name}`}
    >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                              {activeMenuId === cat._id && <div className="absolute right-4 top-10 w-44 rounded-xl bg-white shadow-xl border border-slate-200 py-1 z-30 text-left text-xs" onClick={(e) => e.stopPropagation()}>
                                  <button type="button" onClick={() => openDrawer(cat)} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700">Edit Category</button>
                                  <button type="button" onClick={() => navigate(`/products?category=${cat._id}`)} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700">View Products</button>
                                </div>}
                            </td>}
                        </tr>;
  })}
                  </tbody>
                </table>
              </div>
              {!isTree && meta && <Pagination
    currentPage={meta.page}
    totalItems={meta.total}
    pageSize={meta.limit}
    onPageChange={setPage}
    onPageSizeChange={(n) => {
      setPageSize(n);
      setPage(1);
    }}
    labelSingular="category"
    labelPlural="categories"
  />}
            </div>}
        </>}

      <Drawer
    isOpen={drawerOpen}
    onClose={closeDrawer}
    title={editing ? `Edit Category: ${editing.name}` : "Add Category"}
    subtitle={editing ? `Update taxonomy, routing, and storefront precedence for ${editing.name}` : "Create a new top-level or nested subcategory in the retail catalog"}
    badge={<span className="px-2 py-0.5 rounded-full bg-[#cce9de] text-[#052019] text-xs font-semibold">{form.parentCategory ? "Subcategory" : "Parent Category"}</span>}
    footer={<>
          <button type="button" onClick={closeDrawer} disabled={saveMutation.isPending} className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saveMutation.isPending} className="px-5 py-2.5 rounded-lg bg-[#0f2922] text-white hover:bg-[#1a3d34] disabled:opacity-60 text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5">
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{saveMutation.isPending ? "Saving…" : "Save Category"}</span>
          </button>
        </>}
  >
        <form onSubmit={handleSave} className="space-y-4">
          {formErrors.general && <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-xs text-rose-700 font-medium" role="alert">{formErrors.general}</div>}

          <FormField label="Category Name" required error={fe.name}>
            <input type="text" value={form.name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Hoodies, Graphic Tees, Eastern Pret..." className={inputCls(fe.name)} maxLength={120} />
          </FormField>

          <FormField label="URL Slug" hint="Used for clean SEO canonicalization and website navigation routing." error={fe.slug}>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-400 font-mono text-xs select-none">/shop/category/</span>
              <input
    type="text"
    value={form.slug}
    onChange={(e) => {
      setSlugTouched(true);
      set({ slug: e.target.value.toLowerCase() });
    }}
    className={`${inputCls(fe.slug)} pl-32 font-mono`}
    maxLength={80}
  />
            </div>
          </FormField>

          <FormField label="Storefront Description" error={fe.description}>
            <textarea rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000} placeholder="Describe fabrics, seasonal positioning, and fit for retail shoppers..." className="w-full p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:bg-white focus:outline-none resize-none leading-relaxed" />
          </FormField>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <span className="font-semibold text-slate-800 text-xs block">Category Header Image</span>
            <ImageUpload value={form.image} onChange={(image) => set({ image })} purpose="category_image" label="Image" error={fe["image.url"] || fe.image} />
            <span className="text-[11px] text-slate-400 block">1:1 square ratio recommended for menus</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Parent Category" error={fe.parentCategory}>
              <Select value={form.parentCategory} onChange={(e) => set({ parentCategory: e.target.value })}>
                <option value="">None — Top Level Category</option>
                {(parentsQuery.data?.items || []).filter((c) => c._id !== editing?._id).map((p) => <option key={p._id} value={p._id}>↳ {p.name}</option>)}
              </Select>
            </FormField>
            <FormField label="Target Audience" error={fe.audience}>
              <Select value={form.audience} onChange={(e) => set({ audience: e.target.value })} options={audienceOptions.map((a) => ({ value: a, label: humanize(a) }))} />
            </FormField>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
            <div>
              <span className="font-semibold text-xs text-slate-900 block">Showcase on Homepage</span>
              <p className="text-[11px] text-slate-500 mt-0.5">Display this category in the consumer home collection carousel</p>
            </div>
            <Toggle checked={form.showOnHome} onChange={(v) => set({ showOnHome: v })} label="Showcase on homepage" />
          </div>

          <FormField label="Catalog Status">
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
              {[[true, "Active (Live)", "bg-emerald-600"], [false, "Inactive", "bg-slate-400"]].map(([val, label, dot]) => <button
      key={label}
      type="button"
      onClick={() => set({ isActive: val })}
      className={`py-1.5 rounded-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${form.isActive === val ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"}`}
    >
                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  <span>{label}</span>
                </button>)}
            </div>
          </FormField>

          <FormField label="Navigation Precedence (Sort Order)" hint="Lower numbers appear first in the customer mega-menu." error={fe.sortOrder}>
            <input type="number" min={0} max={100000} value={form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} className="w-24 h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-center focus:bg-white focus:outline-none" />
          </FormField>
        </form>
      </Drawer>
    </div>;
};
