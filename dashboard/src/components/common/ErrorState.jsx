import { AlertTriangle, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import { toApiError } from "../../lib/apiError";

/**
 * Shown when a query fails. Never shows stale/fake data - the caller renders this instead of rows.
 * Pass the error thrown by React Query; 403 / network get tailored copy.
 */
export const ErrorState = ({ error, onRetry, title, className = "" }) => {
  const e = error ? toApiError(error) : null;
  const forbidden = e?.isForbidden;
  const offline = e?.isNetwork;
  const Icon = forbidden ? ShieldAlert : offline ? WifiOff : AlertTriangle;
  const heading = title || (forbidden ? "You don't have access to this" : offline ? "Can't reach the server" : "Couldn't load this data");
  return <div className={`p-12 text-center flex flex-col items-center justify-center gap-3 bg-white rounded-xl border border-rose-100 ${className}`} role="alert">
      <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
        <Icon className="w-6 h-6" />
      </div>
      <div className="max-w-sm">
        <h3 className="text-sm font-bold text-slate-900 tracking-tight">{heading}</h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{e?.message || "Please try again."}</p>
        {e?.requestId && <p className="text-[10px] text-slate-400 mt-1 font-mono">Ref: {e.requestId}</p>}
      </div>
      {onRetry && !forbidden && <button
    type="button"
    onClick={onRetry}
    className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
  >
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>}
    </div>;
};
