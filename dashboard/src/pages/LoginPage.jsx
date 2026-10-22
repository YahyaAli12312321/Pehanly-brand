import { useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, CircleAlert, Info, Loader2, User } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { PageLoader } from "../components/common/PageLoader";
import { AuthShell, AuthCard, authInput, authButton } from "../components/auth/AuthShell";
import { PasswordInput } from "../components/auth/PasswordInput";
import { RegisterForm } from "../components/auth/RegisterForm";
import { toApiError } from "../lib/apiError";
import { takeAuthNotice } from "../lib/authNotice";
import { validateIdentifier } from "../lib/passwordRules";
import { ROUTES } from "../config/navigation";

const isBackOffice = (u) => u && (u.role === "admin" || u.role === "staff");

export const LoginPage = () => {
  const { user, isLoading, login, isLoggingIn, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [touched, setTouched] = useState({});
  const [error, setError] = useState(null);
  // One auth card, two states. Switching never navigates: same page, panel and card position.
  const inFlight = useRef(false);
  const [mode, setMode] = useState("login");
  const [registered, setRegistered] = useState(null);
  // Read once on mount: a 401 on a signed-in session leaves a one-shot, in-memory hint.
  const [notice] = useState(() => takeAuthNotice());

  const from = location.state?.from && location.state.from !== ROUTES.login ? location.state.from : "/";

  if (isLoading) return <div className="min-h-screen bg-[#f8f9ff]"><PageLoader /></div>;
  if (isBackOffice(user)) return <Navigate to={from} replace />;

  const identifierError = validateIdentifier(identifier);
  const passwordError = password ? null : "Enter your password";
  const serverFields = error?.fieldErrors || {};

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    if (next === "register") setRegistered(null);
  };

  const onRegistered = ({ dashboardAccess }) => {
    if (dashboardAccess) {
      // The first admin: the backend reported a back-office role for the new account, so the session is kept.
      navigate(from, { replace: true });
      return;
    }
    setRegistered({ message: "Account created, but it has no dashboard access. Dashboard accounts are created by an administrator." });
    setPassword("");
    setMode("login");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (isLoggingIn || inFlight.current) return;
    setTouched({ identifier: true, password: true });
    setError(null);
    if (identifierError || passwordError) return;
    inFlight.current = true;
    try {
      const signedIn = await login({ identifier: identifier.trim(), password, rememberMe });
      if (!isBackOffice(signedIn)) {
        // A customer account must never keep a dashboard session.
        await logout();
        setError({ message: "This account doesn't have dashboard access." });
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(toApiError(err));
    } finally {
      inFlight.current = false;
    }
  };

  const showIdentifierError = (touched.identifier && identifierError) || serverFields.identifier;
  const showPasswordError = (touched.password && passwordError) || serverFields.password;

  const isRegister = mode === "register";
  const switchLink = "inline-flex items-center min-h-[36px] px-1.5 -my-1 font-semibold text-[#0f2922] underline-offset-2 hover:underline focus:outline-none focus-visible:underline";

  return <AuthShell>
      <AuthCard
    title={isRegister ? "Create your account" : "Welcome back"}
    subtitle={isRegister ? "Set up your PEHAN LY account to continue." : "Sign in to your PEHAN LY Admin Dashboard"}
    badge={isRegister ? undefined : "Internal Ops"}
    footer={<p>Secure access for authorized PEHAN LY team members.</p>}
  >
        <div key={mode} className="auth-card-in">
        {isRegister ? <>
          <RegisterForm onRegistered={onRegistered} />
          <p className="mt-5 text-center text-xs text-slate-600">
            Already have an account?{" "}
            <button type="button" onClick={() => switchMode("login")} className={`${switchLink} cursor-pointer`}>Sign In</button>
          </p>
        </> : <>
        <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label="Admin sign in">
          {registered && !error && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
              <span>{registered.message}</span>
            </div>}

          {notice === "expired" && !error && !registered && <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              <Info className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
              <span>Your session has expired. Please sign in again.</span>
            </div>}

          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
              <CircleAlert className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
              <span>{error.message}</span>
            </div>}

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="login-identifier" className="text-xs font-semibold text-slate-800">Email or Phone</label>
              <span className="text-[10px] text-slate-400">Work email or phone</span>
            </div>
            <div className="relative mt-1.5">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
              <input
    id="login-identifier"
    name="identifier"
    className={`${authInput} pl-10 pr-3 ${showIdentifierError ? "border-rose-400" : ""}`}
    value={identifier}
    onChange={(e) => setIdentifier(e.target.value)}
    // Only validate on blur once there is something to validate: an empty-field error would shift the
    // layout mid-click (e.g. when the user goes straight for "Forgot password?"). Empty = checked on submit.
    onBlur={() => identifier && setTouched((t) => ({ ...t, identifier: true }))}
    autoComplete="username"
    inputMode="email"
    autoCapitalize="none"
    spellCheck={false}
    placeholder="name@pehanly.pk or 0300..."
    autoFocus
    disabled={isLoggingIn}
    aria-invalid={showIdentifierError ? "true" : undefined}
    aria-describedby={showIdentifierError ? "login-identifier-error" : undefined}
  />
            </div>
            {showIdentifierError && <p id="login-identifier-error" className="mt-1.5 text-xs font-medium text-rose-600">{showIdentifierError}</p>}
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="login-password" className="text-xs font-semibold text-slate-800">Password</label>
              <Link to="/forgot-password" className="text-[11px] font-semibold text-[#0f2922] hover:underline focus:outline-none focus-visible:underline">Forgot password?</Link>
            </div>
            <div className="mt-1.5">
              <PasswordInput
    id="login-password"
    name="password"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    onBlur={() => password && setTouched((t) => ({ ...t, password: true }))}
    autoComplete="current-password"
    placeholder="Enter your password"
    disabled={isLoggingIn}
    invalid={Boolean(showPasswordError)}
    describedBy={showPasswordError ? "login-password-error" : undefined}
  />
            </div>
            {showPasswordError && <p id="login-password-error" className="mt-1.5 text-xs font-medium text-rose-600">{showPasswordError}</p>}
          </div>

          <label className="flex items-center gap-2.5 min-h-[28px] cursor-pointer select-none">
            <input
    type="checkbox"
    checked={rememberMe}
    onChange={(e) => setRememberMe(e.target.checked)}
    disabled={isLoggingIn}
    className="w-4 h-4 rounded border-slate-300 accent-[#0f2922]"
  />
            <span className="text-xs text-slate-700">Remember me</span>
          </label>

          <button type="submit" disabled={isLoggingIn} className={authButton}>
            {isLoggingIn ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Signing in...</> : <>Sign In <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-600">
          Don&apos;t have an account?{" "}
          <button type="button" onClick={() => switchMode("register")} className={`${switchLink} cursor-pointer`}>Register</button>
        </p>
        </>}
        </div>
      </AuthCard>
    </AuthShell>;
};
