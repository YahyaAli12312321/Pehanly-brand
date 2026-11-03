export const OrderTimeline = ({ events }) => {
  if (!events || events.length === 0) return null;
  return <div className="flex flex-col gap-3 relative pl-4 border-l-2 border-slate-200 ml-2">
      {events.map((ev, idx) => <div key={idx} className="relative flex flex-col gap-0.5">
          <div
    className={`absolute -left-[23px] top-1.5 w-3 h-3 rounded-full ring-4 ring-white ${idx === 0 ? "bg-emerald-600" : "bg-slate-400"}`}
  />
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-900">{ev.status}</span>
            <span className="text-[11px] text-slate-400 font-mono">{ev.timestamp}</span>
          </div>
          {ev.note && <p className="text-xs text-slate-500 leading-relaxed">{ev.note}</p>}
        </div>)}
    </div>;
};
