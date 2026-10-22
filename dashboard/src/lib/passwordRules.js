/**
 * Password rules mirror the backend validator exactly (auth.validators.js):
 * 8-72 characters. Nothing is claimed beyond what the API enforces.
 */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export function passwordChecks(password = "", confirm = "") {
  return [
    { id: "min", label: `At least ${PASSWORD_MIN} characters`, ok: password.length >= PASSWORD_MIN },
    { id: "max", label: `No more than ${PASSWORD_MAX} characters`, ok: password.length > 0 && password.length <= PASSWORD_MAX },
    { id: "match", label: "Both passwords match", ok: confirm.length > 0 && password === confirm }
  ];
}

export function validateNewPassword(password = "", confirm = "") {
  const errors = {};
  if (!password) errors.password = "Enter a new password";
  else if (password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters`;
  else if (password.length > PASSWORD_MAX) errors.password = `Use at most ${PASSWORD_MAX} characters`;
  if (!confirm) errors.confirm = "Confirm your new password";
  else if (password && confirm !== password) errors.confirm = "Passwords do not match";
  return errors;
}

/** Identifier accepted by POST /auth/login: an e-mail address or a phone number (3-160 chars). */
export function validateIdentifier(value = "") {
  const v = value.trim();
  if (!v) return "Enter your email or phone";
  if (v.length < 3) return "Enter a valid email or phone";
  if (v.length > 160) return "That is too long";
  return null;
}

export function validateEmail(value = "") {
  const v = value.trim();
  if (!v) return "Enter your email";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email address";
  return null;
}

export const NAME_MIN = 2;
export const NAME_MAX = 120;
export const PHONE_MIN = 7;
export const PHONE_MAX = 20;

export function validateName(value = "") {
  const v = value.trim();
  if (!v) return "Enter your full name";
  if (v.length < NAME_MIN) return `Use at least ${NAME_MIN} characters`;
  if (v.length > NAME_MAX) return `Use at most ${NAME_MAX} characters`;
  return null;
}

/** Mirrors registerBody.phone (7-20 chars); the server additionally normalises and rejects invalid numbers. */
export function validatePhone(value = "") {
  const v = value.trim();
  if (!v) return "Enter your phone number";
  if (v.length < PHONE_MIN) return "Enter a valid phone number";
  if (v.length > PHONE_MAX) return `Use at most ${PHONE_MAX} characters`;
  return null;
}

/** Every client-side check for the register form; empty object = valid. */
export function validateRegistration({ name, email, phone, password, confirm }) {
  const errors = {};
  const n = validateName(name); if (n) errors.name = n;
  const e = validateEmail(email); if (e) errors.email = e;
  const p = validatePhone(phone); if (p) errors.phone = p;
  Object.assign(errors, validateNewPassword(password, confirm));
  if (errors.password) errors.password = errors.password.replace("a new password", "a password");
  if (errors.confirm) errors.confirm = errors.confirm.replace("your new password", "your password");
  return errors;
}

/** Route a server error to a field: ACCOUNT_EXISTS (409) says "email" or "phone number" in its message. */
export function fieldForConflict(message = "") {
  if (/email/i.test(message)) return "email";
  if (/phone/i.test(message)) return "phone";
  return null;
}
