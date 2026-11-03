import { useRef, useState } from "react";
import { ArrowRight, CircleAlert, Loader2, Mail, Phone, User } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { authInput, authButton } from "./AuthShell";
import { PasswordInput } from "./PasswordInput";
import { toApiError } from "../../lib/apiError";
import { PASSWORD_MAX, PASSWORD_MIN, fieldForConflict, validateRegistration } from "../../lib/passwordRules";

const Field = ({ id, label, error, hint, children }) => <div>
    <div className="flex items-baseline justify-between">
      <label htmlFor={id} className="text-xs font-semibold text-slate-800">{label}</label>
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </div>
    <div className="relative mt-1.5">{children}</div>
    {error && <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
  </div>;

const icon = "absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none";

/**
 * Register state of the auth card. Fields = the real POST /auth/register contract: name, email, phone,
 * password, role (fixed to "admin", not user-editable). "Confirm password" is a browser-only check and is never sent.
 */
export const RegisterForm = ({ onRegistered }) => {
  const { register, isRegistering } = useAuth();
  const [values, setValues] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [touched, setTouched] = useState({});
  const [serverFields, setServerFields] = useState({});
  const [error, setError] = useState(null);
  const inFlight = useRef(false); // synchronous guard: state updates are too late for a rapid double click

  const clientErrors = validateRegistration(values);
  const set = (k) => (e) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setServerFields((f) => (f[k] ? { ...f, [k]: undefined } : f));
  };
  const blur = (k) => () => values[k] && setTouched((t) => ({ ...t, [k]: true }));
  const err = (k) => (touched[k] && clientErrors[k]) || serverFields[k];

  const onSubmit = async (e) => {
    e.preventDefault();
    if (isRegistering || inFlight.current) return; // double-submit guard
    setTouched({ name: true, email: true, phone: true, password: true, confirm: true });
    setError(null);
    setServerFields({});
    if (Object.keys(clientErrors).length) return;
    inFlight.current = true;
    try {
      const result = await register({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        password: values.password,
        role: "admin", // fixed for the Admin Dashboard; there is deliberately no role input
      });
      onRegistered(result);
    } catch (ex) {
      const apiErr = toApiError(ex);
      const fields = { ...(apiErr.fieldErrors || {}) };
      if (apiErr.code === "ACCOUNT_EXISTS" || apiErr.status === 409) {
        const f = fieldForConflict(apiErr.message);
        if (f) fields[f] = apiErr.message;
      }
      setServerFields(fields);
      // Keep safe values; never keep the password after a failed attempt.
      setValues((v) => ({ ...v, password: "", confirm: "" }));
      setError(Object.keys(fields).length ? { message: "Please fix the highlighted fields." } : { message: apiErr.message });
    } finally {
      inFlight.current = false;
    }
  };

  return <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Create account">
      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
          <CircleAlert className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
          <span>{error.message}</span>
        </div>}

      <Field id="reg-name" label="Full Name" error={err("name")}>
        <User className={icon} aria-hidden="true" />
        <input id="reg-name" name="name" className={`${authInput} pl-10 pr-3 ${err("name") ? "border-rose-400" : ""}`} value={values.name} onChange={set("name")} onBlur={blur("name")} autoComplete="name" placeholder="Your full name" disabled={isRegistering} aria-invalid={err("name") ? "true" : undefined} aria-describedby={err("name") ? "reg-name-error" : undefined} />
      </Field>

      <Field id="reg-email" label="Email Address" error={err("email")}>
        <Mail className={icon} aria-hidden="true" />
        <input id="reg-email" name="email" type="email" className={`${authInput} pl-10 pr-3 ${err("email") ? "border-rose-400" : ""}`} value={values.email} onChange={set("email")} onBlur={blur("email")} autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="name@pehanly.pk" disabled={isRegistering} aria-invalid={err("email") ? "true" : undefined} aria-describedby={err("email") ? "reg-email-error" : undefined} />
      </Field>

      <Field id="reg-phone" label="Phone Number" error={err("phone")}>
        <Phone className={icon} aria-hidden="true" />
        <input id="reg-phone" name="phone" type="tel" className={`${authInput} pl-10 pr-3 ${err("phone") ? "border-rose-400" : ""}`} value={values.phone} onChange={set("phone")} onBlur={blur("phone")} autoComplete="tel" inputMode="tel" placeholder="0300 1234567" disabled={isRegistering} aria-invalid={err("phone") ? "true" : undefined} aria-describedby={err("phone") ? "reg-phone-error" : undefined} />
      </Field>

      <Field id="reg-password" label="Password" error={err("password")} hint={`${PASSWORD_MIN}-${PASSWORD_MAX} characters`}>
        <PasswordInput id="reg-password" name="password" value={values.password} onChange={set("password")} onBlur={blur("password")} autoComplete="new-password" placeholder={`At least ${PASSWORD_MIN} characters`} disabled={isRegistering} invalid={Boolean(err("password"))} describedBy={err("password") ? "reg-password-error" : undefined} />
      </Field>

      <Field id="reg-confirm" label="Confirm Password" error={err("confirm")}>
        <PasswordInput id="reg-confirm" name="confirm" value={values.confirm} onChange={set("confirm")} onBlur={blur("confirm")} autoComplete="new-password" placeholder="Re-enter your password" disabled={isRegistering} invalid={Boolean(err("confirm"))} describedBy={err("confirm") ? "reg-confirm-error" : undefined} />
      </Field>

      <button type="submit" disabled={isRegistering} className={authButton}>
        {isRegistering ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />Creating account...</> : <>Create Account <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
      </button>
    </form>;
};
