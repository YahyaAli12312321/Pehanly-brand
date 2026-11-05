import { useState } from "react";
import { Check, Copy, Loader2, Plus, X } from "lucide-react";
import { productsApi } from "../../services/productsApi";
import { errorMessage, toApiError } from "../../lib/apiError";
import { useToastStore } from "../../store/toastStore";
import { ErrorState } from "../common/ErrorState";
import { LoadingSkeleton } from "../common/LoadingSkeleton";
import { VariantCard } from "./VariantCard";
import { KIDS_SIZE_CHART, applyColorPlan, countUnsaved, dropOtherModeRows, generateAllSkus, newVariantDraft, planApplyToAllColors, sizesForMode, validateVariant, variantToDraft } from "./variantDraft";

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


const FIELD_LABEL = { price: "Price", compareAtPrice: "Compare-at", wholesalePrice: "Wholesale", priceUSD: "USD price", compareAtPriceUSD: "USD compare-at", stock: "Opening stock" };
const money = (v) => (v === "" || v === null || v === undefined ? "-" : Number(v).toLocaleString());

/**
 * "Apply to All Colors": copy one colour's sizes, prices and opening stock to every other colour.
 * Preview first (source, targets, what is copied, conflicts), confirm conflicts explicitly, then a result summary.
 * Nothing is saved to the server here - the rows land in the normal drafts, editable per colour, saved per colour as always.
 */
function ApplyToAllColors({ ws }) {
  const { drafts, setDrafts } = ws;
  const addToast = useToastStore((s) => s.addToast);
  const [open, setOpen] = useState(false);
  const [sourceKey, setSourceKey] = useState("");
  const [result, setResult] = useState(null);
  const named = drafts.filter((d) => d.color?.name?.trim());
  const defaultSource = () => (drafts.find((d) => d.sizes.some((x) => Number(x.price) > 0))?.key) || drafts[0]?.key || "";
  const plan = open ? planApplyToAllColors(drafts, sourceKey || defaultSource()) : null;
  const openPanel = () => { setSourceKey(defaultSource()); setResult(null); setOpen(true); };
  const run = (overwriteConflicts) => {
    const r = applyColorPlan(drafts, plan, { overwriteConflicts });
    setDrafts(r.drafts);
    setResult({ ...r.summary, source: plan.source.name, overwrote: overwriteConflicts });
    setOpen(false);
    addToast(`Apply to All Colors: ${r.summary.created} SKU${r.summary.created === 1 ? "" : "s"} created${r.summary.updated ? `, ${r.summary.updated} updated` : ""}. Review them, then save each colour.`, "success");
  };
  const total = plan ? plan.create.length + plan.fill.length : 0;
  return (
    <>
      <button type="button" onClick={openPanel} disabled={drafts.length < 2} title={drafts.length < 2 ? "Add at least two colours first" : undefined} data-testid="apply-all-colors" className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed">
        <Copy className="w-3.5 h-3.5" /> Apply to All Colors
      </button>
      {(open || result) && <div className="basis-full" data-testid="apply-panel">
        {open && plan && <div className="p-4 bg-white border border-slate-300 rounded-xl space-y-3" role="region" aria-label="Apply to all colors">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h5 className="text-xs font-semibold text-slate-900">Apply to All Colors</h5>
              <p className="text-[11px] text-slate-500">Copies sizes, prices and opening stock from one colour to the others. Existing values are never replaced without your confirmation.</p>
            </div>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="p-1 text-slate-500 hover:text-slate-900"><X className="w-4 h-4" /></button>
          </div>
          <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">Copy from
            <select data-testid="apply-source" value={sourceKey || defaultSource()} onChange={(e) => setSourceKey(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-xs">
              {drafts.map((d) => <option key={d.key} value={d.key}>{d.color?.name?.trim() || "Unnamed colour"}</option>)}
            </select>
          </label>
          {plan.error ? <p className="text-xs text-rose-600" data-testid="apply-error">{plan.error}</p> : <>
            <div className="text-xs text-slate-700" data-testid="apply-targets"><b>Applies to:</b> {plan.targets.length ? plan.targets.map((t) => t.name).join(", ") : "no other colours"}</div>
            <div className="overflow-x-auto"><table className="text-xs border border-slate-200 rounded-lg" data-testid="apply-preview">
              <thead className="bg-slate-50 text-slate-600"><tr>{["Size", "Price", "Compare-at", "Wholesale", "USD", "Stock"].map((h) => <th key={h} className="px-3 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
              <tbody>{plan.rows.map((r) => <tr key={r.size} className="border-t border-slate-100"><td className="px-3 py-1.5 font-semibold">{r.size}</td><td className="px-3 py-1.5">{money(r.price)}</td><td className="px-3 py-1.5">{money(r.compareAtPrice)}</td><td className="px-3 py-1.5">{money(r.wholesalePrice)}</td><td className="px-3 py-1.5">{money(r.priceUSD)}</td><td className="px-3 py-1.5">{r.stock}</td></tr>)}</tbody>
            </table></div>
            <ul className="text-xs text-slate-700 space-y-0.5" data-testid="apply-counts">
              <li><b>{plan.create.length}</b> new SKU{plan.create.length === 1 ? "" : "s"} will be created</li>
              {plan.fill.length > 0 && <li><b>{plan.fill.length}</b> empty existing row{plan.fill.length === 1 ? "" : "s"} will be filled in</li>}
              <li><b>{plan.same.length}</b> already match and will be skipped</li>
              {plan.conflicts.length > 0 && <li className="text-amber-700"><b>{plan.conflicts.length}</b> existing row{plan.conflicts.length === 1 ? " has" : "s have"} different values (conflict)</li>}
            </ul>
            {plan.conflicts.length > 0 && <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1" data-testid="apply-conflicts">
              <p className="text-xs font-semibold text-amber-900">Conflicts - these rows already hold different values:</p>
              <ul className="text-[11px] text-amber-900 max-h-32 overflow-auto space-y-0.5">{plan.conflicts.map((c) => <li key={`${c.target}-${c.size}`}>{c.variant} {c.size} ({c.sku}): {c.diffs.map((x) => `${FIELD_LABEL[x.field]} ${money(x.from)} → ${money(x.to)}`).join(", ")}</li>)}</ul>
            </div>}
            {plan.stockKept.length > 0 && <p className="text-[11px] text-slate-500" data-testid="apply-stock-kept">Saved SKUs keep their live stock ({plan.stockKept.length} differ). Change saved stock with an inventory adjustment.</p>}
            {plan.skipped.length > 0 && <ul className="text-[11px] text-slate-500 list-disc pl-4" data-testid="apply-skipped">{plan.skipped.slice(0, 6).map((k, i) => <li key={i}>{k.variant}{k.size ? ` ${k.size}` : ""}: {k.reason}</li>)}{plan.skipped.length > 6 && <li>…and {plan.skipped.length - 6} more</li>}</ul>}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => run(false)} disabled={total === 0 && plan.conflicts.length === 0} data-testid="apply-confirm" className="px-3 py-2 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50">{plan.conflicts.length ? `Add missing only (keep ${plan.conflicts.length} existing)` : total ? `Apply to ${plan.targets.length} colour${plan.targets.length === 1 ? "" : "s"}` : "Nothing to add"}</button>
              {plan.conflicts.length > 0 && <button type="button" onClick={() => { if (window.confirm(`Replace the values on ${plan.conflicts.length} existing SKU${plan.conflicts.length === 1 ? "" : "s"} with ${plan.source.name}'s values?`)) run(true); }} data-testid="apply-overwrite" className="px-3 py-2 bg-white border border-amber-400 text-amber-900 text-xs font-semibold rounded-lg hover:bg-amber-50">Add missing and update {plan.conflicts.length} conflict{plan.conflicts.length === 1 ? "" : "s"}…</button>}
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900">Cancel</button>
            </div>
          </>}
        </div>}
        {result && !open && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1" role="status" data-testid="apply-summary">
          <div className="flex items-start justify-between gap-3"><b>Applied {result.source}'s configuration</b><button type="button" aria-label="Dismiss summary" onClick={() => setResult(null)}><X className="w-3.5 h-3.5" /></button></div>
          <div data-testid="apply-summary-counts">SKUs created: <b>{result.created}</b>{result.filled ? <> · filled in: <b>{result.filled}</b></> : null}{result.overwrote ? <> · updated: <b>{result.updated}</b></> : null} · existing skipped: <b>{result.skippedExisting}</b> · conflicts needing attention: <b>{result.conflictsLeft}</b>{result.skipped.length ? <> · not applied: <b>{result.skipped.length}</b></> : null}</div>
          <div className="text-[11px] text-emerald-800">Review or edit any colour, then save each colour. Running it again will not create duplicates.</div>
        </div>}
      </div>}
    </>
  );
}

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
          <ApplyToAllColors ws={ws} />
          <span className="text-[11px] text-slate-500 flex-1 min-w-[14rem]">{sizeMode === "adult" ? `Adult sizes (${sizesForMode("adult").join(", ")}) are generated for every colour as soon as you pick Adult.` : sizeMode === "kids" ? `Kids sizes from the client chart (${KIDS_SIZE_CHART.map((k) => `${k.size} ${k.age}`).join(", ")}) are generated for every colour as soon as you pick Kids.` : "Manual: add sizes one by one, or use All SKUs to copy the sizes already on any colour to every colour."} Codes follow VARIANTCODE-SIZE. Existing SKUs and anything you typed are kept; running it again adds nothing new. Review the rows, then save each colour.</span>
        </div>}
      <VariantSections ws={ws} section="sizes" canManage={canManage} needsProduct={needsProduct} {...rest} />
    </div>
  );
};
