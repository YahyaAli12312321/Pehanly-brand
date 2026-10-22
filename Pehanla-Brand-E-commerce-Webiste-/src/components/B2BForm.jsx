import React from 'react';
import { FieldError } from './StateViews';
import { isValidEmail, isValidPhone } from '../utils/format';

export const inputCls = (bad) =>
  `w-full px-4 py-3 rounded-lg bg-surface border text-sm focus:outline-none focus:border-primary ${bad ? 'border-error' : 'border-border-subtle'}`;

export function Field({ id, label, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-on-surface mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
      <FieldError id={`${id}-err`} message={error} />
    </div>
  );
}

export const emptyContact = (user) => ({
  name: user?.name || '',
  email: user?.email || '',
  phone: user?.phone || '',
  businessName: '',
  businessType: '',
  taxNtn: '',
});

export function validateContact(c, { requireBusiness = false } = {}) {
  const e = {};
  if (c.name.trim().length < 2) e.name = 'Enter your full name.';
  if (!isValidEmail(c.email)) e.email = 'Enter a valid email address.';
  if (!isValidPhone(c.phone)) e.phone = 'Enter a valid phone number.';
  if (requireBusiness && !c.businessName.trim()) e.businessName = 'Enter your business or brand name.';
  return e;
}

/** Strip empty optional fields so the strict backend schema accepts the body. */
export function contactPayload(c) {
  const out = { name: c.name.trim(), email: c.email.trim(), phone: c.phone.trim() };
  ['businessName', 'businessType', 'taxNtn'].forEach((k) => { if (c[k]?.trim()) out[k] = c[k].trim(); });
  return out;
}

/** Look up a server field error by its last path segment. */
export function serverFieldError(err, key) {
  const fe = err?.fieldErrors || {};
  const hit = Object.keys(fe).find((k) => k === key || k.endsWith(`.${key}`));
  return hit ? fe[hit] : '';
}

export function ContactFields({ prefix, value, onChange, errors = {}, serverError, business = true }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const err = (k) => errors[k] || serverFieldError(serverError, k);
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <Field id={`${prefix}-name`} label="Full name" error={err('name')}>
        <input id={`${prefix}-name`} autoComplete="name" value={value.name} onChange={set('name')} aria-invalid={Boolean(err('name'))} aria-describedby={`${prefix}-name-err`} className={inputCls(err('name'))} />
      </Field>
      <Field id={`${prefix}-email`} label="Email" error={err('email')}>
        <input id={`${prefix}-email`} type="email" autoComplete="email" value={value.email} onChange={set('email')} aria-invalid={Boolean(err('email'))} aria-describedby={`${prefix}-email-err`} className={inputCls(err('email'))} />
      </Field>
      <Field id={`${prefix}-phone`} label="Phone" error={err('phone')}>
        <input id={`${prefix}-phone`} type="tel" autoComplete="tel" value={value.phone} onChange={set('phone')} aria-invalid={Boolean(err('phone'))} aria-describedby={`${prefix}-phone-err`} className={inputCls(err('phone'))} />
      </Field>
      {business && (
        <>
          <Field id={`${prefix}-biz`} label="Business / brand name" error={err('businessName')}>
            <input id={`${prefix}-biz`} autoComplete="organization" value={value.businessName} onChange={set('businessName')} aria-describedby={`${prefix}-biz-err`} className={inputCls(err('businessName'))} />
          </Field>
          <Field id={`${prefix}-type`} label="Business type (optional)" error={err('businessType')}>
            <input id={`${prefix}-type`} value={value.businessType} onChange={set('businessType')} placeholder="e.g. Boutique, online store" className={inputCls(false)} />
          </Field>
          <Field id={`${prefix}-ntn`} label="NTN (optional)" error={err('taxNtn')}>
            <input id={`${prefix}-ntn`} value={value.taxNtn} onChange={set('taxNtn')} className={inputCls(false)} />
          </Field>
        </>
      )}
    </div>
  );
}

export function SignInGate({ onSignIn, what = 'send a request' }) {
  return (
    <div className="bg-surface-container-low border border-border-subtle rounded-xl p-5 text-sm text-muted">
      Please <button type="button" onClick={onSignIn} className="font-bold text-primary underline cursor-pointer">sign in or create an account</button> to {what}. Your selections stay on this page.
    </div>
  );
}

export function RequestSuccess({ title, number, text, children }) {
  return (
    <div role="status" className="bg-accent-subtle border border-border-subtle rounded-2xl p-8 text-center flex flex-col items-center gap-3">
      <span className="material-symbols-outlined text-4xl text-primary" aria-hidden="true">check_circle</span>
      <h3 className="font-headline text-xl font-bold text-primary">{title}</h3>
      {number && <p className="text-sm">Reference: <strong className="font-headline text-primary">{number}</strong></p>}
      <p className="text-sm text-muted max-w-md">{text}</p>
      {children}
    </div>
  );
}
