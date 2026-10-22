import { ChevronDown } from "lucide-react";
export const Select = ({
  options,
  children,
  className = "",
  ...props
}) => {
  return <div className="relative inline-block w-full">
      <select
    className={`w-full h-9 pl-3 pr-8 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0f2922] focus:border-[#0f2922] appearance-none cursor-pointer transition-colors ${className}`}
    {...props}
  >
        {options ? options.map((opt) => <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>) : children}
      </select>
      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>;
};
