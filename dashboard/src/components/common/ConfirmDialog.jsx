import { Modal } from "./Modal";
import { AlertTriangle } from "lucide-react";
export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  confirmText,
  cancelLabel = "Cancel",
  isDestructive = true,
  isLoading = false,
  type = "danger"
}) => {
  const finalConfirmLabel = confirmText || confirmLabel || "Confirm";
  const isReallyDestructive = type === "danger" || isDestructive;
  return <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    maxWidth="sm"
    icon={<AlertTriangle className={`w-4 h-4 ${isDestructive ? "text-rose-600" : "text-amber-600"}`} />}
    footer={<>
          <button
      type="button"
      onClick={onClose}
      disabled={isLoading}
      className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
    >
            {cancelLabel}
          </button>
          <button
      type="button"
      disabled={isLoading}
      onClick={() => {
        onConfirm();
      }}
      className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 ${isReallyDestructive ? "bg-rose-700 hover:bg-rose-800" : "bg-[#0f2922] hover:bg-[#1a3d34]"}`}
    >
            {isLoading ? "Processing..." : finalConfirmLabel}
          </button>
        </>}
  >
      <p className="text-xs text-slate-600 leading-relaxed">{message}</p>
    </Modal>;
};
