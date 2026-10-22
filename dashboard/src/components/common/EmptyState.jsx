import { PackageOpen } from "lucide-react";
export const EmptyState = ({
  title,
  description,
  icon,
  action,
  className = ""
}) => {
  return <div className={`p-12 text-center flex flex-col items-center justify-center gap-3 bg-white rounded-xl border border-slate-200/80 ${className}`}>
      <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
        {icon || <PackageOpen className="w-6 h-6" />}
      </div>
      <div className="max-w-sm">
        <h3 className="text-sm font-bold text-slate-900 tracking-tight">{title}</h3>
        {description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>;
};
