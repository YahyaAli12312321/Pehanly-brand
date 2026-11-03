import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { productsApi } from "../../services/productsApi";
import { errorMessage, toApiError } from "../../lib/apiError";
import { useToastStore } from "../../store/toastStore";
import { ErrorState } from "../common/ErrorState";
import { LoadingSkeleton } from "../common/LoadingSkeleton";
import { VariantCard } from "./VariantCard";
import { KIDS_SIZE_CHART, countUnsaved, dropOtherModeRows, generateAllSkus, newVariantDraft, sizesForMode, validateVariant, variantToDraft } from "./variantDraft";

/**
 * The Color Variants and SKUs steps, shared by Product Creation and the flexible Wholesale Pack wizard.
 * One state hook (useVariantWorkspace) + two step components, so both flows run the exact same UI, SKU
 * generation (Adult / Kids / Manual), validation and save logic against the real variant endpoints.
 */

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


export function useVariantWorkspace({ currentId, onSaved }) {
  const addToast = useToastStore((s) => s.addToast);
  const [drafts, setDrafts] = useState([]);
  const [variantErrors, setVariantErrors] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [sizeMode, setSizeMode] = useState("manual"); // one SKU mode per product: adult | kids | manual

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
      onSaved?.(); // refresh lists / readiness
    } else {
      addToast(r.message, "error");
    }
  };

  const updateDraft = (next) => setDrafts((list) => list.map((d) => (d.key === next.key ? { ...next, dirty: true } : d)));
  const removeDraft = (key) => setDrafts((list) => list.filter((d) => !(d.key === key && d.isNew)));
  const unsavedCount = countUnsaved(drafts);
  // "All SKUs": add the missing colour x size rows in one click (shared helper; never duplicates or overwrites).
  const addAllSkus = (mode = sizeMode, base = drafts) => {
    const r = generateAllSkus(base, { sizes: sizesForMode(mode) });
    if (r.added > 0 || base !== drafts) setDrafts(r.drafts);
    const skipped = r.skipped.length ? ` ${r.skipped.length} skipped: ${r.skipped.slice(0, 3).map((s) => `${s.variant}${s.size ? ` ${s.size}` : ""} (${s.reason})`).join("; ")}${r.skipped.length > 3 ? "; …" : ""}` : "";
    if (r.added > 0) addToast(`Added ${r.added} SKU${r.added === 1 ? "" : "s"}. Review them, then save each colour.${skipped}`, r.skipped.length ? "info" : "success");
    else addToast(r.skipped.length ? `No SKUs added.${skipped}` : r.sizes.length ? "Every colour already has all sizes. Nothing to add." : "Add at least one size to a colour first.", "info");
  };
  // Choosing Adult/Kids swaps to that audience and generates its full size list for every colour; Manual changes nothing.
  const chooseSizeMode = (mode) => {
    if (mode === sizeMode) return;
    setSizeMode(mode);
    if (mode === "manual") return;
    const { drafts: base, dropped, kept } = dropOtherModeRows(drafts, mode);
    if (kept) addToast(`${kept} saved or edited SKU${kept === 1 ? "" : "s"} from the other size range ${kept === 1 ? "was" : "were"} kept. Review them.`, "info");
    else if (dropped) addToast(`Removed ${dropped} unsaved ${dropped === 1 ? "SKU" : "SKUs"} from the other size range.`, "info");
    addAllSkus(mode, base);
  };
  const addVariant = () => setDrafts((list) => [...list, newVariantDraft(list.length)]);
  return { drafts, setDrafts, variantErrors, setVariantErrors, savingKey, sizeMode, setSizeMode, persistVariant, saveVariant, updateDraft, removeDraft, addVariant, addAllSkus, chooseSizeMode, unsavedCount };
}

/** Variant cards (section "color" = colour/code/images, "sizes" = SKU matrix) or the "create the product first" notice. */
export const VariantSections = ({ ws, section, canManage, needsProduct, working, onCreateProduct, createNote, createLabel = "Create draft now", loading, error, onRetry }) => (
  <div className="space-y-3">
    {needsProduct ? <div className="p-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-600 space-y-3">
        <p>{createNote}</p>
        {canManage && <button type="button" disabled={working} onClick={onCreateProduct} data-testid="create-backing" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60">
            {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {createLabel}
          </button>}
      </div> : loading ? <LoadingSkeleton rows={3} /> : error ? <ErrorState error={error} onRetry={onRetry} /> : <>
        {ws.drafts.length === 0 && <div className="p-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-600">No colour variants yet. A product needs at least one enabled colour with an enabled size and price before it can be published.</div>}
        {ws.drafts.map((d) => <VariantCard key={d.key} draft={d} section={section} onChange={ws.updateDraft} onSave={() => ws.saveVariant(d)} onRemove={() => ws.removeDraft(d.key)} saving={ws.savingKey === d.key} errors={ws.variantErrors[d.key]} canManage={canManage} sizeMode={section === "sizes" ? ws.sizeMode : "manual"} />)}
      </>}
  </div>
);

export const ColorVariantsStep = ({ ws, canManage, needsProduct, ...rest }) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h4 className="text-xs font-semibold text-slate-900">Color Variants (Parent Variants)</h4>
        <p className="text-[11px] text-slate-500">Each colour variant groups a distinct fabric tone, its images and nested sizes.</p>
      </div>
      {canManage && !needsProduct && <button type="button" onClick={ws.addVariant} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"><Plus className="w-3.5 h-3.5" /> Add Color Variant</button>}
    </div>
    <VariantSections ws={ws} section="color" canManage={canManage} needsProduct={needsProduct} {...rest} />
  </div>
);

export const SkusStep = ({ ws, canManage, needsProduct, ...rest }) => {
  const { sizeMode, chooseSizeMode, addAllSkus, drafts } = ws;
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-slate-900">Nested SKU & Pricing Matrix</h4>
        <p className="text-[11px] text-slate-500">Size, SKU code, PKR and USD retail / compare-at price and wholesale price per colour. USD is optional and merchant-set. Opening stock is only set for new SKUs. Low stock is fixed at 10 units or fewer.</p>
      </div>
      {!needsProduct && canManage && drafts.length > 0 && <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div role="radiogroup" aria-label="SKU generation mode" data-testid="size-mode" className="flex rounded-lg border border-slate-200 overflow-hidden w-full sm:w-auto">
            {[["adult", "Adult"], ["kids", "Kids"], ["manual", "Manual"]].map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={sizeMode === k} data-testid={`size-mode-${k}`} onClick={() => chooseSizeMode(k)} className={`px-3 py-2 text-xs font-semibold ${sizeMode === k ? "bg-[#00130d] text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}>{label}</button>)}
          </div>
          <button type="button" onClick={() => addAllSkus()} data-testid="all-skus" className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800">
            <Plus className="w-3.5 h-3.5" /> {sizeMode === "manual" ? "All SKUs" : "Generate missing SKUs"}
          </button>
          <span className="text-[11px] text-slate-500 flex-1 min-w-[14rem]">{sizeMode === "adult" ? `Adult sizes (${sizesForMode("adult").join(", ")}) are generated for every colour as soon as you pick Adult.` : sizeMode === "kids" ? `Kids sizes from the client chart (${KIDS_SIZE_CHART.map((k) => `${k.size} ${k.age}`).join(", ")}) are generated for every colour as soon as you pick Kids.` : "Manual: add sizes one by one, or use All SKUs to copy the sizes already on any colour to every colour."} Codes follow VARIANTCODE-SIZE. Existing SKUs and anything you typed are kept; running it again adds nothing new. Review the rows, then save each colour.</span>
        </div>}
      <VariantSections ws={ws} section="sizes" canManage={canManage} needsProduct={needsProduct} {...rest} />
    </div>
  );
};
