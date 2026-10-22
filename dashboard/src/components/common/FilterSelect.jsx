/** Compact toolbar select used by list pages (matches the original filter dropdowns). */
export const FilterSelect = ({ value, onChange, options, className = "" }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`h-9 px-3 text-xs bg-slate-50 border border-slate-200 text-slate-700 rounded-lg focus:outline-none focus:bg-white ${className}`}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
);
