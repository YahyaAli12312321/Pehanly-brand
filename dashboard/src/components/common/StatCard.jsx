export const StatCard = ({
  label,
  value,
  subtext,
  icon,
  badge,
  trend,
  onClick,
  className = ""
}) => {
  return <div
    onClick={onClick}
    className={`p-4 sm:p-5 rounded-xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-slate-300 hover:shadow-sm transition-all relative overflow-hidden ${onClick ? "cursor-pointer active:scale-[0.99]" : ""} ${className}`}
  >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        {icon && <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-[#0f2922] shrink-0">
            {icon}
          </div>}
      </div>

      <div className="my-2 flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-bold font-mono text-slate-900 tracking-tight whitespace-nowrap">
          {value}
        </span>
        {badge}
        {trend && <span
    className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${trend.isPositive ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}
  >
            {trend.value}
            {trend.label && <span className="font-normal text-slate-500 ml-1">{trend.label}</span>}
          </span>}
      </div>

      {subtext && <div className="text-xs text-slate-500 truncate">{subtext}</div>}
    </div>;
};
