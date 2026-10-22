import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { ImageGalleryUpload } from "../common/ImageGalleryUpload";
import { StatusBadge } from "../common/StatusBadge";
import { newSizeDraft, SIZE_PRESETS, syncSkuForSize, syncSkusForVariantCode } from "./variantDraft";

const cell = "text-xs px-2 py-1 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-[#00130d] outline-none disabled:opacity-60";

/**
 * One colour variant. `section="color"` shows colour/code/images; `section="sizes"` shows the SKU matrix.
 * Both save the whole variant through the real variant endpoint.
 */
export const VariantCard = ({ draft, section, onChange, onSave, onRemove, saving, errors, canManage }) => {
  const set = (patch) => onChange({ ...draft, ...patch });
  const setSize = (key, patch) => set({ sizes: draft.sizes.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  const addSize = () => {
    const used = draft.sizes.map((s) => s.size);
    const next = SIZE_PRESETS.find((s) => !used.includes(s)) || "";
    const tpl = draft.sizes[draft.sizes.length - 1];
    set({ sizes: [...draft.sizes, newSizeDraft(draft.variantCode, next, tpl)] });
  };
  // Variant code changed: regenerate the auto-generated SKUs of NEW rows (hand-typed SKUs and saved SKUs are left alone).
  const changeVariantCode = (value) => {
    const code = value.toUpperCase();
    set({ variantCode: code, sizes: syncSkusForVariantCode(draft.sizes, draft.variantCode, code) });
  };
  // Size changed: an auto-generated SKU follows it (LWC-CB-S -> LWC-CB-M); a hand-typed SKU is kept.
  const changeSize = (key, value) => set({ sizes: draft.sizes.map((s) => (s.key === key ? syncSkuForSize(s, draft.variantCode, value) : s)) });
  const removeNewSize = (key) => set({ sizes: draft.sizes.filter((s) => s.key !== key) });
  const unsaved = draft.isNew || draft.dirty === true;
  const saveBtn = canManage && (
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00130d] text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-60"
    >
      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      {draft.isNew ? "Create colour variant" : "Save colour variant"}
    </button>
  );
  const removeBtn = canManage && draft.isNew && onRemove && (
    <button type="button" onClick={onRemove} disabled={saving} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 disabled:opacity-60" title="Discard this unsaved colour variant">
      <Trash2 className="w-3.5 h-3.5" /> Discard
    </button>
  );
  const skuErrors = draft.sizes.filter((s) => errors?.skus?.[s.key]).map((s) => `Size ${s.size || "?"}: ${errors.skus[s.key]}`);
  const errList = [...(errors?.general || []), ...(errors?.server || [])];
  const colorErrList = [...errList, ...skuErrors]; // the colour section has no SKU table, so list row errors here

  if (section === "color") {
    return <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <input
      type="color"
      value={draft.color.hexCode}
      disabled={!canManage}
      onChange={(e) => set({ color: { ...draft.color, hexCode: e.target.value } })}
      className="w-10 h-10 rounded-lg cursor-pointer border border-slate-300 p-0.5 bg-white"
      aria-label="Colour"
    />
            <div className="space-y-1">
              <input
      type="text"
      value={draft.color.name}
      disabled={!canManage}
      maxLength={60}
      onChange={(e) => set({ color: { ...draft.color, name: e.target.value } })}
      placeholder="Colour name (e.g. Obsidian Black)"
      className={`${cell} font-semibold w-56 bg-white`}
    />
              <div className="flex items-center gap-2">
                <input
      type="text"
      value={draft.variantCode}
      disabled={!canManage}
      maxLength={40}
      onChange={(e) => changeVariantCode(e.target.value)}
      placeholder="VARIANT CODE"
      className={`${cell} font-mono w-36 bg-white`}
    />
                <span className="text-[10px] text-slate-500 font-mono">{draft.sizes.length} sizes</span>
                {unsaved && <span className="text-[10px] font-semibold text-amber-700">{draft.isNew ? "Not saved yet" : "Unsaved changes"}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer">
              <input type="checkbox" disabled={!canManage} checked={draft.isEnabled} onChange={(e) => set({ isEnabled: e.target.checked })} className="rounded border-slate-300 text-[#00130d] focus:ring-0" />
              Enabled
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Order
              <input type="number" min={0} disabled={!canManage} value={draft.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} className={`${cell} w-16 font-mono bg-white`} />
            </label>
          </div>
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-700 block mb-2">Colour images (max 12)</span>
          <ImageGalleryUpload value={draft.images} onChange={(images) => set({ images })} purpose="variant_image" max={12} disabled={!canManage} columns="grid-cols-4 sm:grid-cols-6" />
        </div>
        {colorErrList.length > 0 && <ul className="text-xs text-rose-600 font-medium space-y-0.5" role="alert">{colorErrList.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        <div className="flex justify-end items-center gap-2">{removeBtn}{saveBtn}</div>
      </div>;
  }

  return <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: draft.color.hexCode }} />
          <span className="text-xs font-bold text-slate-800">{draft.color.name || "Unnamed colour"}</span>
          {!draft.isEnabled && <StatusBadge status="Disabled" size="sm" />}
          {unsaved && <span className="text-[10px] font-semibold text-amber-700">{draft.isNew ? "Not saved yet" : "Unsaved changes"}</span>}
        </div>
        {canManage && <button type="button" onClick={addSize} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold rounded hover:bg-slate-50">
            <Plus className="w-3 h-3" /> Add Size SKU
          </button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50/50 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-3">Size</th>
              <th className="py-2.5 px-3">SKU Identifier</th>
              <th className="py-2.5 px-3">Retail (PKR)</th>
              <th className="py-2.5 px-3">Compare-at (PKR)</th>
              <th className="py-2.5 px-3">Retail (USD)</th>
              <th className="py-2.5 px-3">Compare-at (USD)</th>
              <th className="py-2.5 px-3">Wholesale (PKR)</th>
              <th className="py-2.5 px-3">Stock</th>
              <th className="py-2.5 px-3">Low-stock at</th>
              <th className="py-2.5 px-3">Active</th>
              <th className="py-2.5 px-3 text-right"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {draft.sizes.map((s) => <tr key={s.key} className="hover:bg-slate-50/50 align-top">
                <td className="py-2 px-3"><input type="text" value={s.size} disabled={!canManage} maxLength={20} onChange={(e) => changeSize(s.key, e.target.value)} className={`${cell} w-16 font-semibold`} /></td>
                <td className="py-2 px-3">
                  <input type="text" value={s.sku} disabled={!canManage || !s.isNew} maxLength={40} onChange={(e) => setSize(s.key, { sku: e.target.value.toUpperCase() })} title={s.isNew ? "" : "SKU codes can't be changed after creation"} className={`${cell} w-36 font-mono uppercase`} />
                  {errors?.skus?.[s.key] && <div className="text-[10px] text-rose-600 font-medium mt-1 max-w-[9rem]">{errors.skus[s.key]}</div>}
                </td>
                <td className="py-2 px-3"><input type="number" min={0} value={s.price} disabled={!canManage} onChange={(e) => setSize(s.key, { price: e.target.value })} className={`${cell} w-24 font-mono`} /></td>
                <td className="py-2 px-3"><input type="number" min={0} value={s.compareAtPrice} disabled={!canManage} onChange={(e) => setSize(s.key, { compareAtPrice: e.target.value })} className={`${cell} w-24 font-mono`} placeholder="—" /></td>
                <td className="py-2 px-3"><input type="number" min={0} step="0.01" value={s.priceUSD} disabled={!canManage} onChange={(e) => setSize(s.key, { priceUSD: e.target.value })} className={`${cell} w-24 font-mono`} placeholder="Not sold" aria-label={`USD price for ${s.size || "size"}`} /></td>
                <td className="py-2 px-3"><input type="number" min={0} step="0.01" value={s.compareAtPriceUSD} disabled={!canManage || s.priceUSD === ""} onChange={(e) => setSize(s.key, { compareAtPriceUSD: e.target.value })} className={`${cell} w-24 font-mono`} placeholder="—" aria-label={`USD compare-at price for ${s.size || "size"}`} /></td>
                <td className="py-2 px-3"><input type="number" min={0} value={s.wholesalePrice} disabled={!canManage} onChange={(e) => setSize(s.key, { wholesalePrice: e.target.value })} className={`${cell} w-24 font-mono`} placeholder="—" /></td>
                <td className="py-2 px-3">
                  {s.isNew ? <input type="number" min={0} value={s.stock} disabled={!canManage} onChange={(e) => setSize(s.key, { stock: e.target.value })} className={`${cell} w-20 font-mono`} title="Opening stock" /> : <div className="leading-tight" title="Change stock from Inventory">
                      <span className="font-mono font-semibold text-slate-800">{s.available}</span>
                      <span className="text-[10px] text-slate-400"> avail · {s.stock} on hand</span>
                    </div>}
                </td>
                <td className="py-2 px-3"><input type="number" min={0} value={s.lowStockThreshold} disabled={!canManage} onChange={(e) => setSize(s.key, { lowStockThreshold: e.target.value })} className={`${cell} w-16 font-mono`} placeholder="—" /></td>
                <td className="py-2 px-3"><input type="checkbox" disabled={!canManage} checked={s.isEnabled} onChange={(e) => setSize(s.key, { isEnabled: e.target.checked })} className="rounded border-slate-300 text-[#00130d] focus:ring-0 cursor-pointer" /></td>
                <td className="py-2 px-3 text-right">
                  {s.isNew && canManage && <button type="button" onClick={() => removeNewSize(s.key)} className="text-slate-400 hover:text-rose-600 p-1" title="Remove row"><Trash2 className="w-3.5 h-3.5" /></button>}
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11px] text-slate-500">Existing stock is read-only here — adjust it from Inventory. SKUs can be disabled but not deleted. USD prices are entered by you (no automatic conversion); a size with no USD price is sold in PKR only.</span>
        <div className="flex items-center gap-2">{removeBtn}{saveBtn}</div>
      </div>
      {errList.length > 0 && <ul className="px-4 pb-3 text-xs text-rose-600 font-medium space-y-0.5" role="alert">{errList.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    </div>;
};
