import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { productsApi, tiersFromApi } from "../../services/productsApi";
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
import { ColorVariantsStep, SkusStep, useVariantWorkspace } from "./variantWorkspace";
import { inferSizeMode, isUnsaved, validateVariant, variantToDraft } from "./variantDraft";
import { SALES_CHANNELS, channelOfProduct } from "../../lib/salesChannel";

import { AUDIENCE_OPTIONS, imageCountError, imageLimitFor } from "../../lib/productLimits";

const EDITOR_STEPS = ["Basic Info", "Category & Flags", "Images", "Color Variants", "Sizes & SKUs", "Wholesale & Pricing", "SEO & Publish"];
/**
 * Category picker: top-level categories, with their sub-categories grouped underneath ("Under Garments" > "Men's Underwear").
 * Inactive categories can't receive new products, so they are disabled (kept visible only if the product already uses one).
 */
const categoryOptions = (categories, selected) => {
  const parents = categories.filter((c) => !c.parentCategory);
  const childrenOf = (p) => categories.filter((c) => (c.parentCategory?._id || c.parentCategory) === p._id);
  const opt = (c, label) => <option key={c._id} value={c._id} disabled={!c.isActive && c._id !== selected}>{label}{c.isActive ? "" : " (inactive)"}</option>;
  const used = new Set();
  const out = parents.map((p) => {
    const kids = childrenOf(p);
    used.add(p._id); kids.forEach((k) => used.add(k._id));
    return kids.length
      ? <optgroup key={p._id} label={p.name + (p.dedicatedSection ? " (own page)" : "")}>{opt(p, `${p.name} (whole category)`)}{kids.map((k) => opt(k, k.name))}</optgroup>
      : opt(p, p.name);
  });
  const orphans = categories.filter((c) => !used.has(c._id)).map((c) => opt(c, c.parentCategory ? `${c.parentCategory.name} › ${c.name}` : c.name));
  return [...out, ...orphans];
};
const input = (bad) => `w-full text-xs px-3 py-2 bg-slate-50 border rounded-lg focus:ring-1 focus:ring-[#00130d] outline-none ${bad ? "border-rose-400" : "border-slate-200"}`;
const slugify = (v) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const EMPTY = {
  name: "", slug: "", shortDescription: "", description: "", category: "", audience: "", generalImages: [],
  isFeatured: false, isNewArrival: false, isBestSeller: false,
  salesChannel: "retail", wholesaleEnabled: false, wholesaleMoq: 12, wholesaleTiers: [], seoTitle: "", seoDescription: "", status: "draft",
};

const fromProduct = (p) => ({
  name: p.name || "", slug: p.slug || "", shortDescription: p.shortDescription || "", description: p.description || "",
  category: p.category?._id || p.category || "", audience: p.audience || "", generalImages: p.generalImages || [],
  isFeatured: !!p.isFeatured, isNewArrival: !!p.isNewArrival, isBestSeller: !!p.isBestSeller,
  salesChannel: channelOfProduct(p), wholesaleEnabled: channelOfProduct(p) !== "retail", wholesaleMoq: p.wholesale?.moq || 12, wholesaleTiers: tiersFromApi(p.wholesale?.tiers),
  seoTitle: p.seo?.title || "", seoDescription: p.seo?.description || "", status: p.status || "draft",
});

export const ProductEditor = ({ isOpen, productId, canManage, onClose }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [step, setStep] = useState(0);
  const [currentId, setCurrentId] = useState(productId);
  // Opened with no product = a creation session (stays true after the first draft save). One main image then; editing keeps the gallery.
  const isCreation = !productId;
  const imageLimit = imageLimitFor(isCreation);
  const [form, setForm] = useState(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [formErrors, setFormErrors] = useState({ fields: {}, general: "" });
  const loadedFor = useRef(null);
  // Colour variants + SKUs state and actions are shared with the flexible wholesale pack wizard.
  const ws = useVariantWorkspace({ currentId, onSaved: () => { invalidate(); detailQuery.refetch(); } });
  const { drafts, setDrafts, setVariantErrors, savingKey, setSizeMode, persistVariant, unsavedCount } = ws;

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
      setSizeMode("manual");
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
    const loaded = (detail.variants || []).map(variantToDraft);
    setDrafts(loaded);
    setSizeMode(inferSizeMode(loaded));
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
    { const e = imageCountError(form.generalImages, imageLimit); if (e) f.generalImages = e; }
    if (form.shortDescription.length > 300) f.shortDescription = "Max 300 characters";
    if (form.wholesaleEnabled && !(Number(form.wholesaleMoq) >= 1)) f["wholesale.moq"] = "MOQ must be at least 1";
    if (form.wholesaleEnabled) {
      const rows = form.wholesaleTiers;
      const bad = rows.some((r) => !(Number(r.minQuantity) >= 2) || (r.mode !== "quote" && !(Number(r.value) > 0)) || (r.mode === "discount" && Number(r.value) > 90));
      const qs = rows.map((r) => Number(r.minQuantity));
      if (bad) f["wholesale.tiers"] = "Each tier needs a quantity of 2+ and a price (or a discount of 1–90%).";
      else if (new Set(qs).size !== qs.length) f["wholesale.tiers"] = "Tier quantities must be unique.";
    }
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
      setStep(f.category ? 1 : (f["wholesale.moq"] || f["wholesale.tiers"]) ? 5 : 0);
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

  const needsProduct = !currentId;
  const requestClose = () => {
    if (unsavedCount > 0 && !window.confirm(`You have ${unsavedCount} unsaved colour variant${unsavedCount > 1 ? "s" : ""} (with their sizes, prices and initial stock). Close and discard ${unsavedCount > 1 ? "them" : "it"}?`)) return;
    onClose();
  };
  const working = saveProduct.isPending || statusMutation.isPending || !!savingKey;
  const stepProps = {
    canManage, needsProduct, working,
    onCreateProduct: () => runSave({ create: true, advance: false }),
    createNote: <>Colour variants and SKUs are saved against the product, so the product is first created as a <strong>draft</strong> (it is not visible in the store until you publish it).</>,
    loading: detailQuery.isLoading, error: detailQuery.isError ? detailQuery.error : null, onRetry: () => detailQuery.refetch(),
  };
  const title = currentId ? `Edit Product: ${form.name || detail?.name || ""}` : "Create Master Product";
  const readiness = detail?.readiness;

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
                {categoryOptions(categories, form.category)}
              </select>
              {categoriesQuery.isError && <span className="text-xs text-rose-600">Couldn't load categories. <button type="button" className="underline" onClick={() => categoriesQuery.refetch()}>Retry</button></span>}
            </FormField>
            <FormField label="Audience" error={fe.audience}>
              <select value={form.audience} onChange={(e) => set({ audience: e.target.value })} className={input(fe.audience)} data-testid="audience-select">
                {AUDIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span className="text-[11px] text-slate-500">Men shows Men + Unisex; Women shows Women + Unisex. “Same as category” keeps the category’s audience.</span>
            </FormField>
            <FormField label="Sales channel" required error={fe.salesChannel}>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Sales channel" data-testid="sales-channel">
                {SALES_CHANNELS.map((c) => <label key={c.value} className={`flex flex-col gap-1 p-3 rounded-lg border text-xs cursor-pointer ${form.salesChannel === c.value ? "border-[#00130d] bg-slate-50" : "border-slate-200"}`}>
                    <span className="flex items-center gap-2 font-semibold text-slate-900">
                      <input type="radio" name="salesChannel" value={c.value} checked={form.salesChannel === c.value} disabled={!canManage} onChange={() => set({ salesChannel: c.value, wholesaleEnabled: c.value !== "retail" })} className="text-[#00130d] focus:ring-0" />{c.label}
                    </span>
                    <span className="text-[11px] text-slate-500 leading-snug">{c.hint}</span>
                  </label>)}
              </div>
              {form.salesChannel === "wholesale" && <span className="text-[11px] text-amber-700">Wholesale-only: add colours, images, sizes and SKUs as usual. Publish it (status Active) so wholesale packs and the wholesale catalogue can sell it; it still never appears in the shop. Set the MOQ and wholesale prices in the next steps.</span>}
            </FormField>
            <div className="pt-4 border-t border-slate-100 space-y-3">
              {[["isFeatured", "Featured On Storefront", "Display prominently on homepage flagship carousel"], ["isNewArrival", "New Arrival", "Show the New Arrival badge and list under New Arrivals"], ["isBestSeller", "Best Seller", "Show the Best Seller badge and list under Best Sellers"]].map(([k, t, d]) => <label key={k} className="flex items-center justify-between cursor-pointer">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">{t}</h4>
                    <p className="text-[11px] text-slate-500">{d}</p>
                  </div>
                  <input type="checkbox" checked={form.salesChannel === "wholesale" ? false : form[k]} disabled={form.salesChannel === "wholesale"} title={form.salesChannel === "wholesale" ? "Not used for wholesale-only products" : undefined} onChange={(e) => set({ [k]: e.target.checked })} className="rounded border-slate-300 text-[#00130d] focus:ring-0 w-4 h-4 cursor-pointer disabled:opacity-40" />
                </label>)}
            </div>
          </div>}

        {step === 2 && <div className="space-y-3">
            <div>
              <h4 className="text-xs font-semibold text-slate-900">{isCreation ? "Main product image" : "General product images"}</h4>
              <p className="text-[11px] text-slate-500">{isCreation
                ? "Upload one image. It becomes the product's main image and the thumbnail on Shop page product cards. You can crop it first, replace it or remove it before saving. More images and colour-specific images can be added afterwards by editing the product."
                : <>Uploaded through the media library (max {imageLimit}). Each image can be cropped to Square, Portrait or Landscape first. The first image is the primary thumbnail. Colour-specific images are added under Color Variants.</>}</p>
            </div>
            <ImageGalleryUpload value={form.generalImages} onChange={(generalImages) => set({ generalImages })} purpose="product_image" max={imageLimit} single={isCreation} adjust disabled={!canManage} />
            {fe.generalImages && <span className="text-xs text-rose-600">{fe.generalImages}</span>}
          </div>}

        {step === 3 && <ColorVariantsStep ws={ws} {...stepProps} />}

        {step === 4 && <SkusStep ws={ws} {...stepProps} />}

        {step === 5 && <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-4">
            <div>
              <h4 className="text-xs font-bold text-emerald-950">Wholesale Program</h4>
              <p className="text-[11px] text-emerald-800">{form.wholesaleEnabled ? "Offered to B2B buyers with a minimum order quantity. Wholesale prices are set per SKU in Sizes & SKUs." : "This product is retail only. To offer it to B2B buyers choose “Wholesale only” or “Retail & wholesale” as the sales channel in Category & Flags."} Retail-only categories can't be wholesale.</p>
            </div>
            {form.wholesaleEnabled && <FormField label="Minimum Order Quantity (MOQ)" error={fe["wholesale.moq"]}>
                <input type="number" min={1} value={form.wholesaleMoq} onChange={(e) => set({ wholesaleMoq: e.target.value })} className="w-40 text-xs font-mono px-3 py-2 bg-white border border-emerald-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none" />
              </FormField>}
            {form.wholesaleEnabled && <FormField label="Quantity tiers" error={fe["wholesale.tiers"]} hint="Optional. Price changes automatically once the combined product quantity reaches the tier. Pick a flat price per piece, a % off the SKU wholesale price, or 'quote' for quantities that need a custom quote.">
                <div className="space-y-2">
                  {form.wholesaleTiers.map((t, idx) => <div key={idx} className="flex flex-wrap items-center gap-2">
                      <input type="number" min={2} placeholder="From qty" value={t.minQuantity} onChange={(e) => set({ wholesaleTiers: form.wholesaleTiers.map((x, n) => (n === idx ? { ...x, minQuantity: e.target.value } : x)) })} className="w-24 text-xs font-mono px-2 py-2 bg-white border border-emerald-200 rounded-lg" aria-label="Tier from quantity" />
                      <select value={t.mode} onChange={(e) => set({ wholesaleTiers: form.wholesaleTiers.map((x, n) => (n === idx ? { ...x, mode: e.target.value } : x)) })} className="text-xs px-2 py-2 bg-white border border-emerald-200 rounded-lg" aria-label="Tier pricing mode">
                        <option value="price">Price / piece</option><option value="discount">% off SKU price</option><option value="quote">Custom quote</option>
                      </select>
                      {t.mode !== "quote" && <input type="number" min={0} step="any" placeholder={t.mode === "price" ? "Rs. per piece" : "% off"} value={t.value} onChange={(e) => set({ wholesaleTiers: form.wholesaleTiers.map((x, n) => (n === idx ? { ...x, value: e.target.value } : x)) })} className="w-32 text-xs font-mono px-2 py-2 bg-white border border-emerald-200 rounded-lg" aria-label="Tier value" />}
                      <button type="button" onClick={() => set({ wholesaleTiers: form.wholesaleTiers.filter((_, n) => n !== idx) })} className="text-[11px] text-rose-600 hover:underline">Remove</button>
                    </div>)}
                  {form.wholesaleTiers.length < 10 && <button type="button" onClick={() => set({ wholesaleTiers: [...form.wholesaleTiers, { minQuantity: "", mode: "price", value: "" }] })} className="text-xs font-semibold text-emerald-800 hover:underline">+ Add tier</button>}
                </div>
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
                <div><span className="text-slate-400 block text-[10px]">Sales channel</span><span className="font-semibold">{SALES_CHANNELS.find((c) => c.value === form.salesChannel)?.label || "Retail only"}</span></div>
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
