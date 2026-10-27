/**
 * Post-login return path. Only same-site, in-app paths are accepted (no protocol-relative or
 * absolute URLs, no account pages) so `?next=` can never be used as an open redirect.
 */
export function safeNext(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v || v.length > 500) return '';
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\') || [...v].some((ch) => ch.charCodeAt(0) < 32)) return '';
  if (/^\/account(\/|\?|$)/.test(v)) return '';
  return v;
}
