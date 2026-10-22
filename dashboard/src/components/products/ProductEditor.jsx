import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { productsApi } from "../../services/productsApi";
import { categoriesApi } from "../../services/categoriesApi";
import { keys } from "../../lib/queryKeys";
import { useToastStore } from "../../store/toastStore";
import { errorMessage, toApiError } from "../../lib/apiError";
import { splitFormError } from "../../lib/formErrors";
import { Modal } from "../common/Modal";
import { FormField } from "../common/FormField";
import { ImageGalleryUpload } from "../common/ImageGalleryUpload";
import { ErrorState } from "../common/ErrorState";
import { LoadingSkeleton } from "../common/LoadingSkeleton";
import { VariantCard } from "./VariantCard";
import { countUnsaved, isUnsaved, newVariantDraft, validateVariant, variantToDraft } from "./variantDraft";

const EDITOR_STEPS = ["Basic Info", "Category & Flags", "Images", "Color Variants", "Sizes & SKUs", "Wholesale & Pricing", "SEO & Publish"];
const input = (bad) => `w-full text-xs px-3 py-2 bg-slate-50 border rounded-lg focus:ring-1 focus:ring-[#00130d] outline-none ${bad ? "border-rose-400" : "border-slate-200"}`;
const slugify = (v) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const EMPTY = {
  name: "", slug: "", shortDescription: "", description: "", category: "", generalImages: [],
  isFeatured: false, isNewArrival: false, isBestSeller: false,
  wholesaleEnabled: false, wholesaleMoq: 12, seoTitle: "", seoDescription: "", status: "draft",
};

const fromProduct = (p) => ({
  name: p.name || "", slug: p.slug || "", shortDescription: p.shortDescription || "", description: p.description || "",
  category: p.category?._id || p.category || "", generalImages: p.generalImages || [],
  isFeatured: !!p.isFeatured, isNewArrival: !!p.isNewArrival, isBestSeller: !!p.isBestSeller,
  wholesaleEnabled: !!p.wholesale?.isEnabled, wholesaleMoq: p.wholesale?.moq || 12,
  seoTitle: p.seo?.title || "", seoDescription: p.seo?.description || "", status: p.status || "draft",
});

/** Map a backend 422/400 on a variant onto the draft: "sizes.2.price" -> that row, everything else -> general. */
function variantServerErrors(err, draft) {
  const e = toApiError(err);
  const skus = {};
  const server = [];
  const fe = e.fieldErrors;
  const entries = Object.entries(fe);
  if (!entries.length) return { server: [e.message], skus };
  for (const [path, msg] of entries) {
    const m = path.match(/^sizes\.(\d+)\.(.+)$/);
    const row = m ? draft.sizes[Number(m[1])] : null;
    if (row && !skus[row.key]) skus[row.key] = `${m[2]}: ${msg}`;
    else server.push(path ? `${path}: ${msg}` : msg);
  }
  return { server, skus };
}

export const ProductEditor = ({ isOpen, productId, canManage, onClose }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [step, setStep] = useState(0);
  const [currentId, setCurrentId] = useState(productId);
  const [form, setForm] = useState(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [formErrors, setFormErrors] = useState({ fields: {}, general: "" });
  const [drafts, setDrafts] = useState([]);
  const [variantErrors, setVariantErrors] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const loadedFor = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setCurrentId(productId);
    setFormErrors({ fields: {}, general: "" });
    setVariantErrors({});
    loadedFor.current = null;
    if (!productId) {
      setForm(EMPTY);
      setDrafts([]);
      setSlugTouched(false);
    }
  }, [isOpen, productId]);

  const detailQuery = useQuery({
    queryKey: keys.products.detail(currentId),
    queryFn: () => productsApi.get(currentId),
    enabled: isOpen && !!currentId,
    refetchOnMount: "always",
  });
  const categoriesQuery = useQuery({
    queryKey: keys.categories.list({ limit: 100, sortBy: "name", forPicker: true }),
    queryFn: () => categoriesApi.list({ limit: 100, sortBy: "name" }),
    enabled: isOpen,
  });
  const detail = detailQuery.data;

  // Load server data into the form once per product (never clobber unsaved edits on refetch).
  useEffect(() => {
    if (!detail || loadedFor.current === detail._id || !detailQuery.isFetchedAfterMount) return;
    loadedFor.current = detail._id;
    setForm(fromProduct(detail));
    setSlugTouched(true);
    setDrafts((detail.variants || []).map(variantToDraft));
  }, [detail, detailQuery.isFetchedAfterMount]);

  const categories = categoriesQuery.data?.items || [];
  const categoryLabel = (c) => (c.parentCategory ? `${c.parentCategory.name} › ${c.name}` : c.name);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const fe = formErrors.fields;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.products.all });
    queryClient.invalidateQueries({ queryKey: keys.inventory.all });
    queryClient.invalidateQueries({ queryKey: keys.categories.all });
  };

  const validateBasics = () => {
    const f = {};
    if (form.name.trim().length < 2) f.name = "Name must be at least 2 characters";
    if (form.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug)) f.slug = "Use lowercase letters, numbers and hyphens";
    if (!form.category) f.category = "Choose a category";
    if (form.shortDescription.length > 300) f.shortDescription = "Max 300 characters";
    if (form.wholesaleEnabled && !(Number(form.wholesaleMoq) >= 1)) f["wholesale.moq"] = "MOQ must be at least 1";
    return f;
  };

  const saveProduct = useMutation({
    mutationFn: async ({ create }) => {
      const saved = create ? await productsApi.create(form) : await productsApi.update(currentId, form);
      return saved;
    },
    onError: (err) => setFormErrors(splitFormError(err, "Could not save the product")),
  });

  const statusMutation = useMutation({
    mutationFn: (status) => productsApi.setStatus(currentId, status),
  });

  // Synchronous re-entrancy guard: "Save Product" now runs several requests, a double click must not repeat them.
  const savingAll = useRef(false);
  const runSave = async (opts) => {
    if (savingAll.current) return;
    savingAll.current = true;
    try {
      await runSaveInner(opts);
    } finally {
      savingAll.current = false;
    }
  };

  const runSaveInner = async ({ create, advance, finish }) => {
    if (saveProduct.isPending || statusMutation.isPending) return;
    const f = validateBasics();
    if (Object.keys(f).length) {
      setFormErrors({ fields: f, general: "Please fix the highlighted fields." });
      setStep(f.category ? 1 : f["wholesale.moq"] ? 5 : 0);
      return;
    }
    // Validate every unsaved colour variant BEFORE anything is written, so a typo cannot leave a half-saved product.
    const pending = finish && !create ? drafts.filter(isUnsaved) : [];
    if (pending.length) {
      const bad = pending.filter((d) => !validateVariant(d).ok);
      if (bad.length) {
        const map = {};
        bad.forEach((d) => { const v = validateVariant(d); map[d.key] = { general: v.general, skus: v.skus }; });
        setVariantErrors((m) => ({ ...m, ...map }));
        setFormErrors({ fields: {}, general: `Fix ${bad.length} colour variant${bad.length > 1 ? "s" : ""} before saving: nothing was saved.` });
        setStep(4);
        return;
      }
    }
    setFormErrors({ fields: {}, general: "" });
    try {
      const saved = await saveProduct.mutateAsync({ create });
      let latest = saved;
      if (create) {
        loadedFor.current = saved._id; // keep the typed form; variants start empty
        setCurrentId(saved._id);
        setDrafts([]);
        queryClient.setQueryData(keys.products.detail(saved._id), saved);
        addToast(`Draft "${saved.name}" created. Now add colour variants.`);
      }
      // Persist every unsaved colour variant + SKU (+ initial stock) through the variant endpoints, one by one.
      if (pending.length) {
        let done = 0;
        for (const d of pending) {
          const r = await persistVariant(d, latest._id);
          if (!r.ok) {
            invalidate();
            queryClient.invalidateQueries({ queryKey: keys.products.detail(latest._id) });
            setFormErrors({
              fields: {},
              general: `Product details were saved, but only ${done} of ${pending.length} colour variants were saved. "${d.color.name || "Unnamed colour"}" failed: ${r.message}. Nothing was rolled back; fix it and save again.`,
            });
            setStep(4);
            return;
          }
          done += 1;
        }
        invalidate();
      }
      if (finish && form.status !== latest.status) {
        try {
          latest = await statusMutation.mutateAsync(form.status);
        } catch (err) {
          invalidate();
          setFormErrors({ fields: {}, general: errorMessage(err, "Could not change the status") });
          setStep(6);
          return;
        }
      }
      invalidate();
      queryClient.setQueryData(keys.products.detail(latest._id), (old) => ({ ...(old || {}), ...latest, variants: old?.variants ?? latest.variants }));
      if (finish) {
        addToast(`Product "${latest.name}" saved${pending.length ? ` with ${pending.length} colour variant${pending.length > 1 ? "s" : ""}` : ""}.`);
        onClose();
      } else if (advance) {
        setStep((s) => s + 1);
      } else if (!create) {
        addToast("Product details saved.");
      }
    } catch {
      /* surfaced through onError */
    }
  };

  /**
   * Saves ONE colour variant through the real endpoints (POST/PATCH /admin/products/:id/variants[/:variantId]).
   * The backend writes the variant, its SKUs and - for NEW SKUs - the opening stock + "Initial stock" ledger
   * entry in a single transaction, so a variant is saved completely or not at all.
   * Returns { ok: true, saved } or { ok: false, message }. Never throws.
   */
  const persistVariant = async (draft, productId = currentId) => {
    const v = validateVariant(draft);
    if (!v.ok) {
      setVariantErrors((m) => ({ ...m, [draft.key]: { general: v.general, skus: v.skus } }));
      return { ok: false, message: [...v.general, ...Object.values(v.skus)][0] || "Fix the highlighted fields" };
    }
    setVariantErrors((m) => ({ ...m, [draft.key]: {} }));
    setSavingKey(draft.key);
    try {
      const saved = draft.isNew ? await productsApi.createVariant(productId, draft) : await productsApi.updateVariant(productId, draft.id, draft);
      setDrafts((list) => list.map((d) => (d.key === draft.key ? variantToDraft(saved) : d)));
      setVariantErrors((m) => {
        const { [draft.key]: _gone, ...rest } = m;
        return rest;
      });
      return { ok: true, saved };
    } catch (err) {
      setVariantErrors((m) => ({ ...m, [draft.key]: variantServerErrors(err, draft) }));
      return { ok: false, message: errorMessage(err, "Could not save the variant") };
    } finally {
      setSavingKey(null);
    }
  };

  const saveVariant = async (draft) => {
    if (!currentId || savingKey) return;
    const r = await persistVariant(draft);
    if (r.ok) {
      addToast(`${r.saved.color?.name || "Variant"} ${draft.isNew ? "created" : "saved"}.`);
      invalidate();
      detailQuery.refetch(); // refresh readiness / summary
    } else {
      addToast(r.message, "error");
    }
  };

  const updateDraft = (next) => setDrafts((list) => list.map((d) => (d.key === next.key ? { ...next, dirty: true } : d)));
  const removeDraft = (key) => setDrafts((list) => list.filter((d) => !(d.key === key && d.isNew)));
  const unsavedCount = countUnsaved(drafts);
  // Closing with unsaved colour variants/SKUs would silently drop them (and their initial stock): ask first.
  const requestClose = () => {
    if (unsavedCount > 0 && !window.confirm(`You have ${unsavedCount} unsaved colour variant${unsavedCount > 1 ? "s" : ""} (with their sizes, prices and initial stock). Close and discard ${unsavedCount > 1 ? "them" : "it"}?`)) return;
    onClose();
  };
  const addVariant = () => setDrafts((list) => [...list, newVariantDraft(list.length)]);
  const needsProduct = !currentId;
  const working = saveProduct.isPending || statusMutation.isPending || !!savingKey;
  const title = currentId ? `Edit Product: ${form.name || detail?.name || ""}` : "Create Master Product";
  const readiness = detail?.readiness;

  const variantsSection = (section) => (
    <div className="space-y-3">
      {needsProduct ? <div className="p-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-600 space-y-3">
          <p>Colour variants and SKUs are saved against the product, so the product is first created as a <strong>draft</strong> (it is not visible in the store until you publish it).</p>
          {canManage && <button type="button" disabled={working} onClick={() => runSave({ create: true, advance: false })} className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60">
              {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Create draft now
            </button>}
        </div> : detailQuery.isLoading ? <LoadingSkeleton rows={3} /> : detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} /> : <>
          {drafts.length === 0 && <div className="p-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-600">No colour variants yet. A product needs at least one enabled colour with an enabled size and price before it can be published.</div>}
          {drafts.map((d) => <VariantCard key={d.key} draft={d} section={section} onChange={updateDraft} onSave={() => saveVariant(d)} onRemove={() => removeDraft(d.key)} saving={savingKey === d.key} errors={variantErrors[d.key]} canManage={canManage} />)}
        </>}
    </div>
  );

  return <Modal
    isOpen={isOpen}
    onClose={working || savingKey ? () => {} : requestClose}
    title={title}
    subtitle="Complete SKU matrix configuration with colour variants and wholesale support"
    maxWidth="max-w-4xl"
  >
      <div className="space-y-6">
        <div className="border-b border-slate-200 pb-4">
          <div className="flex items-center justify-between overflow-x-auto gap-2">
            {EDITOR_STEPS.map((name, idx) => {
    const isActive = step === idx;
    const isPassed = step > idx;
    return <button key={name} type="button" onClick={() => setStep(idx)} className={`flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors whitespace-nowrap ${isActive ? "bg-[#00130d] text-white shadow-2xs" : isPassed ? "bg-emerald-50 text-emerald-800" : "text-slate-400 hover:text-slate-700"}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${isActive ? "bg-white/20 text-white" : isPassed ? "bg-emerald-200 text-emerald-900 font-bold" : "bg-slate-200 text-slate-600"}`}>{isPassed ? "✓" : idx + 1}</span>
                  {name}
                </button>;
  })}
          </div>
        </div>

        {formErrors.general && <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-xs text-rose-700 font-medium" role="alert">{formErrors.general}</div>}
        {currentId && detailQuery.isError && step < 3 && <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} />}

        {step === 0 && <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Garment Title" required hint="e.g. Atelier Heavyweight Boxy Hoodie" error={fe.name}>
                <input type="text" value={form.name} maxLength={160} onChange={(e) => set({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} placeholder="Garment name..." className={input(fe.name)} />
              </FormField>
              <FormField label="URL Slug Handle" hint="Leave blank to generate from the title" error={fe.slug}>
                <input type="text" value={form.slug} maxLength={100} onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value.toLowerCase() }); }} className={`${input(fe.slug)} font-mono`} />
              </FormField>
            </div>
            <FormField label="Short Summary" hint="Displayed on search index and product cards (max 300)" error={fe.shortDescription}>
              <input type="text" value={form.shortDescription} maxLength={300} onChange={(e) => set({ shortDescription: e.target.value })} placeholder="Premium 400 GSM brushed fleece with exaggerated drop shoulder..." className={input(fe.shortDescription)} />
            </FormField>
            <FormField label="Detailed Description" error={fe.description}>
              <textarea rows={5} value={form.description} maxLength={10000} onChange={(e) => set({ description: e.target.value })} placeholder="Technical garment specifications, silhouette details, fabric..." className={input(fe.description)} />
            </FormField>
          </div>}

        {step === 1 && <div className="space-y-4">
            <FormField label="Assigned Category" required error={fe.category}>
              <select value={form.category} onChange={(e) => set({ category: e.target.value })} className={input(fe.category)}>
                <option value="">Select a category…</option>
                {categories.map((c) => <option key={c._id} value={c._id}>{categoryLabel(c)}{c.isActive ? "" : " (inactive)"}</option>)}
              </select>
              {categoriesQuery.isError && <span className="text-xs text-rose-600">Couldn't load categories. <button type="button" className="underline" onClick={() => categoriesQuery.refetch()}>Retry</button></span>}
            </FormField>
            <div className="pt-4 border-t border-slate-100 space-y-3">
              {[["isFeatured", "Featured On Storefront", "Display prominently on homepage flagship carousel"], ["isNewArrival", "New Arrival", "Show the New Arrival badge and list under New Arrivals"], ["isBestSeller", "Best Seller", "Show the Best Seller badge and list under Best Sellers"]].map(([k, t, d]) => <label key={k} className="flex items-center justify-between cursor-pointer">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">{t}</h4>
                    <p className="text-[11px] text-slate-500">{d}</p>
                  </div>
                  <input type="checkbox" checked={form[k]} onChange={(e) => set({ [k]: e.target.checked })} className="rounded border-slate-300 text-[#00130d] focus:ring-0 w-4 h-4 cursor-pointer" />
                </label>)}
            </div>
          </div>}

        {step === 2 && <div className="space-y-3">
            <div>
              <h4 className="text-xs font-semibold text-slate-900">General product images</h4>
              <p className="text-[11px] text-slate-500">Uploaded through the media library (max 20). The first image is the primary thumbnail. Colour-specific images are added under Color Variants.</p>
            </div>
            <ImageGalleryUpload value={form.generalImages} onChange={(generalImages) => set({ generalImages })} purpose="product_image" max={20} disabled={!canManage} />
            {fe.generalImages && <span className="text-xs text-rose-600">{fe.generalImages}</span>}
          </div>}

        {step === 3 && <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-slate-900">Color Variants (Parent Variants)</h4>
                <p className="text-[11px] text-slate-500">Each colour variant groups a distinct fabric tone, its images and nested sizes.</p>
              </div>
              {canManage && !needsProduct && <button type="button" onClick={addVariant} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"><Plus className="w-3.5 h-3.5" /> Add Color Variant</button>}
            </div>
            {variantsSection("color")}
          </div>}

        {step === 4 && <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-slate-900">Nested SKU & Pricing Matrix</h4>
              <p className="text-[11px] text-slate-500">Size, SKU code, PKR and USD retail / compare-at price, wholesale price and low-stock threshold per colour. USD is optional and merchant-set. Opening stock is only set for new SKUs.</p>
            </div>
            {variantsSection("sizes")}
          </div>}

        {step === 5 && <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <h4 className="text-xs font-bold text-emerald-950">Wholesale Program</h4>
                <p className="text-[11px] text-emerald-800">Offer this product to B2B buyers with a minimum order quantity. Wholesale prices are set per SKU in Sizes &amp; SKUs. Retail-only categories can't be wholesale.</p>
              </div>
              <input type="checkbox" checked={form.wholesaleEnabled} onChange={(e) => set({ wholesaleEnabled: e.target.checked })} className="w-4 h-4 rounded border-emerald-300 text-emerald-700 focus:ring-0 cursor-pointer" />
            </label>
            {form.wholesaleEnabled && <FormField label="Minimum Order Quantity (MOQ)" error={fe["wholesale.moq"]}>
                <input type="number" min={1} value={form.wholesaleMoq} onChange={(e) => set({ wholesaleMoq: e.target.value })} className="w-40 text-xs font-mono px-3 py-2 bg-white border border-emerald-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none" />
              </FormField>}
          </div>}

        {step === 6 && <div className="space-y-4">
            <FormField label="Search Engine Meta Title" error={fe["seo.title"]}>
              <input type="text" value={form.seoTitle} maxLength={120} onChange={(e) => set({ seoTitle: e.target.value })} placeholder="PEHAN LY | Atelier Heavyweight Hoodie" className={input(fe["seo.title"])} />
            </FormField>
            <FormField label="Search Engine Meta Description" error={fe["seo.description"]}>
              <textarea rows={3} value={form.seoDescription} maxLength={320} onChange={(e) => set({ seoDescription: e.target.value })} className={input(fe["seo.description"])} />
            </FormField>
            <FormField label="Catalog Publication State" required hint={needsProduct ? "Available once the draft exists." : undefined}>
              <select value={form.status} disabled={needsProduct} onChange={(e) => set({ status: e.target.value })} className={`${input(false)} font-semibold`}>
                <option value="active">Active (Live in Store)</option>
                <option value="draft">Draft (Internal Review)</option>
                <option value="inactive">Inactive (Hidden / Discontinued)</option>
              </select>
            </FormField>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <h5 className="text-xs font-bold text-slate-800">Ready to Publish Summary</h5>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div><span className="text-slate-400 block text-[10px]">Colors</span><span className="font-semibold">{drafts.filter((d) => !d.isNew).length} saved{unsavedCount ? ` · ${unsavedCount} unsaved` : ""}</span></div>
                <div><span className="text-slate-400 block text-[10px]">Total SKUs</span><span className="font-semibold">{drafts.filter((d) => !d.isNew).reduce((n, d) => n + d.sizes.filter((s) => !s.isNew).length, 0)} saved</span></div>
                <div><span className="text-slate-400 block text-[10px]">Available units</span><span className="font-semibold">{detail?.summary?.availableStock ?? "—"}</span></div>
                <div><span className="text-slate-400 block text-[10px]">Wholesale</span><span className="font-semibold">{form.wholesaleEnabled ? "Enabled" : "Disabled"}</span></div>
              </div>
              {readiness && (readiness.ready ? <p className="text-xs text-emerald-700 font-medium">✓ Ready to publish.</p> : <ul className="text-xs text-amber-700 font-medium list-disc pl-4">{readiness.issues.map((i) => <li key={i}>{i}</li>)}</ul>)}
              {needsProduct && <p className="text-xs text-amber-700 font-medium">Create the draft first (it is created when you continue from Images).</p>}
            </div>
          </div>}

        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${step === 0 ? "text-slate-300 cursor-not-allowed" : "text-slate-700 bg-slate-100 hover:bg-slate-200"}`}>
            <ChevronLeft className="w-4 h-4" /> Previous Step
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={requestClose} disabled={working || !!savingKey} className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800">Close</button>
            {canManage && step === 2 && needsProduct ? <button type="button" disabled={working} onClick={() => runSave({ create: true, advance: true })} className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60">
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save draft &amp; continue <ChevronRight className="w-4 h-4" />
              </button> : step < EDITOR_STEPS.length - 1 ? <button type="button" onClick={() => setStep((s) => Math.min(EDITOR_STEPS.length - 1, s + 1))} className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors">
                  Next Step <ChevronRight className="w-4 h-4" />
                </button> : canManage ? <button type="button" disabled={working || needsProduct} onClick={() => runSave({ create: false, finish: true })} className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-800 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 shadow-sm transition-colors disabled:opacity-60">
                  {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save Product
                </button> : null}
          </div>
        </div>
        {canManage && currentId && step < 6 && step !== 3 && step !== 4 && <div className="flex justify-end -mt-3">
            <button type="button" disabled={working} onClick={() => runSave({ create: false })} className="text-xs font-semibold text-emerald-800 hover:underline disabled:opacity-60">Save product details</button>
          </div>}
      </div>
    </Modal>;
};