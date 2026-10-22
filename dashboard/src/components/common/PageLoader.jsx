export const PageLoader = ({ label = "Loading..." }) => <div className="min-h-[50vh] flex items-center justify-center" role="status" aria-live="polite">
    <div className="flex flex-col items-center gap-3 text-slate-500">
      <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-[#0f2922] animate-spin" />
      <span className="text-xs font-medium">{label}</span>
    </div>
  </div>;
