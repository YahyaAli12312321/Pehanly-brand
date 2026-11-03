import { useEffect } from "react";
import { X } from "lucide-react";
export const Drawer = ({
  isOpen,
  onClose,
  title,
  subtitle,
  badge,
  headerActions,
  children,
  footer,
  maxWidth = "lg"
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
  const widthClasses = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-[580px]",
    xl: "max-w-[640px]",
    "2xl": "max-w-[720px]"
  }[maxWidth];
  return <div className="fixed inset-0 z-50 overflow-hidden">
      {
    /* Backdrop */
  }
      <div
    onClick={onClose}
    className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
  />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <aside
    role="dialog"
    aria-modal="true"
    className={`w-screen ${widthClasses} bg-white shadow-2xl flex flex-col justify-between overflow-hidden border-l border-slate-200 animate-in slide-in-from-right duration-300`}
  >
          {
    /* Header */
  }
          <div className="p-5 bg-white border-b border-slate-200/90 flex items-start justify-between gap-3 shrink-0">
            <div className="flex flex-col min-w-0 pr-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight truncate font-sans">
                  {title}
                </h2>
                {badge}
              </div>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{subtitle}</p>}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {headerActions}
              <button
    type="button"
    onClick={onClose}
    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
    title="Close (Esc)"
  >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {
    /* Scrollable Body */
  }
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-white">{children}</div>

          {
    /* Sticky Footer */
  }
          {footer && <div className="p-4 sm:p-5 bg-slate-50/90 backdrop-blur-md border-t border-slate-200 flex items-center justify-between gap-3 shrink-0 shadow-xs">
              {footer}
            </div>}
        </aside>
      </div>
    </div>;
};
