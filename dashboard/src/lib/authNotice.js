/**
 * One-shot, IN-MEMORY notice shared between the 401 handler and the login page.
 * Deliberately not persisted anywhere (no localStorage / sessionStorage / cookies):
 * it is only a UI hint and carries no credentials.
 */
let pending = null;

export function setAuthNotice(kind) {
  pending = kind;
}

/** Returns the pending notice once, then clears it. */
export function takeAuthNotice() {
  const kind = pending;
  pending = null;
  return kind;
}
