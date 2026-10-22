import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { usePrintingRequestMutation, usePrintingServicesQuery, useUploadMediaMutation } from '../hooks/useQueries';
import Seo from '../seo/Seo';
import { breadcrumbSchema } from '../seo/schema';
import { EmptyBlock, ErrorBlock, FieldError, LoadingBlock } from '../components/StateViews';
import { ContactFields, Field, RequestSuccess, SignInGate, contactPayload, emptyContact, inputCls, validateContact } from '../components/B2BForm';

const ZONES = {
  front: ['Left Chest', 'Right Chest', 'Center Front', 'Left Sleeve'],
  back: ['Back Collar / Nape', 'Center Back'],
};
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf'];

export default function PrintingBrandingPage() {
  const { isAuthenticated, user, navigate, showToast } = useApp();
  const { data, isLoading, isError, error, refetch } = usePrintingServicesQuery();
  const services = Array.isArray(data) ? data : data?.items || [];
  const submit = usePrintingRequestMutation();
  const upload = useUploadMediaMutation();

  const [view, setView] = useState('front');
  const [zones, setZones] = useState([]);
  const [contact, setContact] = useState(() => emptyContact(user));
  const [f, setF] = useState({ serviceId: '', garmentSource: 'pehanly', garmentDetails: '', colors: '', quantity: '', requirements: '', notes: '' });
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState('');
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const toggleZone = (z) => setZones((cur) => (cur.includes(z) ? cur.filter((x) => x !== z) : [...cur, z]));

  const onFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    setFileError('');
    const next = [...files];
    for (const file of picked) {
      if (next.length >= MAX_FILES) { setFileError(`You can attach up to ${MAX_FILES} files.`); break; }
      if (!ALLOWED.includes(file.type)) { setFileError('Allowed files: PNG, JPG, WebP, SVG or PDF.'); continue; }
      if (file.size > MAX_BYTES) { setFileError('Each file must be 10 MB or smaller.'); continue; }
      next.push(file);
    }
    setFiles(next);
    e.target.value = '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validateContact(contact);
    const q = Number(f.quantity);
    if (!f.serviceId) errs.serviceId = 'Choose a service.';
    if (f.garmentDetails.trim().length < 1) errs.garmentDetails = 'Describe the garment.';
    if (!Number.isInteger(q) || q < 1) errs.quantity = 'Enter the quantity (whole number).';
    if (f.requirements.trim().length < 1) errs.requirements = 'Describe what you need printed or branded.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      const artwork = [];
      for (const file of files) {
        const m = await upload.mutateAsync({ file, purpose: 'printing_artwork' });
        artwork.push({
          url: m.url,
          publicId: m.publicId,
          ...(m.resourceType ? { resourceType: m.resourceType } : {}),
          originalName: m.originalName || file.name,
          ...(m.format ? { format: m.format } : {}),
          ...(Number.isFinite(m.bytes) ? { bytes: m.bytes } : { bytes: file.size }),
        });
      }
      const colors = f.colors.split(',').map((c) => c.trim()).filter(Boolean);
      const r = await submit.mutateAsync({
        serviceId: f.serviceId,
        customer: contactPayload(contact),
        garmentSource: f.garmentSource,
        garmentDetails: f.garmentDetails.trim(),
        ...(colors.length ? { colors } : {}),
        quantity: q,
        requirements: f.requirements.trim(),
        ...(zones.length ? { placements: zones.map((name) => ({ name })) } : {}),
        ...(artwork.length ? { artwork } : {}),
        ...(f.notes.trim() ? { customerNotes: f.notes.trim() } : {}),
      });
      setDone({ number: r?.requestNumber });
      showToast('Printing request sent');
    } catch {
      /* errors are surfaced from the mutation state below */
    }
  };

  const err = submit.error || upload.error;
  const busy = submit.isPending || upload.isPending;

  return (
    <div className="w-full flex flex-col bg-surface">
      <Seo
        title="Printing, Embroidery & Branding"
        description="Custom printing, embroidery and branding services for apparel from PEHAN LY. Upload your artwork and request a quote."
        path="/printing-branding"
        jsonLd={[breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Printing & Branding', path: '/printing-branding' }])]}
      />

      <section className="w-full px-4 sm:px-8 lg:px-12 py-14 lg:py-20 bg-surface-container-low border-b border-border-subtle">
        <div className="max-w-5xl mx-auto flex flex-col gap-5">
          <span className="text-xs uppercase tracking-widest font-bold text-primary">Printing &amp; Branding</span>
          <h1 className="font-headline font-bold text-4xl sm:text-5xl lg:text-6xl text-primary leading-tight">Put Your Brand On Every Piece.</h1>
          <p className="text-base lg:text-lg text-muted max-w-2xl">Choose a service, tell us where your artwork goes and upload your files. We will review and send you a quote.</p>
          <div className="flex gap-4 pt-2">
            <a href="#request" className="h-12 px-8 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-lg flex items-center">Request a quote</a>
            <Link to="/custom-manufacturing" className="h-12 px-8 border-2 border-primary text-primary text-xs font-bold uppercase tracking-widest rounded-lg flex items-center">Custom Manufacturing</Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="ps-h" className="w-full px-4 sm:px-8 lg:px-12 py-16">
        <div className="max-w-7xl mx-auto">
          <h2 id="ps-h" className="font-headline font-bold text-3xl text-primary mb-8">Our Services</h2>
          {isLoading ? <LoadingBlock label="Loading services…" /> : isError ? <ErrorBlock error={error} onRetry={refetch} /> : services.length === 0 ? (
            <EmptyBlock icon="print" title="Services coming soon" text="Our printing and branding services are being updated." />
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {services.map((s) => (
                <li key={s._id || s.id} className="bg-white border border-border-subtle rounded-2xl overflow-hidden flex flex-col">
                  {s.media?.[0]?.url && <img src={s.media[0].url} alt={s.media[0].alt || s.name} width="640" height="400" loading="lazy" referrerPolicy="no-referrer" className="w-full h-44 object-cover" />}
                  <div className="p-5 flex flex-col gap-2 flex-1">
                    <h3 className="font-headline font-bold text-lg text-primary">{s.name}</h3>
                    {s.description && <p className="text-sm text-muted">{s.description}</p>}
                    <button type="button" onClick={() => { setF((x) => ({ ...x, serviceId: s._id || s.id })); document.getElementById('request')?.scrollIntoView({ behavior: 'smooth' }); }} className="mt-auto pt-2 self-start text-xs font-bold uppercase tracking-wider text-primary underline cursor-pointer">Request this service</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="pl-h" className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface-card border-y border-border-subtle">
        <div className="max-w-4xl mx-auto">
          <h2 id="pl-h" className="font-headline font-bold text-3xl text-primary">Choose Your Placement</h2>
          <p className="text-sm text-muted mt-2 mb-6">Select where you want your logo or artwork. Your choices are sent with your request.</p>
          <div className="flex gap-2 mb-4" role="group" aria-label="Garment view">
            {['front', 'back'].map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase cursor-pointer ${view === v ? 'bg-primary text-white' : 'bg-surface border border-border-subtle text-muted'}`}>{v} view</button>)}
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ZONES[view].map((z) => (
              <li key={z}>
                <button type="button" aria-pressed={zones.includes(z)} onClick={() => toggleZone(z)} className={`w-full p-3 rounded-xl text-left flex items-center justify-between text-sm font-semibold cursor-pointer ${zones.includes(z) ? 'bg-primary text-white' : 'bg-surface hover:bg-surface-container'}`}>
                  <span>{z}</span><span className="text-[10px] uppercase">{zones.includes(z) ? 'Selected' : 'Select'}</span>
                </button>
              </li>
            ))}
          </ul>
          {zones.length > 0 && <p className="text-xs text-muted mt-3">Selected: {zones.join(', ')}</p>}
        </div>
      </section>

      <section id="request" aria-labelledby="pr-h" className="w-full px-4 sm:px-8 lg:px-12 py-16 scroll-mt-28">
        <div className="max-w-3xl mx-auto">
          <h2 id="pr-h" className="font-headline font-bold text-3xl text-primary mb-6">Request a Quote</h2>
          {done ? (
            <RequestSuccess title="Request sent" number={done.number} text="Our team will review your artwork and requirements and reply with a quote.">
              <button type="button" onClick={() => navigate('account', { tab: 'requests' })} className="px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer">View my requests</button>
            </RequestSuccess>
          ) : !isAuthenticated ? <SignInGate onSignIn={() => navigate('account')} what="send a printing request" /> : (
            <form onSubmit={onSubmit} noValidate className="bg-white border border-border-subtle rounded-2xl p-6 flex flex-col gap-4">
              <ContactFields prefix="pr" value={contact} onChange={setContact} errors={errors} serverError={submit.error} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="pr-service" label="Service" error={errors.serviceId}>
                  <select id="pr-service" value={f.serviceId} onChange={set('serviceId')} aria-describedby="pr-service-err" className={inputCls(errors.serviceId)}><option value="">Select…</option>{services.map((s) => <option key={s._id || s.id} value={s._id || s.id}>{s.name}</option>)}</select>
                </Field>
                <Field id="pr-qty" label="Quantity" error={errors.quantity}>
                  <input id="pr-qty" type="number" min="1" inputMode="numeric" value={f.quantity} onChange={set('quantity')} aria-describedby="pr-qty-err" className={inputCls(errors.quantity)} />
                </Field>
              </div>
              <fieldset>
                <legend className="text-xs font-bold text-on-surface mb-1.5">Garments</legend>
                <div className="flex gap-6 text-sm">
                  <label className="flex items-center gap-2"><input type="radio" name="gs" value="pehanly" checked={f.garmentSource === 'pehanly'} onChange={set('garmentSource')} className="accent-[#173B32]" />PEHANLY supplies the garments</label>
                  <label className="flex items-center gap-2"><input type="radio" name="gs" value="customer_supplied" checked={f.garmentSource === 'customer_supplied'} onChange={set('garmentSource')} className="accent-[#173B32]" />I will supply them</label>
                </div>
              </fieldset>
              <Field id="pr-garment" label="Garment details" error={errors.garmentDetails}>
                <input id="pr-garment" value={f.garmentDetails} onChange={set('garmentDetails')} placeholder="e.g. Polo shirt, 220 GSM" aria-describedby="pr-garment-err" className={inputCls(errors.garmentDetails)} />
              </Field>
              <Field id="pr-colors" label="Colours (optional, comma separated)"><input id="pr-colors" value={f.colors} onChange={set('colors')} className={inputCls(false)} /></Field>
              <Field id="pr-req" label="What should be printed / branded?" error={errors.requirements}>
                <textarea id="pr-req" rows={4} maxLength={10000} value={f.requirements} onChange={set('requirements')} aria-describedby="pr-req-err" className={inputCls(errors.requirements)} />
              </Field>
              <div>
                <label htmlFor="pr-files" className="block text-xs font-bold text-on-surface mb-1.5">Artwork (PNG, JPG, WebP, SVG or PDF; up to {MAX_FILES} files, 10 MB each)</label>
                <input id="pr-files" type="file" multiple accept={ALLOWED.join(',')} onChange={onFiles} className="block w-full text-sm" />
                <FieldError message={fileError} />
                {files.length > 0 && (
                  <ul className="mt-2 text-xs text-muted flex flex-col gap-1">
                    {files.map((file, i) => <li key={file.name + i} className="flex items-center gap-2">{file.name}<button type="button" onClick={() => setFiles(files.filter((_, x) => x !== i))} aria-label={`Remove ${file.name}`} className="text-error font-bold cursor-pointer">×</button></li>)}
                  </ul>
                )}
              </div>
              <Field id="pr-notes" label="Notes (optional)"><textarea id="pr-notes" rows={2} maxLength={3000} value={f.notes} onChange={set('notes')} className={inputCls(false)} /></Field>
              {err && !Object.keys(err.fieldErrors || {}).length && <FieldError message={err.message} />}
              <button type="submit" disabled={busy} className="self-start px-7 py-3 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60">{upload.isPending ? 'Uploading artwork…' : submit.isPending ? 'Sending…' : 'Send request'}</button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
