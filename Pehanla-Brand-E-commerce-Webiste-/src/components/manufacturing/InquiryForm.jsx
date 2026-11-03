import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useManufacturingRequestMutation } from '../../hooks/useQueries';
import { ContactFields, Field, RequestSuccess, SignInGate, contactPayload, emptyContact, inputCls, validateContact } from '../B2BForm';
import { FieldError } from '../StateViews';

const id = (x) => x?._id || x?.id;

/**
 * Manufacturing inquiry. Submits the existing authenticated contract (POST /manufacturing/requests):
 * { customer, category, style, variant?, quantity, requirements, customerNotes? }.
 * Category / style / colour state lives in the parent so galleries can preselect a configuration.
 */
export default function InquiryForm({ categories, categoryId, onCategory, styles, styleId, onStyle, variants, variantId, onVariant, lockCategory = false }) {
  const { isAuthenticated, user, navigate, showToast } = useApp();
  const submit = useManufacturingRequestMutation();
  const [contact, setContact] = useState(() => emptyContact(user));
  const [quantity, setQuantity] = useState('');
  const [requirements, setRequirements] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);

  if (done) {
    return (
      <RequestSuccess title="Inquiry sent" number={done.number} text="Our team will review your brief and reply with a quote. You can follow it in your account.">
        <div className="flex gap-3 mt-2">
          <button type="button" onClick={() => navigate('account', { tab: 'requests' })} className="px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer">View my requests</button>
          <button type="button" onClick={() => { setDone(null); setQuantity(''); setRequirements(''); setNotes(''); }} className="px-5 py-2.5 rounded-lg border border-border-subtle text-xs font-bold cursor-pointer">New inquiry</button>
        </div>
      </RequestSuccess>
    );
  }
  if (!isAuthenticated) return <SignInGate onSignIn={() => navigate('account')} what="send a manufacturing inquiry" />;

  const onSubmit = (e) => {
    e.preventDefault();
    const errs = validateContact(contact);
    const q = Number(quantity);
    if (!categoryId) errs.category = 'Choose a garment category.';
    if (!styleId) errs.style = 'Choose a style.';
    if (!Number.isInteger(q) || q < 1) errs.quantity = 'Enter the quantity you need (whole number).';
    if (requirements.trim().length < 3) errs.requirements = 'Describe what you need (at least a few words).';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    submit.mutate(
      {
        customer: contactPayload(contact),
        category: categoryId,
        style: styleId,
        ...(variantId ? { variant: variantId } : {}),
        quantity: q,
        requirements: requirements.trim(),
        ...(notes.trim() ? { customerNotes: notes.trim() } : {}),
      },
      { onSuccess: (r) => { setDone({ number: r?.requestNumber }); showToast('Manufacturing inquiry sent'); } },
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="bg-white border border-border-subtle rounded-2xl p-6 flex flex-col gap-4" data-testid="mf-form">
      <ContactFields prefix="mf" value={contact} onChange={setContact} errors={errors} serverError={submit.error} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field id="mf-cat" label="Garment" error={errors.category}>
          <select id="mf-cat" disabled={lockCategory} value={categoryId || ''} onChange={(e) => onCategory?.(e.target.value)} className={inputCls(errors.category)}>
            <option value="">Choose…</option>
            {categories.map((c) => <option key={id(c)} value={id(c)}>{c.name}</option>)}
          </select>
        </Field>
        <Field id="mf-style" label="Style" error={errors.style}>
          <select id="mf-style" value={styleId || ''} onChange={(e) => onStyle(e.target.value)} className={inputCls(errors.style)}>
            <option value="">Choose…</option>
            {styles.map((s) => <option key={id(s)} value={id(s)}>{s.name}</option>)}
          </select>
        </Field>
        <Field id="mf-variant" label="Colour (optional)">
          <select id="mf-variant" value={variantId || ''} onChange={(e) => onVariant(e.target.value)} className={inputCls(false)}>
            <option value="">No preference</option>
            {variants.map((v) => <option key={id(v)} value={id(v)}>{v.colorName || v.name || v.variantCode}</option>)}
          </select>
        </Field>
        <Field id="mf-qty" label="Quantity" error={errors.quantity}>
          <input id="mf-qty" type="number" min="1" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-describedby="mf-qty-err" className={inputCls(errors.quantity)} />
        </Field>
      </div>
      <Field id="mf-req" label="Project brief" error={errors.requirements}>
        <textarea id="mf-req" rows={5} maxLength={10000} value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Fabric, GSM, sizes, branding, deadlines…" aria-describedby="mf-req-err" className={inputCls(errors.requirements)} />
      </Field>
      <Field id="mf-notes" label="Notes (optional)"><textarea id="mf-notes" rows={2} maxLength={3000} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls(false)} /></Field>
      {submit.error && !Object.keys(submit.error.fieldErrors || {}).length && <FieldError message={submit.error.message} />}
      <button type="submit" disabled={submit.isPending} className="self-start px-7 py-3 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60">{submit.isPending ? 'Sending…' : 'Send inquiry'}</button>
    </form>
  );
}
