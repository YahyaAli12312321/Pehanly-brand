import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CircleAlert, Loader2, Mail, MailCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { authApi } from "../services/authApi";
import { AuthShell, AuthCard, authInput, authButton } from "../components/auth/AuthShell";
import { toApiError } from "../lib/apiError";
import { validateEmail } from "../lib/passwordRules";

export const ForgotPasswordPage = () => {
  const { user, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  if (!isLoading && user && (user.role === "admin" || user.role === "staff")) return <Navigate to="/" replace />;

  const emailError = validateEmail(email);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setTouched(true);
    setError(null);
    if (emailError) return;
    setBusy(true);
    try {
      // The backend answers the same way whether or not the account exists (no enumeration).
      await authApi.forgotPassword({ identifier: email.trim() });
      setSent(true);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return <AuthShell>
      <AuthCard
    title={sent ? "Check your inbox" : "Forgot password?"}
    subtitle={sent ? undefined : "Enter your work email and we'll send reset instructions."}
    badge="Internal Ops"
    footer={<p>Secure access for authorized PEHAN LY team members.</p>}
  >
        {sent ? <div className="space-y-5" role="status">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <MailCheck className="w-5 h-5 shrink-0 mt-px" aria-hidden="true" />
              <p>If an account exists for <strong className="font-semibold break-all">{email.trim()}</strong>, reset instructions have been sent. The link expires shortly, so use it soon.</p>
            </div>
            <Link to="/login" className={`${authButton} no-underline`}>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Sign In
            </Link>
          </div> : <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label="Request password reset">
            {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
                <CircleAlert className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
                <span>{error.message}</span>
              </div>}
            <div>
              <label htmlFor="forgot-email" className="text-xs font-semibold text-slate-800">Email</label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
                <input
    id="forgot-email"
    type="email"
    className={`${authInput} pl-10 pr-3 ${touched && emailError ? "border-rose-400" : ""}`}
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    onBlur={() => email && setTouched(true)}
    autoComplete="email"
    autoCapitalize="none"
    spellCheck={false}
    placeholder="name@pehanly.pk"
    autoFocus
    disabled={busy}
    aria-invalid={touched && emailError ? "true" : undefined}
    aria-describedby={touched && emailError ? "forgot-email-error" : undefined}
  />
              </div>
              {touched && emailError && <p id="forgot-email-error" className="mt-1.5 text-xs font-medium text-rose-600">{emailError}</p>}
            </div>
            <button type="submit" disabled={busy} className={authButton}>
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Sending...</> : <>Send Reset Instructions <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
            </button>
            <Link to="/login" className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#0f2922] hover:underline min-h-[36px]">
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to Sign In
            </Link>
          </form>}
      </AuthCard>
    </AuthShell>;
};
