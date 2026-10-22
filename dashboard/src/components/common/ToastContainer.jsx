import { useToastStore } from "../../store/toastStore";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
export const ToastContainer = () => {
  const { toasts, removeToast } = useToastStore();
  if (toasts.length === 0) return null;
  return <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
    const isSuccess = toast.type === "success";
    const isError = toast.type === "error";
    return <div
      key={toast.id}
      className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl bg-[#213145] text-[#eaf1ff] shadow-xl border border-white/10 min-w-[280px] max-w-md animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
            {isSuccess && <CheckCircle2 className="w-5 h-5 text-[#cce9de] shrink-0" />}
            {isError && <AlertCircle className="w-5 h-5 text-[#ffdad6] shrink-0" />}
            {!isSuccess && !isError && <Info className="w-5 h-5 text-[#d3e4fe] shrink-0" />}

            <div className="flex-1 min-w-0">
              {toast.title && <div className="font-semibold text-xs text-white">{toast.title}</div>}
              <div className="text-xs leading-relaxed text-[#eaf1ff]/90">{toast.message}</div>
            </div>

            <button
      onClick={() => removeToast(toast.id)}
      className="p-1 rounded text-white/60 hover:text-white transition-colors"
      title="Close"
    >
              <X className="w-4 h-4" />
            </button>
          </div>;
  })}
    </div>;
};
