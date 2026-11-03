import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { authApi } from "../services/authApi";
import { AuthShell, AuthCard, authButton } from "../components/auth/AuthShell";
import { PasswordInput } from "../components/auth/PasswordInput";
import { toApiError } from "../lib/apiError";
import { passwordChecks, validateNewPassword } from "../lib/passwordRules";

export const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // Keep the token in memory only, then strip it from the address bar / history.
  const [token] = useState(() => params.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (location.search) navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const errors = validateNewPassword(password, confirm);
  const checks = passwordChecks(password, confirm);
  const tokenInvalid = error?.code === "INVALID_RESET_TOKEN";

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setTouched({ password: true, confirm: true });
    setError(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      await authApi.resetPassword({ token, password });
      setDone(true);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!token && !done) {
    return <AuthShell>
        <AuthCard title="Reset link missing" subtitle="This page needs the link from your reset email." badge="Internal Ops">
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
            <CircleAlert className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
            <span>Open the link from the email, or request a new one.</span>
          </div>
          <Link to="/forgot-password" className={`${authButton} no-underline mt-5`}>Request a new link</Link>
          <Link to="/login" className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#0f2922] hover:underline min-h-[36px]"><ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to Sign In</Link>
        </AuthCard>
      </AuthShell>;
  }

  if (done) {
    return <AuthShell>
        <AuthCard title="Password updated" badge="Internal Ops" footer={<p>Secure access for authorized PEHAN LY team members.</p>}>
          <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CircleCheck className="w-5 h-5 shrink-0 mt-px" aria-hidden="true" />
            <p>Your password has been changed and any other signed-in sessions were ended. Sign in with your new password.</p>
          </div>
          <Link to="/login" className={`${authButton} no-underline mt-5`}>Go to Sign In <ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
        </AuthCard>
      </AuthShell>;
  }

  return <AuthShell>
      <AuthCard
    title="Set a new password"
    subtitle="Choose a new password for your PEHAN LY Admin account."
    badge="Internal Ops"
    footer={<p>Secure access for authorized PEHAN LY team members.</p>}
  >
        <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label="Set new password">
          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
              <CircleAlert className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
              <span>
                {error.message}
                {tokenInvalid && <> <Link to="/forgot-password" className="font-semibold underline">Request a new link</Link>.</>}
              </span>
            </div>}

          <div>
            <label htmlFor="reset-password" className="text-xs font-semibold text-slate-800">New Password</label>
            <div className="mt-1.5">
              <PasswordInput
    id="reset-password"
    name="new-password"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    onBlur={() => password && setTouched((t) => ({ ...t, password: true }))}
    autoComplete="new-password"
    placeholder="Enter a new password"
    disabled={busy}
    autoFocus
    invalid={Boolean(touched.password && errors.password)}
    describedBy="reset-rules"
  />
            </div>
            {touched.password && errors.password && <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.password}</p>}
          </div>

          <div>
            <label htmlFor="reset-confirm" className="text-xs font-semibold text-slate-800">Confirm New Password</label>
            <div className="mt-1.5">
              <PasswordInput
    id="reset-confirm"
    name="confirm-password"
    value={confirm}
    onChange={(e) => setConfirm(e.target.value)}
    onBlur={() => confirm && setTouched((t) => ({ ...t, confirm: true }))}
    autoComplete="new-password"
    placeholder="Re-enter the new password"
    disabled={busy}
    invalid={Boolean(touched.confirm && errors.confirm)}
  />
            </div>
            {touched.confirm && errors.confirm && <p className="mt-1.5 text-xs font-medium text-rose-600">{errors.confirm}</p>}
          </div>

          <ul id="reset-rules" aria-label="Password requirements" className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-1.5">
            {checks.map((c) => <li key={c.id} className={`flex items-center gap-2 text-xs ${c.ok ? "text-emerald-700" : "text-slate-500"}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center border ${c.ok ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"}`} aria-hidden="true">
                  {c.ok && <Check className="w-3 h-3" />}
                </span>
                {c.label}
                <span className="sr-only">{c.ok ? " (met)" : " (not met yet)"}</span>
              </li>)}
          </ul>

          <button type="submit" disabled={busy} className={authButton}>
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Updating...</> : <>Update Password <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
          </button>
          <Link to="/login" className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#0f2922] hover:underline min-h-[36px]">
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to Sign In
          </Link>
        </form>
      </AuthCard>
    </AuthShell>;
};
