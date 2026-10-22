export const FormField = ({
  label,
  required = false,
  hint,
  error,
  badge,
  children,
  className = ""
}) => {
  return <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center justify-between text-xs">
        <label className="font-semibold text-slate-800 flex items-center gap-1">
          <span>{label}</span>
          {required && <span className="text-rose-600">*</span>}
        </label>
        {badge}
      </div>

      {children}

      {error ? <span className="text-xs text-rose-600 font-medium">{error}</span> : hint ? <span className="text-[11px] text-slate-500 leading-normal">{hint}</span> : null}
    </div>;
};
