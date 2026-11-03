import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Mail, Phone, Eye, Percent, Plus, Pencil, Loader2, X, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { wholesaleApi, WHOLESALE_STATUSES } from "../services/wholesaleApi";
import { productsApi } from "../services/productsApi";
import { categoriesApi } from "../services/categoriesApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { splitFormError } from "../lib/formErrors";
import { formatDateTime, formatMoney, formatNumber, humanize } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { SearchInput } from "../components/common/SearchInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { Pagination } from "../components/common/Pagination";
import { Drawer } from "../components/common/Drawer";
import { Modal } from "../components/common/Modal";
import { FormField } from "../components/common/FormField";
import { Toggle } from "../components/common/Toggle";
import { ImageUpload } from "../components/common/ImageUpload";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { CreateQuoteModal } from "../components/quotes/CreateQuoteModal";
import { collectPackSkus, packSkuBlocker } from "../lib/packSkus";
import { channelLabel, channelOfProduct } from "../lib/salesChannel";
import { ColorVariantsStep, SkusStep, useVariantWorkspace } from "../components/products/variantWorkspace";
import { inferSizeMode, isUnsaved, validateVariant, variantToDraft } from "../components/products/variantDraft";

const sel = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";
const inp = "w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#00130d] outline-none";
const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* ---------------------------------- Packs ---------------------------------- */
const PackEditor = ({ pack, onClose, canManage }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const isEdit = Boolean(pack);
  const [form, setForm] = useState(() => ({
    name: pack?.name || "", slug: pack?.slug || "", description: pack?.description || "",
    image: pack?.image?.url ? pack.image : null, isActive: pack?.isActive ?? true, sortOrder: pack?.sortOrder ?? 0,
    badge: pack?.badge || "", packPrice: pack?.packPrice ?? "", compareAtValue: pack?.compareAtValue ?? "", moq: pack?.moq ?? "", dispatchText: pack?.dispatchText || "", isFeatured: pack?.isFeatured ?? false,
    selectionMode: pack?.selectionMode === "flexible" ? "flexible" : "fixed", packSize: pack?.packSize ?? "",
    items: (pack?.items || []).filter((i) => !(pack?.colorProduct && String(i.product?._id || i.product) === String(pack.colorProduct))).map((i) => ({ sku: i.sku, label: `${i.productName} · ${[i.colorName, i.size].filter(Boolean).join(" / ")} (${i.skuCode})`, quantity: i.quantity ?? 1 })),
  }));
  const flexible = form.selectionMode === "flexible";
  // Flexible packs: colours, images and SKUs are configured with the SAME Color Variants / SKUs steps as Product Creation.
  // They live on a wholesale-only product (never shown in the shop) that the pack references; see colorProduct.
  const PACK_STEPS = ["Pack Details", "Color Variants", "SKUs", "Pack Pricing & Configuration", "Review & Save"];
  const [step, setStep] = useState(0);
  const [colorProductId, setColorProductId] = useState(pack?.colorProduct ? String(pack.colorProduct._id || pack.colorProduct) : "");
  const [category, setCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const loadedFor = useRef(null);
  const ws = useVariantWorkspace({ currentId: colorProductId, onSaved: () => { queryClient.invalidateQueries({ queryKey: keys.products.all }); queryClient.invalidateQueries({ queryKey: keys.inventory.all }); colorDetail.refetch(); } });
  const colorDetail = useQuery({ queryKey: keys.products.detail(colorProductId), queryFn: () => productsApi.get(colorProductId), enabled: flexible && !!colorProductId, refetchOnMount: "always" });
  const categoriesQuery = useQuery({ queryKey: keys.categories.list({ limit: 100, sortBy: "name", forPicker: true }), queryFn: () => categoriesApi.list({ limit: 100, sortBy: "name" }), enabled: flexible });
  useEffect(() => {
    if (!colorDetail.data || loadedFor.current === colorDetail.data._id || !colorDetail.isFetchedAfterMount) return;
    loadedFor.current = colorDetail.data._id;
    const loaded = (colorDetail.data.variants || []).map(variantToDraft);
    ws.setDrafts(loaded);
    ws.setSizeMode(inferSizeMode(loaded));
    setCategory(colorDetail.data.category?._id || colorDetail.data.category || "");
  }, [colorDetail.data, colorDetail.isFetchedAfterMount]); // eslint-disable-line react-hooks/exhaustive-deps
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const [pq, setPq] = useState("");
  const [productId, setProductId] = useState("");
  const dq = useDebouncedValue(pq, 350);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const found = useQuery({ queryKey: ["wholesale", "pack-product-search", dq], queryFn: () => productsApi.list({ search: dq, limit: 8 }), enabled: dq.trim().length >= 2 });
  const detail = useQuery({ queryKey: keys.products.detail(productId), queryFn: () => productsApi.get(productId), enabled: !!productId });

  // Adds existing SKU records only (nothing is created or duplicated here). `variantId` limits it to one colour.
  const addSkus = (variantId) => {
    const r = collectPackSkus(detail.data, new Set(form.items.map((i) => i.sku)), variantId);
    if (r.add.length) set("items", [...form.items, ...r.add]);
    const parts = [r.add.length ? `Added ${r.add.length} SKU${r.add.length === 1 ? "" : "s"}.` : "No new SKUs to add.", r.duplicates ? `${r.duplicates} already in the pack.` : "", r.blocked.length ? `${r.blocked.length} can't be used (${[...new Set(r.blocked.map((b) => b.reason))].join(", ").toLowerCase()}).` : ""].filter(Boolean);
    addToast(parts.join(" "), r.add.length ? "success" : "info");
  };
  const addSku = (variant, size) => {
    if (form.items.some((i) => i.sku === size._id)) return addToast("That SKU is already in the pack.", "info");
    set("items", [...form.items, { sku: size._id, label: `${detail.data.name} · ${variant.color?.name} / ${size.size} (${size.sku})`, quantity: 1 }]);
  };

  const save = useMutation({
    mutationFn: (body) => (isEdit ? wholesaleApi.updatePack(pack._id, body) : wholesaleApi.createPack(body)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.wholesale.all }); addToast(isEdit ? "Pack updated." : "Pack created."); onClose(); },
    onError: (err) => { const { fields, general: g } = splitFormError(err, "Could not save the pack"); setErrors(fields); setGeneral(g); },
  });

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = "Name must be at least 2 characters.";
    if (!SLUG_RE.test(form.slug)) e.slug = "Use lowercase letters, numbers and hyphens only.";
    if (!flexible && form.items.length === 0) e.items = "Add at least one SKU.";
    if (!flexible && form.items.some((i) => !(Number(i.quantity) >= 1))) e.items = "Every quantity must be 1 or more.";
    if (flexible && !(Number.isInteger(Number(form.packSize)) && Number(form.packSize) >= 1)) e.packSize = "Enter how many pieces the customer must choose (a whole number, 1 or more).";
    if (form.packPrice !== "" && !(Number(form.packPrice) > 0)) e.packPrice = "Enter a price above 0, or leave empty to calculate from SKU wholesale prices.";
    if (form.compareAtValue !== "" && !(Number(form.compareAtValue) > 0)) e.compareAtValue = "Enter a value above 0 or leave empty.";
    if (form.moq !== "" && !(Number(form.moq) >= 1)) e.moq = "Minimum packs must be 1 or more.";
    return e;
  };
  const buildBody = (items, extra = {}) => ({
    name: form.name.trim(), slug: form.slug, ...(form.description.trim() ? { description: form.description.trim() } : {}),
    ...(form.image ? { image: { url: form.image.url, ...(form.image.publicId ? { publicId: form.image.publicId } : {}), ...(form.image.alt ? { alt: form.image.alt } : {}) } } : {}),
    selectionMode: form.selectionMode, ...(flexible ? { packSize: Number(form.packSize) } : { packSize: null }),
    items: items.map((i) => ({ sku: i.sku, quantity: flexible ? 1 : Number(i.quantity) })), isActive: form.isActive, sortOrder: Number(form.sortOrder) || 0,
    badge: form.badge.trim(), dispatchText: form.dispatchText.trim(), isFeatured: form.isFeatured,
    packPrice: form.packPrice === "" ? null : Number(form.packPrice),
    compareAtValue: form.compareAtValue === "" ? null : Number(form.compareAtValue),
    moq: form.moq === "" ? null : Number(form.moq),
    ...extra,
  });

  // Fixed packs: unchanged single form.
  const submit = () => {
    const e = validate();
    setErrors(e); setGeneral("");
    if (Object.keys(e).length) return;
    save.mutate(buildBody(form.items));
  };

  // Flexible packs -----------------------------------------------------------------------------------------------
  // The wizard keeps ONE wholesale-only product ("colorProduct") for this pack's colours/images/SKUs, created through the
  // normal product endpoint (never visible in the shop). The pack only references its SKUs, so stock stays in the normal Sku records.
  const needsProduct = !colorProductId;
  const createColorProduct = async () => {
    const e = validate();
    const only = { name: e.name, slug: e.slug, packSize: e.packSize };
    if (!category) only.category = "Choose a category for this pack's products.";
    const bad = Object.fromEntries(Object.entries(only).filter(([, v]) => v));
    setErrors(bad);
    if (Object.keys(bad).length) { setStep(0); return false; }
    setCreating(true); setGeneral("");
    try {
      const created = await productsApi.create({
        name: form.name.trim(), slug: "", shortDescription: "", description: form.description.trim(), category, audience: "", generalImages: form.image ? [{ url: form.image.url, publicId: form.image.publicId, alt: form.image.alt }] : [],
        isFeatured: false, isNewArrival: false, isBestSeller: false, salesChannel: "wholesale", wholesaleEnabled: true, wholesaleMoq: 12, wholesaleTiers: [], seoTitle: "", seoDescription: "", status: "draft",
      });
      loadedFor.current = created._id; ws.setDrafts([]); ws.setSizeMode("manual");
      setColorProductId(created._id);
      queryClient.setQueryData(keys.products.detail(created._id), created);
      queryClient.invalidateQueries({ queryKey: keys.products.all });
      addToast("Wholesale-only product created (hidden from the shop). Add its colours next.");
      return true;
    } catch (err) {
      setGeneral(errorMessage(err, "Could not create the pack's product")); return false;
    } finally { setCreating(false); }
  };
  const next = async () => {
    if (step === 0 && needsProduct && canManage && (category || form.items.length === 0)) { if (!(await createColorProduct())) return; }
    setStep((n) => Math.min(PACK_STEPS.length - 1, n + 1));
  };
  const saveFlexible = async () => {
    const e = validate();
    setErrors(e); setGeneral("");
    if (Object.keys(e).length) { setStep(e.packPrice || e.compareAtValue || e.moq ? 3 : 0); return; }
    // 1) save every unsaved colour/SKU through the same variant endpoints Product Creation uses
    const pending = ws.drafts.filter(isUnsaved);
    const invalid = pending.filter((d) => !validateVariant(d).ok);
    if (invalid.length) {
      ws.setVariantErrors((m) => ({ ...m, ...Object.fromEntries(invalid.map((d) => { const v = validateVariant(d); return [d.key, { general: v.general, skus: v.skus }]; })) }));
      setGeneral(`Fix ${invalid.length} colour variant${invalid.length > 1 ? "s" : ""} before saving: nothing was saved.`); setStep(2); return;
    }
    setCreating(true);
    try {
      let done = 0;
      for (const d of pending) {
        const r = await ws.persistVariant(d, colorProductId);
        if (!r.ok) { setGeneral(`Only ${done} of ${pending.length} colour variants were saved. "${d.color.name || "Unnamed colour"}" failed: ${r.message}. Fix it and save again.`); setStep(2); return; }
        done += 1;
      }
      // 2) the pack's own SKUs = every enabled SKU of its product (existing records, nothing duplicated); publish the product (wholesale-only, never in the shop)
      let own = [];
      if (colorProductId) {
        let det = await productsApi.get(colorProductId);
        if ((det.variants || []).length && det.status !== "active") {
          try { det = await productsApi.setStatus(colorProductId, "active"); } catch (err) { setGeneral(`The pack's product could not be published: ${errorMessage(err, "not ready")}. Check colours, sizes and prices in steps 2 and 3.`); setStep(2); return; }
          det = await productsApi.get(colorProductId);
        }
        own = collectPackSkus(det, new Set()).add;
      }
      const seen = new Set(); const items = [...own, ...form.items].filter((i) => !seen.has(String(i.sku)) && seen.add(String(i.sku)));
      if (!items.length) { setGeneral("Add at least one colour with a size (steps 2 and 3), or SKUs from another product."); setStep(own.length ? 3 : 1); return; }
      queryClient.invalidateQueries({ queryKey: keys.products.all });
      queryClient.invalidateQueries({ queryKey: keys.inventory.all });
      save.mutate(buildBody(items, colorProductId ? { colorProduct: colorProductId } : {}));
    } catch (err) {
      setGeneral(errorMessage(err, "Could not save the pack"));
    } finally { setCreating(false); }
  };
  const unsavedColours = ws.unsavedCount;
  const wizardBusy = save.isPending || creating || !!ws.savingKey;
  const requestClose = () => {
    if (wizardBusy) return;
    if (flexible && unsavedColours > 0 && !window.confirm(`You have ${unsavedColours} unsaved colour variant${unsavedColours > 1 ? "s" : ""}. Close and discard ${unsavedColours > 1 ? "them" : "it"}?`)) return;
    if (flexible && colorProductId && !isEdit) addToast("The pack was not saved. Its wholesale-only product stays as a draft under Products (filter: Wholesale only).", "info");
    onClose();
  };

  const stepProps = {
    canManage, needsProduct, working: creating,
    onCreateProduct: createColorProduct, createLabel: "Create the pack's product",
    createNote: <>Colours and SKUs are stored on a <strong>wholesale-only product</strong> created for this pack. It never appears in the shop. Choose a category in Pack Details, then create it.</>,
    loading: colorDetail.isLoading, error: colorDetail.isError ? colorDetail.error : null, onRetry: () => colorDetail.refetch(),
  };
  const categoryField = <FormField label="Category for this pack's products" required={needsProduct} error={errors.category} hint={needsProduct ? "Needed once, to create the wholesale-only product that holds this pack's colours and SKUs. It is not shown in the shop." : "Set when the pack's product was created."}>
      <select className={inp} value={category} disabled={!needsProduct} onChange={(e) => setCategory(e.target.value)} data-testid="pack-category">
        <option value="">Select a category…</option>
        {(categoriesQuery.data?.items || []).map((c) => <option key={c._id} value={c._id}>{c.parentCategory ? `${c.parentCategory.name} › ${c.name}` : c.name}</option>)}
      </select>
    </FormField>;
  const ownSkuCount = ws.drafts.filter((d) => !d.isNew && d.isEnabled !== false).reduce((n, d) => n + d.sizes.filter((z) => !z.isNew).length, 0);

  if (!flexible) {
    return <Modal isOpen onClose={() => !save.isPending && onClose()} title={isEdit ? `Edit pack · ${pack.name}` : "New wholesale pack"} maxWidth="lg">
      <div className="space-y-4">
        <FormField label="Pack name" required error={errors.name}><input className={inp} value={form.name} maxLength={160} onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} /></FormField>
        <FormField label="Slug" required error={errors.slug} hint="Used in the storefront URL."><input className={inp} value={form.slug} maxLength={180} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} /></FormField>
        <FormField label="Description" error={errors.description}><textarea className={inp} rows={2} maxLength={2000} value={form.description} onChange={(e) => set("description", e.target.value)} /></FormField>
        <ImageUpload label="Pack image" purpose="wholesale_pack_image" value={form.image} onChange={(v) => set("image", v)} />
        <div className="space-y-2" data-testid="pack-mode">
          <span className="text-xs font-semibold text-slate-800">How is this pack sold?</span>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Pack type">
            {[["fixed", "Fixed contents", "The customer buys exactly the SKUs and quantities listed below."], ["flexible", "Customer chooses colours & sizes", "You list the SKUs on offer; the customer picks any mix that adds up to the pack size."]].map(([v, t, d]) => <label key={v} className={`flex flex-col gap-0.5 p-3 rounded-lg border text-xs cursor-pointer ${form.selectionMode === v ? "border-[#00130d] bg-slate-50" : "border-slate-200"}`}>
                <span className="flex items-center gap-2 font-semibold text-slate-900"><input type="radio" name="packMode" value={v} checked={form.selectionMode === v} onChange={() => set("selectionMode", v)} />{t}</span>
                <span className="text-[11px] text-slate-500">{d}</span>
              </label>)}
          </div>
          {flexible && <FormField label="Pack size (pieces the customer must choose)" required error={errors.packSize} hint="e.g. 200. The customer must pick exactly this many pieces, across any of the SKUs below, before the pack can be ordered."><input type="number" min={1} step={1} className={`${inp} max-w-[10rem]`} value={form.packSize} onChange={(e) => set("packSize", e.target.value)} data-testid="pack-size" /></FormField>}
          {flexible && pack?.computed?.hiddenSkus > 0 && <p className="text-[11px] text-amber-700">{pack.computed.hiddenSkus} SKU{pack.computed.hiddenSkus === 1 ? " is" : "s are"} currently hidden from customers (disabled, unpublished or no wholesale price) and not shown here. Saving this pack removes {pack.computed.hiddenSkus === 1 ? "it" : "them"} from the pack.</p>}
        </div>
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-800">Pack contents <span className="text-rose-600">*</span> {flexible && <span className="font-normal text-slate-500">· {form.items.length} SKU{form.items.length === 1 ? "" : "s"} on offer</span>}</span>
          {form.items.map((i, idx) => <div key={i.sku} className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg text-xs">
              <span className="flex-1 truncate" title={i.label}>{i.label}</span>
              {!flexible && <input type="number" min={1} value={i.quantity} onChange={(e) => set("items", form.items.map((x, n) => n === idx ? { ...x, quantity: e.target.value } : x))} className={`${sel} w-20`} aria-label="Quantity" />}
              <button type="button" onClick={() => set("items", form.items.filter((_, n) => n !== idx))} className="p-1 text-slate-400 hover:text-rose-600" aria-label="Remove"><X className="w-4 h-4" /></button>
            </div>)}
          {errors.items && <p className="text-xs text-rose-600">{errors.items}</p>}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <SearchInput value={pq} onChange={(v) => { setPq(v); setProductId(""); }} placeholder="Search a product to add SKUs (min 2 characters)…" />
            {found.isFetching && <p className="text-[11px] text-slate-400">Searching…</p>}
            {!productId && (found.data?.items || []).map((p) => <button key={p._id} type="button" onClick={() => setProductId(p._id)} className="flex items-center justify-between gap-2 w-full text-left text-xs px-2 py-1.5 rounded hover:bg-white"><span className="truncate">{p.name}</span><span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${channelOfProduct(p) === "retail" ? "bg-slate-100 text-slate-500" : channelOfProduct(p) === "wholesale" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{channelLabel(channelOfProduct(p))}</span></button>)}
            {productId && (detail.isLoading ? <LoadingSkeleton rows={2} /> : detail.isError ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} /> : <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold"><span>{detail.data.name} <span className="font-normal text-slate-500">· {channelLabel(channelOfProduct(detail.data))}{detail.data.status !== "active" ? " · not published yet" : ""}</span></span>
                  <span className="flex items-center gap-3"><button type="button" data-testid="pack-all-skus" className="px-2.5 py-1 bg-[#00130d] text-white rounded-lg font-semibold" onClick={() => addSkus()}>All SKUs</button><button type="button" className="text-slate-400 underline" onClick={() => setProductId("")}>Back</button></span></div>
                {detail.data.status !== "active" && <p className="text-[11px] text-amber-700">Draft or inactive products can be added now, but customers can only order them once the product is published (status Active).</p>}
                {(detail.data.variants || []).map((v) => <div key={v._id} className="text-xs"><div className="flex items-center gap-3 text-slate-500 mb-1"><span>{v.color?.name}</span><button type="button" className="text-[11px] text-emerald-800 underline" onClick={() => addSkus(v._id)}>Add all sizes</button></div><div className="flex flex-wrap gap-1.5">{(v.sizes || []).map((s) => { const why = packSkuBlocker(detail.data, v, s); const used = form.items.some((i) => i.sku === s._id); return <button key={s._id} type="button" disabled={Boolean(why) || used} title={why || (used ? "Already in the pack" : "")} onClick={() => addSku(v, s)} className="px-2 py-1 border border-slate-200 bg-white rounded hover:bg-emerald-50 font-mono disabled:opacity-40 disabled:hover:bg-white">{s.size} · {s.sku}</button>; })}</div></div>)}
              </div>)}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Badge" error={errors.badge} hint="e.g. Best value, 50 pieces"><input className={inp} maxLength={40} value={form.badge} onChange={(e) => set("badge", e.target.value)} /></FormField>
          <FormField label="Dispatch / SLA text" error={errors.dispatchText} hint="e.g. Ships within 24h"><input className={inp} maxLength={160} value={form.dispatchText} onChange={(e) => set("dispatchText", e.target.value)} /></FormField>
          <FormField label="Pack wholesale price (Rs.)" error={errors.packPrice} hint="Leave empty to calculate from live SKU wholesale prices. Per-piece price is always calculated."><input type="number" min={0} step="any" className={inp} value={form.packPrice} onChange={(e) => set("packPrice", e.target.value)} /></FormField>
          <FormField label="Reference retail value (Rs.)" error={errors.compareAtValue} hint="Optional, shown struck-through."><input type="number" min={0} step="any" className={inp} value={form.compareAtValue} onChange={(e) => set("compareAtValue", e.target.value)} /></FormField>
          <FormField label="Minimum packs per order" error={errors.moq}><input type="number" min={1} className={inp} value={form.moq} onChange={(e) => set("moq", e.target.value)} /></FormField>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 self-end pb-2"><Toggle checked={form.isFeatured} onChange={(v) => set("isFeatured", v)} /> Featured</label>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <FormField label="Sort order"><input type="number" className={inp} value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></FormField>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} /> Active on storefront</label>
        </div>
        {general && <p className="text-xs text-rose-600">{general}</p>}
        <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={onClose} disabled={save.isPending}>Cancel</button>
          {canManage && <button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : isEdit ? "Save changes" : "Create pack"}</button>}</div>
      </div>
    </Modal>;
  }

  return <Modal isOpen onClose={requestClose} title={isEdit ? `Edit pack · ${pack.name}` : "New wholesale pack"} subtitle="Customer chooses colours & sizes" maxWidth="max-w-4xl">
      <div className="space-y-6" data-testid="flex-wizard">
        <div className="border-b border-slate-200 pb-4">
          <div className="flex items-center justify-between overflow-x-auto gap-2">
            {PACK_STEPS.map((name, idx) => {
              const isActive = step === idx; const isPassed = step > idx;
              return <button key={name} type="button" onClick={() => setStep(idx)} data-testid={`pack-step-${idx}`} className={`flex items-center gap-1.5 text-xs font-semibold py-1.5 px-3 rounded-lg transition-colors whitespace-nowrap ${isActive ? "bg-[#00130d] text-white shadow-2xs" : isPassed ? "bg-emerald-50 text-emerald-800" : "text-slate-400 hover:text-slate-700"}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${isActive ? "bg-white/20 text-white" : isPassed ? "bg-emerald-200 text-emerald-900 font-bold" : "bg-slate-200 text-slate-600"}`}>{isPassed ? "✓" : idx + 1}</span>{name}
                </button>;
            })}
          </div>
        </div>
        {general && <div className="p-3 rounded-lg bg-rose-50 border border-rose-100 text-xs text-rose-700 font-medium" role="alert">{general}</div>}

        {step === 0 && <div className="space-y-4">
        <FormField label="Pack name" required error={errors.name}><input className={inp} value={form.name} maxLength={160} onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} /></FormField>
        <FormField label="Slug" required error={errors.slug} hint="Used in the storefront URL."><input className={inp} value={form.slug} maxLength={180} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} /></FormField>
        <FormField label="Description" error={errors.description}><textarea className={inp} rows={2} maxLength={2000} value={form.description} onChange={(e) => set("description", e.target.value)} /></FormField>
        <ImageUpload label="Pack image" purpose="wholesale_pack_image" value={form.image} onChange={(v) => set("image", v)} />
        <div className="space-y-2" data-testid="pack-mode">
          <span className="text-xs font-semibold text-slate-800">How is this pack sold?</span>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Pack type">
            {[["fixed", "Fixed contents", "The customer buys exactly the SKUs and quantities listed below."], ["flexible", "Customer chooses colours & sizes", "You list the SKUs on offer; the customer picks any mix that adds up to the pack size."]].map(([v, t, d]) => <label key={v} className={`flex flex-col gap-0.5 p-3 rounded-lg border text-xs cursor-pointer ${form.selectionMode === v ? "border-[#00130d] bg-slate-50" : "border-slate-200"}`}>
                <span className="flex items-center gap-2 font-semibold text-slate-900"><input type="radio" name="packMode" value={v} checked={form.selectionMode === v} onChange={() => set("selectionMode", v)} />{t}</span>
                <span className="text-[11px] text-slate-500">{d}</span>
              </label>)}
          </div>
          {flexible && <FormField label="Pack size (pieces the customer must choose)" required error={errors.packSize} hint="e.g. 200. The customer must pick exactly this many pieces, across any of the SKUs below, before the pack can be ordered."><input type="number" min={1} step={1} className={`${inp} max-w-[10rem]`} value={form.packSize} onChange={(e) => set("packSize", e.target.value)} data-testid="pack-size" /></FormField>}
          {flexible && pack?.computed?.hiddenSkus > 0 && <p className="text-[11px] text-amber-700">{pack.computed.hiddenSkus} SKU{pack.computed.hiddenSkus === 1 ? " is" : "s are"} currently hidden from customers (disabled, unpublished or no wholesale price) and not shown here. Saving this pack removes {pack.computed.hiddenSkus === 1 ? "it" : "them"} from the pack.</p>}
        </div>
          {categoryField}
        </div>}
        {step === 1 && <ColorVariantsStep ws={ws} {...stepProps} />}
        {step === 2 && <SkusStep ws={ws} {...stepProps} />}
        {step === 3 && <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Badge" error={errors.badge} hint="e.g. Best value, 50 pieces"><input className={inp} maxLength={40} value={form.badge} onChange={(e) => set("badge", e.target.value)} /></FormField>
          <FormField label="Dispatch / SLA text" error={errors.dispatchText} hint="e.g. Ships within 24h"><input className={inp} maxLength={160} value={form.dispatchText} onChange={(e) => set("dispatchText", e.target.value)} /></FormField>
          <FormField label="Pack wholesale price (Rs.)" error={errors.packPrice} hint="Leave empty to calculate from live SKU wholesale prices. Per-piece price is always calculated."><input type="number" min={0} step="any" className={inp} value={form.packPrice} onChange={(e) => set("packPrice", e.target.value)} /></FormField>
          <FormField label="Reference retail value (Rs.)" error={errors.compareAtValue} hint="Optional, shown struck-through."><input type="number" min={0} step="any" className={inp} value={form.compareAtValue} onChange={(e) => set("compareAtValue", e.target.value)} /></FormField>
          <FormField label="Minimum packs per order" error={errors.moq}><input type="number" min={1} className={inp} value={form.moq} onChange={(e) => set("moq", e.target.value)} /></FormField>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 self-end pb-2"><Toggle checked={form.isFeatured} onChange={(v) => set("isFeatured", v)} /> Featured</label>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <FormField label="Sort order"><input type="number" className={inp} value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></FormField>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} /> Active on storefront</label>
        </div>
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-800">Also offer SKUs from other products <span className="font-normal text-slate-500">(optional) · {form.items.length} extra SKU{form.items.length === 1 ? "" : "s"}</span></span>
          {form.items.map((i, idx) => <div key={i.sku} className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg text-xs">
              <span className="flex-1 truncate" title={i.label}>{i.label}</span>
              {!flexible && <input type="number" min={1} value={i.quantity} onChange={(e) => set("items", form.items.map((x, n) => n === idx ? { ...x, quantity: e.target.value } : x))} className={`${sel} w-20`} aria-label="Quantity" />}
              <button type="button" onClick={() => set("items", form.items.filter((_, n) => n !== idx))} className="p-1 text-slate-400 hover:text-rose-600" aria-label="Remove"><X className="w-4 h-4" /></button>
            </div>)}
          {errors.items && <p className="text-xs text-rose-600">{errors.items}</p>}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <SearchInput value={pq} onChange={(v) => { setPq(v); setProductId(""); }} placeholder="Search a product to add SKUs (min 2 characters)…" />
            {found.isFetching && <p className="text-[11px] text-slate-400">Searching…</p>}
            {!productId && (found.data?.items || []).map((p) => <button key={p._id} type="button" onClick={() => setProductId(p._id)} className="flex items-center justify-between gap-2 w-full text-left text-xs px-2 py-1.5 rounded hover:bg-white"><span className="truncate">{p.name}</span><span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${channelOfProduct(p) === "retail" ? "bg-slate-100 text-slate-500" : channelOfProduct(p) === "wholesale" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{channelLabel(channelOfProduct(p))}</span></button>)}
            {productId && (detail.isLoading ? <LoadingSkeleton rows={2} /> : detail.isError ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} /> : <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold"><span>{detail.data.name} <span className="font-normal text-slate-500">· {channelLabel(channelOfProduct(detail.data))}{detail.data.status !== "active" ? " · not published yet" : ""}</span></span>
                  <span className="flex items-center gap-3"><button type="button" data-testid="pack-all-skus" className="px-2.5 py-1 bg-[#00130d] text-white rounded-lg font-semibold" onClick={() => addSkus()}>All SKUs</button><button type="button" className="text-slate-400 underline" onClick={() => setProductId("")}>Back</button></span></div>
                {detail.data.status !== "active" && <p className="text-[11px] text-amber-700">Draft or inactive products can be added now, but customers can only order them once the product is published (status Active).</p>}
                {(detail.data.variants || []).map((v) => <div key={v._id} className="text-xs"><div className="flex items-center gap-3 text-slate-500 mb-1"><span>{v.color?.name}</span><button type="button" className="text-[11px] text-emerald-800 underline" onClick={() => addSkus(v._id)}>Add all sizes</button></div><div className="flex flex-wrap gap-1.5">{(v.sizes || []).map((s) => { const why = packSkuBlocker(detail.data, v, s); const used = form.items.some((i) => i.sku === s._id); return <button key={s._id} type="button" disabled={Boolean(why) || used} title={why || (used ? "Already in the pack" : "")} onClick={() => addSku(v, s)} className="px-2 py-1 border border-slate-200 bg-white rounded hover:bg-emerald-50 font-mono disabled:opacity-40 disabled:hover:bg-white">{s.size} · {s.sku}</button>; })}</div></div>)}
              </div>)}
          </div>
        </div>
        </div>}
        {step === 4 && <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3" data-testid="pack-review">
          <h5 className="text-xs font-bold text-slate-800">Review</h5>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div><span className="text-slate-400 block text-[10px]">Pack</span><span className="font-semibold">{form.name || "—"}</span></div>
            <div><span className="text-slate-400 block text-[10px]">Customer chooses</span><span className="font-semibold">{form.packSize || "—"} pieces</span></div>
            <div><span className="text-slate-400 block text-[10px]">Colours</span><span className="font-semibold">{ws.drafts.filter((d) => !d.isNew).length} saved{unsavedColours ? ` · ${unsavedColours} unsaved` : ""}</span></div>
            <div><span className="text-slate-400 block text-[10px]">SKUs on offer</span><span className="font-semibold">{ownSkuCount + form.items.length}{ws.drafts.some((d) => d.sizes.some((z) => z.isNew)) ? " + unsaved" : ""}</span></div>
          </div>
          <p className="text-[11px] text-slate-500">Saving stores any unsaved colours and SKUs, publishes the pack's wholesale-only product (never shown in the shop) and creates the pack with every enabled SKU of that product{form.items.length ? ` plus ${form.items.length} from other products` : ""}.</p>
          {!form.isActive && <p className="text-xs text-amber-700">The pack is set to inactive: customers will not see it.</p>}
        </div>}

        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <button type="button" disabled={step === 0 || wizardBusy} onClick={() => setStep((n) => Math.max(0, n - 1))} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold ${step === 0 ? "text-slate-300 cursor-not-allowed" : "text-slate-700 bg-slate-100 hover:bg-slate-200"}`}><ChevronLeft className="w-4 h-4" /> Previous Step</button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={requestClose} disabled={wizardBusy} className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800">Close</button>
            {step < PACK_STEPS.length - 1 ? <button type="button" onClick={next} disabled={wizardBusy} data-testid="pack-next" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{step === 0 && needsProduct ? "Save & continue" : "Next Step"} <ChevronRight className="w-4 h-4" />
              </button> : canManage ? <button type="button" onClick={saveFlexible} disabled={wizardBusy} data-testid="pack-save" className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-800 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-60">
                {wizardBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{isEdit ? "Save changes" : "Create pack"}
              </button> : null}
          </div>
        </div>
      </div>
    </Modal>;
};

const PacksTab = ({ canManage }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editor, setEditor] = useState(null);
  const params = { page, limit: pageSize };
  const q = useQuery({ queryKey: keys.wholesale.packs(params), queryFn: () => wholesaleApi.listPacks(params), placeholderData: keepPreviousData });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }) => wholesaleApi.setPackActive(id, isActive),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.wholesale.all }); addToast("Pack status updated."); },
    onError: (err) => addToast(errorMessage(err, "Could not update pack"), "error"),
  });
  const items = q.data?.items || [];
  const openEdit = async (p) => { try { setEditor({ pack: await wholesaleApi.getPack(p._id) }); } catch (err) { addToast(errorMessage(err, "Could not load pack"), "error"); } };
  return <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-slate-100">
        <p className="text-xs text-slate-500">Ready-made wholesale packs shown to B2B customers.</p>
        {canManage && <button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={() => setEditor({ pack: null })}><Plus className="w-3.5 h-3.5" />New pack</button>}
      </div>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} className="border-0" /> : q.isLoading ? <div className="p-6"><LoadingSkeleton rows={4} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title="No Wholesale Packs" description="Create a pack to offer ready-made bulk bundles." /></div> : <div className="overflow-x-auto"><table className="w-full text-left border-collapse">
          <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-3 px-4">Pack</th><th className="py-3 px-4 text-center">SKUs</th><th className="py-3 px-4 text-center">Units</th><th className="py-3 px-4 text-right">Pack price</th><th className="py-3 px-4 text-right">Per piece</th><th className="py-3 px-4">Active</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100 text-xs">{items.map((p) => <tr key={p._id} className="hover:bg-slate-50/70">
              <td className="py-3.5 px-4"><div className="flex items-center gap-3">{p.image?.url && <img src={p.image.url} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200" />}<div><div className="font-semibold text-slate-900">{p.name}{p.isFeatured && <span className="ml-1.5 text-[10px] text-amber-700 font-bold">★ Featured</span>}{p.badge && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">{p.badge}</span>}</div><div className="text-[10px] font-mono text-slate-400">{p.slug}</div></div></div></td>
              <td className="py-3.5 px-4 text-center font-mono">{p.items?.length || 0}</td>
              <td className="py-3.5 px-4 text-center font-mono">{p.selectionMode === "flexible" ? <span title="Customer chooses the colours and sizes">{formatNumber(p.packSize)} <span className="text-[10px] text-emerald-800 font-sans font-semibold">flexible</span></span> : formatNumber((p.items || []).reduce((s, i) => s + i.quantity, 0))}</td>
              <td className="py-3.5 px-4 text-right font-mono font-bold">{p.computed?.available ? (p.computed.packPrice != null ? formatMoney(p.computed.packPrice) : <span className="text-slate-500 font-normal">per piece</span>) : <span className="text-rose-600 font-semibold" title={p.computed?.reason}>Unavailable</span>}</td>
              <td className="py-3.5 px-4 text-right font-mono">{p.computed?.perPiece != null ? formatMoney(p.computed.perPiece) : p.computed?.perPieceMin != null ? (p.computed.perPieceMin === p.computed.perPieceMax ? formatMoney(p.computed.perPieceMin) : `${formatMoney(p.computed.perPieceMin)} – ${formatMoney(p.computed.perPieceMax)}`) : "—"}</td>
              <td className="py-3.5 px-4"><Toggle checked={p.isActive} disabled={!canManage || toggle.isPending} onChange={(v) => toggle.mutate({ id: p._id, isActive: v })} /></td>
              <td className="py-3.5 px-4 text-right"><button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title={canManage ? "Edit pack" : "View pack"}><Pencil className="w-4 h-4" /></button></td>
            </tr>)}</tbody></table></div>}
      {q.data?.meta && items.length > 0 && <Pagination currentPage={q.data.meta.page} totalItems={q.data.meta.total} pageSize={q.data.meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="pack" labelPlural="packs" />}
      {editor && <PackEditor key={editor.pack?._id || "new"} pack={editor.pack} canManage={canManage} onClose={() => setEditor(null)} />}
    </div>;
};

/* -------------------------------- Requests --------------------------------- */
export const WholesalePage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const { can } = useAuth();
  const canManage = can("wholesale.manage");

  const [tab, setTab] = useState("requests");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeId, setActiveId] = useState(routeId || null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [scheme, setScheme] = useState({ enabled: false, name: "", discountPercent: "", minimumOrderQuantity: "" });
  const [formError, setFormError] = useState("");
  const dq = useDebouncedValue(search, 350);
  useEffect(() => { if (routeId) setActiveId(routeId); }, [routeId]);

  const params = { search: dq.trim() || undefined, status: status === "all" ? undefined : status, requestType: type === "all" ? undefined : type, page, limit: pageSize };
  const listQuery = useQuery({ queryKey: keys.wholesale.list(params), queryFn: () => wholesaleApi.listRequests(params), placeholderData: keepPreviousData, enabled: tab === "requests" });
  const statsQuery = useQuery({ queryKey: keys.wholesale.stats, queryFn: wholesaleApi.stats });
  const detailQuery = useQuery({ queryKey: keys.wholesale.detail(activeId), queryFn: () => wholesaleApi.getRequest(activeId), enabled: !!activeId });
  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;
  const stats = statsQuery.data;
  const r = detailQuery.data;

  const afterAction = (msg) => { queryClient.invalidateQueries({ queryKey: keys.wholesale.all }); queryClient.invalidateQueries({ queryKey: keys.quotes.all }); queryClient.invalidateQueries({ queryKey: keys.dashboard.summary }); addToast(msg); setApproveOpen(false); setFormError(""); };
  const reviewM = useMutation({ mutationFn: (p) => wholesaleApi.review(activeId, p), onSuccess: (_d, v) => afterAction(v.action === "reject" ? "Application rejected." : "Application moved to review."), onError: (err) => addToast(errorMessage(err, "Action failed"), "error") });
  const approveM = useMutation({ mutationFn: (p) => wholesaleApi.approve(activeId, p), onSuccess: () => afterAction("Account approved."), onError: (err) => { const { fields, general } = splitFormError(err, "Could not approve"); setFormError(Object.values(fields)[0] || general); } });

  const submitApprove = () => {
    let discountScheme;
    if (scheme.enabled) {
      const pct = Number(scheme.discountPercent); const moq = Number(scheme.minimumOrderQuantity);
      if (!scheme.name.trim()) return setFormError("Enter a name for the discount scheme.");
      if (!(pct >= 0 && pct <= 100) || scheme.discountPercent === "") return setFormError("Discount must be between 0 and 100%.");
      if (!Number.isInteger(moq) || moq < 1) return setFormError("Minimum order quantity must be a whole number of at least 1.");
      discountScheme = { name: scheme.name.trim(), discountPercent: pct, minimumOrderQuantity: moq };
    }
    setFormError("");
    approveM.mutate({ adminNotes: notes, discountScheme });
  };

  const open = (id) => { setActiveId(id); if (routeId !== id) navigate(`/wholesale/${id}`); };
  const close = () => { setActiveId(null); if (routeId) navigate("/wholesale"); };
  const reset = (setter) => (v) => { setter(v); setPage(1); };
  const actionable = r && ["pending", "under_review"].includes(r.status);
  const filtersActive = dq || status !== "all" || type !== "all";
  const tabBtn = (id, label) => <button onClick={() => setTab(id)} className={`px-4 py-2 text-xs font-semibold rounded-lg ${tab === id ? "bg-[#0f2922] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>;

  return <div className="space-y-6">
      <PageHeader breadcrumb={[{ label: "B2B Manufacturing" }, { label: "Wholesale" }]} title="Institutional Wholesale & B2B Portals" description="Review wholesale applications from customers, assign approved discount schemes and manage ready-made wholesale packs." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[["Total Requests", stats?.totalInquiries, "text-slate-900", "Wholesale requests received"], ["Under Review", stats?.underReview, "text-amber-600", "Awaiting a decision"], ["Approved Partners", stats?.approvedPartners, "text-emerald-800", "Approved or beyond"], ["Requested Volume", stats?.requestedVolume, "text-blue-600", "Units across open requests"]].map(([label, v, c, hint]) => <div key={label} className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
            <div className={`text-2xl font-bold font-mono mt-1 ${c}`}>{v == null ? "—" : formatNumber(v)}</div>
            <span className="text-xs text-slate-500 mt-1 block">{hint}</span>
          </div>)}
      </div>
      {statsQuery.isError && <p className="text-xs text-rose-600">Couldn't load wholesale totals. <button className="underline" onClick={() => statsQuery.refetch()}>Retry</button></p>}

      <div className="flex gap-2">{tabBtn("requests", "Applications")}{tabBtn("packs", "Ready Packs")}</div>

      {tab === "packs" ? <PacksTab canManage={canManage} /> : <>
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="max-w-md w-full"><SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by company, representative, email, NTN, application #..." /></div>
          <div className="flex items-center gap-2">
            <select value={type} onChange={(e) => reset(setType)(e.target.value)} className={sel}><option value="all">All Types</option><option value="custom">Custom bulk</option><option value="ready_pack">Ready pack</option></select>
            <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={sel}><option value="all">All Statuses</option>{WHOLESALE_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={6} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title={filtersActive ? "No Applications Match" : "No Wholesale Applications"} description={filtersActive ? "No applications match the filters." : "Applications submitted by customers appear here."} /></div> : <div className="overflow-x-auto"><table className="w-full text-left border-collapse">
              <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-3 px-4">Application #</th><th className="py-3 px-4">Organization & Contact</th><th className="py-3 px-4">Type</th><th className="py-3 px-4">Business</th><th className="py-3 px-4 text-center">Units</th><th className="py-3 px-4">Tax NTN</th><th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100 text-xs">{items.map((x) => <tr key={x._id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => open(x._id)}>
                  <td className="py-3.5 px-4"><span className="font-mono font-bold text-slate-900">{x.requestNumber}</span><div className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(x.createdAt)}</div></td>
                  <td className="py-3.5 px-4"><div className="font-semibold text-slate-900">{x.customer?.businessName || x.customer?.name}</div><div className="text-slate-500 text-[11px]">{x.customer?.name}</div></td>
                  <td className="py-3.5 px-4"><span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-700">{x.requestType === "ready_pack" ? x.sourcePack?.name || "Ready pack" : "Custom bulk"}</span></td>
                  <td className="py-3.5 px-4 text-slate-700">{x.customer?.businessType || "—"}</td>
                  <td className="py-3.5 px-4 text-center font-mono font-bold">{x.requestedVolume != null ? formatNumber(x.requestedVolume) : "—"}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-600">{x.customer?.taxNtn || "—"}</td>
                  <td className="py-3.5 px-4"><StatusBadge status={x.status} /></td>
                  <td className="py-3.5 px-4 text-right"><button onClick={(e) => { e.stopPropagation(); open(x._id); }} title="Review application" className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg"><Eye className="w-4 h-4" /></button></td>
                </tr>)}</tbody></table></div>}
          {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="application" labelPlural="applications" />}
          {listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
        </div>
      </>}

      <Drawer isOpen={Boolean(activeId)} onClose={close} title={r?.customer?.businessName || r?.customer?.name || "Wholesale Application"} subtitle={r ? `Ref: ${r.requestNumber}` : ""} badge={r && <StatusBadge status={r.status} />}
        headerActions={r && <div className="flex items-center gap-1.5">
          {can("quotes.manage") && r.status === "approved" && !r.quote && <button onClick={() => setQuoteOpen(true)} className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`}>Create quote</button>}
          {canManage && actionable && <>
          {r.status === "pending" && <button onClick={() => reviewM.mutate({ action: "review" })} disabled={reviewM.isPending} className={`${btn} bg-amber-50 text-amber-800 hover:bg-amber-100`}>Start review</button>}
          <button onClick={() => { setNotes(""); setFormError(""); setApproveOpen(true); }} className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`}>Approve Account</button>
          <button onClick={() => reviewM.mutate({ action: "reject" })} disabled={reviewM.isPending} className={`${btn} bg-rose-50 text-rose-700 hover:bg-rose-100`}>Decline</button></>}
        </div>}>
        {detailQuery.isLoading ? <LoadingSkeleton rows={5} /> : detailQuery.isError ? <ErrorState error={detailQuery.error} onRetry={() => detailQuery.refetch()} /> : r && <div className="space-y-5 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between"><span className="text-slate-400 text-[10px]">Tax Registration (NTN)</span><span className="font-mono font-bold">{r.customer?.taxNtn || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-[10px]">Business Type</span><span className="font-semibold">{r.customer?.businessType || "—"}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-[10px]">Requested Volume</span><span className="font-mono font-bold text-emerald-800">{r.requestedVolume != null ? `${formatNumber(r.requestedVolume)} units` : "—"}</span></div>
              {r.pricing?.estimatedTotal != null && <div className="flex justify-between"><span className="text-slate-400 text-[10px]">Estimated total</span><span className="font-mono font-bold">{formatMoney(r.pricing.estimatedTotal)}</span></div>}
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
              <h5 className="font-bold text-slate-900">Key Representative</h5>
              <p className="font-semibold text-slate-800">{r.customer?.name}</p>
              <div className="flex items-center gap-2 text-slate-500"><Mail className="w-3.5 h-3.5 text-slate-400" />{r.customer?.email}</div>
              <div className="flex items-center gap-2 text-slate-500"><Phone className="w-3.5 h-3.5 text-slate-400" />{r.customer?.phone}</div>
            </div>
            {r.partnershipProposal && <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1"><h5 className="font-bold text-slate-900">Partnership Proposal</h5><p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{r.partnershipProposal}</p></div>}
            {r.customerNotes && <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1"><h5 className="font-bold text-slate-900">Customer Notes</h5><p className="text-slate-600 whitespace-pre-wrap">{r.customerNotes}</p></div>}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 text-[10px] uppercase tracking-wider font-bold text-slate-500">{r.requestType === "ready_pack" ? `Ready pack · ${r.sourcePack?.name || ""}` : "Requested items"}</div>
              <ul className="divide-y divide-slate-100">{(r.items || []).map((i) => <li key={i._id || i.sku} className="px-4 py-2.5 flex justify-between gap-3"><div><div className="font-semibold">{i.productName}</div><div className="text-slate-500">{[i.colorName, i.size, i.skuCode].filter(Boolean).join(" · ")}</div></div><div className="text-right font-mono"><div>{i.quantity} × {formatMoney(i.wholesalePrice)}</div><div className="font-bold">{formatMoney(i.lineTotal)}</div></div></li>)}</ul>
            </div>
            {r.discountScheme?.name && <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl space-y-1 text-amber-950"><div className="flex items-center gap-2 font-bold"><Percent className="w-4 h-4 text-amber-700" />Assigned Discount Scheme</div><p className="text-[11px] text-amber-800">{r.discountScheme.name}: {r.discountScheme.discountPercent}% off with a minimum order of {r.discountScheme.minimumOrderQuantity} units.</p></div>}
            {r.adminNotes && <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl"><h5 className="font-bold text-slate-900 mb-1">Staff Notes</h5><p className="text-slate-600 whitespace-pre-wrap">{r.adminNotes}</p></div>}
            <div className="text-slate-500 space-y-1">{r.reviewedBy && <div>Reviewed by {r.reviewedBy.name} · {formatDateTime(r.reviewedAt)}</div>}{r.approvedBy && <div>Approved by {r.approvedBy.name} · {formatDateTime(r.approvedAt)}</div>}</div>
          </div>}
      </Drawer>

      {quoteOpen && r && <CreateQuoteModal sourceType="wholesale" requestId={r._id} requestNumber={r.requestNumber} onClose={() => setQuoteOpen(false)} />}
      <Modal isOpen={approveOpen} onClose={() => !approveM.isPending && setApproveOpen(false)} title="Approve wholesale account" maxWidth="md">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Toggle checked={scheme.enabled} onChange={(v) => setScheme((s) => ({ ...s, enabled: v }))} /> Assign a discount scheme</label>
          {scheme.enabled && <div className="grid grid-cols-2 gap-3">
              <FormField label="Scheme name" required className="col-span-2"><input className={inp} maxLength={160} value={scheme.name} onChange={(e) => setScheme((s) => ({ ...s, name: e.target.value }))} /></FormField>
              <FormField label="Discount %" required><input type="number" min={0} max={100} step="0.1" className={inp} value={scheme.discountPercent} onChange={(e) => setScheme((s) => ({ ...s, discountPercent: e.target.value }))} /></FormField>
              <FormField label="Minimum order qty" required><input type="number" min={1} className={inp} value={scheme.minimumOrderQuantity} onChange={(e) => setScheme((s) => ({ ...s, minimumOrderQuantity: e.target.value }))} /></FormField>
            </div>}
          <FormField label="Staff notes"><textarea className={inp} rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
          {formError && <p className="text-xs text-rose-600">{formError}</p>}
          <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={() => setApproveOpen(false)} disabled={approveM.isPending}>Cancel</button><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={submitApprove} disabled={approveM.isPending}>{approveM.isPending ? "Approving…" : "Approve"}</button></div>
        </div>
      </Modal>
    </div>;
};
