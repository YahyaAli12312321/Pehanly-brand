export const LoadingSkeleton = ({ rows = 5, className = "" }) => {
  return <div className={`w-full space-y-3 p-4 animate-pulse ${className}`}>
      <div className="h-4 bg-slate-200 rounded w-1/4 mb-4" />
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="flex items-center gap-4 py-2 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-slate-200 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-slate-200 rounded w-1/3" />
            <div className="h-3 bg-slate-100 rounded w-1/2" />
          </div>
          <div className="h-4 bg-slate-200 rounded w-16" />
          <div className="h-6 bg-slate-100 rounded-full w-20" />
        </div>)}
    </div>;
};
