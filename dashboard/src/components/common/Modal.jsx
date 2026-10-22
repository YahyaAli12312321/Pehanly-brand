import { useEffect } from "react";
import { X } from "lucide-react";
export const Modal = ({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  icon,
  children,
  footer,
  maxWidth = "md"
}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const widthClasses = maxWidth.startsWith("max-w-") ? maxWidth : {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-xl",
    xl: "max-w-2xl",
    "2xl": "max-w-3xl",
    "4xl": "max-w-5xl"
  }[maxWidth] || "max-w-lg";
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {
    /* Backdrop */
  }
      <div
    onClick={onClose}
    className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
  />

      <div
    role="dialog"
    aria-modal="true"
    className={`relative w-full ${widthClasses} bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in zoom-in-95 duration-200 flex flex-col my-auto`}
  >
        {
    /* Header */
  }
        <div className="p-5 bg-white border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {icon && <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[#0f2922] shrink-0 mt-0.5">
                {icon}
              </div>}
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 font-sans tracking-tight">{title}</h3>
                {badge}
              </div>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{subtitle}</p>}
            </div>
          </div>

          <button
    type="button"
    onClick={onClose}
    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
    title="Close"
  >
            <X className="w-4 h-4" />
          </button>
        </div>

        {
    /* Content */
  }
        <div className="p-5 sm:p-6 overflow-y-auto max-h-[75vh] space-y-4">{children}</div>

        {
    /* Footer */
  }
        {footer && <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>}
      </div>
    </div>;
};
