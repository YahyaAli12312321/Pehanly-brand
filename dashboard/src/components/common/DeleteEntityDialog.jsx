import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import { errorMessage } from "../../lib/apiError";

/*
 * Permanent delete, with the consequences shown before the button is pressed.
 *
 * The backend decides whether a record may go: it is asked first (`deleteCheck`) and it is asked again when delete is
 * actually called, so a record that became referenced in the meantime is still refused. Anything that is still in use
 * cannot be deleted at all - the dialog explains what is holding it and offers to deactivate instead, which keeps
 * order, quote and return history intact.
 */
export function DeleteEntityDialog({
  isOpen,
  onClose,
  entity,          // { id, name }
  label,           // "product" | "category"
  deleteCheck,     // (id) => Promise<{ name, blockers:[{key,label,count}], canDelete, variants?, skus? }>
  onDelete,        // (id) => Promise<any>
  onDeactivate,    // optional: (id) => Promise<any>; shown as the safe alternative
  onDeleted,
}) {
  const check = useQuery({
    queryKey: ["delete-check", label, entity?.id],
    queryFn: () => deleteCheck(entity.id),
    enabled: Boolean(isOpen && entity?.id),
    staleTime: 0,
    gcTime: 0,
  });

  const info = check.data;
  const blockers = info?.blockers || [];
  const blocked = Boolean(info) && !info.canDelete;
  // A check the server could not run blocks the delete on purpose; it is not the same as "this is in use".
  const unverified = blockers.some((b) => b.key === "unverified");

  const remove = useMutation({
    mutationFn: () => onDelete(entity.id),
    onSuccess: (res) => { onDeleted?.(res, entity); onClose(); },
  });

  const deactivate = useMutation({
    mutationFn: () => onDeactivate(entity.id),
    onSuccess: () => { onClose(); },
  });

  const busy = remove.isPending || deactivate.isPending;
  const failure = remove.error || deactivate.error;

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title={`Delete ${label}`}
      maxWidth="sm"
      icon={<AlertTriangle className="w-4 h-4 text-rose-600" />}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors disabled:opacity-50">
            Cancel
          </button>
          {blocked && onDeactivate && (
            <button type="button" onClick={() => deactivate.mutate()} disabled={busy} data-testid="delete-deactivate" className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-100 text-amber-900 hover:bg-amber-200 transition-colors disabled:opacity-50">
              {deactivate.isPending ? "Deactivating…" : "Deactivate instead"}
            </button>
          )}
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={busy || check.isLoading || blocked || check.isError}
            data-testid="delete-confirm"
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 transition-colors shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {remove.isPending ? "Deleting…" : "Delete permanently"}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-xs text-slate-600 leading-relaxed" data-testid="delete-dialog-body">
        <p>
          <b className="text-slate-900">{entity?.name}</b> will be removed permanently. This cannot be undone.
        </p>

        {check.isLoading && (
          <p className="flex items-center gap-2 text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking where this {label} is used…</p>
        )}

        {check.isError && (
          <p className="p-2.5 rounded-lg bg-rose-50 border border-rose-100 text-rose-700">{errorMessage(check.error, `Could not check this ${label}.`)}</p>
        )}

        {blocked && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5" data-testid="delete-blockers">
            <p className="font-semibold text-amber-900">This {label} cannot be deleted.</p>
            <ul className="list-disc pl-4 text-amber-900">
              {blockers.map((b) => (
                <li key={b.key}>
                  {b.key === "unverified" ? "Could not check" : label === "product" ? "Used by" : "Contains"} <b>{b.text || `${b.count} ${b.label}`}</b>
                </li>
              ))}
            </ul>
            <p className="text-amber-800">
              {unverified
                ? "Until that check succeeds the delete is refused, so nothing is removed by mistake. The reason is in the server log."
                : label === "product"
                  ? "Deleting it would break that history. Deactivate it instead to hide it from the store."
                  : "Move or delete what is inside it first, or deactivate the category instead."}
            </p>
          </div>
        )}

        {info && !blocked && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200" data-testid="delete-summary">
            <p className="font-semibold text-slate-900 mb-1">What will be removed</p>
            {label === "product" ? (
              <ul className="list-disc pl-4">
                <li>The product and its images</li>
                <li><b>{info.variants ?? 0}</b> colour variant{info.variants === 1 ? "" : "s"} and <b>{info.skus ?? 0}</b> SKU{info.skus === 1 ? "" : "s"}</li>
                <li>Their stock history and any reviews</li>
              </ul>
            ) : (
              <p>The category only. Nothing is inside it.</p>
            )}
          </div>
        )}

        {failure && <p className="p-2.5 rounded-lg bg-rose-50 border border-rose-100 text-rose-700" data-testid="delete-error">{errorMessage(failure, `Could not delete this ${label}.`)}</p>}
      </div>
    </Modal>
  );
}
