import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { quotesApi } from "../../services/quotesApi";
import { keys } from "../../lib/queryKeys";
import { useToastStore } from "../../store/toastStore";
import { splitFormError } from "../../lib/formErrors";
import { Modal } from "../common/Modal";
import { FormField } from "../common/FormField";

const inp = "w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#00130d] outline-none";
const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50";

/**
 * Create a quote from an approved request. sourceType: 'wholesale' (prices come from the request) | 'manufacturing' | 'printing' (admin sets unit price).
 */
export const CreateQuoteModal = ({ sourceType, requestId, requestNumber, quantity, onClose, onCreated }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const needsPrice = sourceType !== "wholesale";
  const [f, setF] = useState({ unitPrice: "", discount: "0", shipping: "0", additionalCharges: "0", validUntil: "", adminNotes: "", terms: "" });
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const m = useMutation({
    mutationFn: () => quotesApi.create(sourceType, { requestId, ...f, validUntil: f.validUntil ? new Date(`${f.validUntil}T23:59:59`).toISOString() : undefined }),
    onSuccess: (q) => {
      ["quotes", sourceType, "wholesale", "manufacturing", "printing", "dashboard"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      addToast(`Quote ${q.quoteNumber} created as a draft.`);
      onCreated?.(q); onClose();
    },
    onError: (err) => { const { fields, general: g } = splitFormError(err, "Could not create the quote"); setErrors(fields); setGeneral(g); },
  });

  const submit = () => {
    const e = {};
    if (needsPrice && !(Number(f.unitPrice) > 0)) e.unitPrice = "Enter a unit price greater than zero.";
    for (const k of ["discount", "shipping", "additionalCharges"]) if (Number(f[k]) < 0 || Number.isNaN(Number(f[k]))) e[k] = "Must be zero or more.";
    setErrors(e); setGeneral("");
    if (Object.keys(e).length === 0) m.mutate();
  };
  const subtotal = needsPrice && quantity ? (Number(f.unitPrice) || 0) * quantity : null;

  return <Modal isOpen onClose={() => !m.isPending && onClose()} title={`Create quote · ${requestNumber}`} maxWidth="md">
      <div className="space-y-3">
        {needsPrice ? <FormField label={`Unit price (PKR)${quantity ? ` × ${quantity} units` : ""}`} required error={errors.unitPrice} hint={subtotal != null ? `Subtotal: PKR ${subtotal.toLocaleString()}` : undefined}><input type="number" min={0} step="0.01" className={inp} value={f.unitPrice} onChange={set("unitPrice")} /></FormField> : <p className="text-xs text-slate-500">Line prices come from the wholesale request; adjust charges below.</p>}
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Discount" error={errors.discount}><input type="number" min={0} className={inp} value={f.discount} onChange={set("discount")} /></FormField>
          <FormField label="Shipping" error={errors.shipping}><input type="number" min={0} className={inp} value={f.shipping} onChange={set("shipping")} /></FormField>
          <FormField label="Extra charges" error={errors.additionalCharges}><input type="number" min={0} className={inp} value={f.additionalCharges} onChange={set("additionalCharges")} /></FormField>
        </div>
        <FormField label="Valid until" error={errors.validUntil}><input type="date" className={inp} value={f.validUntil} min={new Date().toISOString().slice(0, 10)} onChange={set("validUntil")} /></FormField>
        <FormField label="Internal notes" error={errors.adminNotes}><textarea rows={2} maxLength={5000} className={inp} value={f.adminNotes} onChange={set("adminNotes")} /></FormField>
        <FormField label="Terms shown to customer" error={errors.terms}><textarea rows={3} maxLength={10000} className={inp} value={f.terms} onChange={set("terms")} /></FormField>
        {general && <p className="text-xs text-rose-600">{general}</p>}
        <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={onClose} disabled={m.isPending}>Cancel</button><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={submit} disabled={m.isPending}>{m.isPending ? "Creating…" : "Create draft quote"}</button></div>
      </div>
    </Modal>;
};
