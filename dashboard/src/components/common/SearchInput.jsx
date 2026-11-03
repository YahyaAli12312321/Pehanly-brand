import { Search, X } from "lucide-react";
export const SearchInput = ({
  value,
  onChange,
  placeholder = "Search...",
  shortcut = "/",
  className = ""
}) => {
  return <div className={`relative flex items-center ${className}`}>
      <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full h-9 pl-9 pr-9 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0f2922] focus:border-[#0f2922] placeholder:text-slate-400 text-slate-900 transition-all font-sans"
  />
      {value ? <button
    type="button"
    onClick={() => onChange("")}
    className="absolute right-2.5 p-0.5 rounded text-slate-400 hover:text-slate-700 transition-colors"
    title="Clear search"
  >
          <X className="w-3.5 h-3.5" />
        </button> : shortcut ? <span className="absolute right-2.5 font-mono text-[10px] text-slate-400 bg-slate-200/70 px-1 py-0.5 rounded pointer-events-none">
          {shortcut}
        </span> : null}
    </div>;
};
