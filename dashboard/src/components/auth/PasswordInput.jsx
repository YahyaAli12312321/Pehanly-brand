import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { authInput } from "./AuthShell";

/** Password field with an accessible show/hide toggle (button, aria-pressed, keyboard reachable). */
export const PasswordInput = ({ id, value, onChange, onBlur, autoComplete, placeholder, disabled, invalid, describedBy, autoFocus, name }) => {
  const [shown, setShown] = useState(false);
  return <div className="relative">
      <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
      <input
    id={id}
    name={name}
    className={`${authInput} pl-10 pr-12 ${invalid ? "border-rose-400 focus:border-rose-500" : ""}`}
    type={shown ? "text" : "password"}
    value={value}
    onChange={onChange}
    onBlur={onBlur}
    autoComplete={autoComplete}
    placeholder={placeholder}
    disabled={disabled}
    aria-invalid={invalid ? "true" : undefined}
    aria-describedby={describedBy}
    autoFocus={autoFocus}
    spellCheck={false}
    autoCapitalize="none"
  />
      <button
    type="button"
    onClick={() => setShown((s) => !s)}
    aria-label={shown ? "Hide password" : "Show password"}
    aria-pressed={shown}
    disabled={disabled}
    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f2922]/40"
  >
        {shown ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
      </button>
    </div>;
};
