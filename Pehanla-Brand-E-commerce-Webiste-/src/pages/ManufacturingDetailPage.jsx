import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  useManufacturingCategoryQuery,
  useManufacturingRequestMutation,
  useManufacturingStylesQuery,
  useManufacturingVariantsQuery,
} from '../hooks/useQueries';
import Seo from '../seo/Seo';
import { breadcrumbSchema } from '../seo/schema';
import { EmptyBlock, ErrorBlock, FieldError, LoadingBlock } from '../components/StateViews';
import { ContactFields, Field, RequestSuccess, SignInGate, contactPayload, emptyContact, inputCls, validateContact } from '../components/B2BForm';
import { categoryImage } from './CustomManufacturingPage';
import NotFoundPage from './NotFoundPage';
import { isLadiesShoes } from '../utils/product';

const VIEW_TABS = [['all', 'All'], ['model', 'Model'], ['mockup', 'Mockup']];

export default function ManufacturingDetailPage() {
  const { categorySlug } = useParams();
  const { isAuthenticated, user, navigate, showToast } = useApp();
  const { data: category, isLoading, isError, error, refetch } = useManufacturingCategoryQuery(categorySlug);
  const categoryId = category?._id || category?.id;
  const { data: stylesData } = useManufacturingStylesQuery(categoryId);
  const styles = useMemo(() => (Array.isArray(stylesData) ? stylesData : stylesData?.items || []), [stylesData]);

  const [styleId, setStyleId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [view, setView] = useState('all');
  const [thumb, setThumb] = useState(0);
  const [contact, setContact] = useState(() => emptyContact(user));
  const [quantity, setQuantity] = useState('');
  const [requirements, setRequirements] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);
  const submit = useManufacturingRequestMutation();

  useEffect(() => { if (styles.length && !styles.some((s) => (s._id || s.id) === styleId)) setStyleId(styles[0]._id || styles[0].id); }, [styles, styleId]);
  const { data: variantsData } = useManufacturingVariantsQuery(styleId);
  const variants = useMemo(() => (Array.isArray(variantsData) ? variantsData : variantsData?.items || []), [variantsData]);
  useEffect(() => { setVariantId(''); setThumb(0); }, [styleId]);

  const style = styles.find((s) => (s._id || s.id) === styleId);
  const variant = variants.find((v) => (v._id || v.id) === variantId);
  const media = useMemo(() => {
    const src = variant ? variant.media || [] : variants.flatMap((v) => v.media || []);
    return src.filter((m) => m?.url && (view === 'all' || m.viewType === view)).slice(0, 60);
  }, [variant, variants, view]);
  useEffect(() => setThumb(0), [view, variantId]);

  if (isLoading) return <LoadingBlock label="Loading…" className="py-40" />;
  if ((isError && error?.status === 404) || (category && isLadiesShoes(category))) return <NotFoundPage title="Category not found" text="This manufacturing category is not available." />;
  if (isError) return <ErrorBlock error={error} onRetry={refetch} className="py-40" />;
  if (!category) return null;

  const onSubmit = (e) => {
    e.preventDefault();
    const errs = validateContact(contact);
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1) errs.quantity = 'Enter the quantity you need (whole number).';
    if (requirements.trim().length < 3) errs.requirements = 'Describe what you need (at least a few words).';
    if (!styleId) errs.style = 'Choose a style.';
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
      { onSuccess: (r) => { setDone({ number: r?.requestNumber }); showToast('Manufacturing request sent'); } },
    );
  };

  const hero = categoryImage(category);
  return (
    <div className="w-full flex flex-col bg-surface">
      <Seo
        title={`Custom ${category.name} Manufacturing`}
        description={category.description || `Custom ${category.name} manufacturing by PEHAN LY.`}
        path={`/custom-manufacturing/${category.slug}`}
        image={hero || undefined}
        jsonLd={[breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Custom Manufacturing', path: '/custom-manufacturing' }, { name: category.name, path: `/custom-manufacturing/${category.slug}` }])]}
      />

      <nav aria-label="Breadcrumb" className="bg-surface-container-low border-b border-border-subtle py-3 px-4 sm:px-8">
        <ol className="max-w-7xl mx-auto flex items-center gap-2 text-xs text-muted">
          <li><Link to="/" className="hover:text-primary">Home</Link></li><li aria-hidden="true">/</li>
          <li><Link to="/custom-manufacturing" className="hover:text-primary">Custom Manufacturing</Link></li><li aria-hidden="true">/</li>
          <li className="text-primary font-semibold" aria-current="page">{category.name}</li>
        </ol>
      </nav>

      <section className="w-full px-4 sm:px-8 lg:px-12 py-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="flex flex-col gap-4">
            <span className="text-xs uppercase tracking-widest font-bold text-primary">Custom manufacturing</span>
            <h1 className="font-headline font-bold text-4xl sm:text-5xl text-primary leading-tight">{category.name}</h1>
            {category.description && <p className="text-base text-muted whitespace-pre-line">{category.description}</p>}
            <a href="#rfq" className="h-12 px-8 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-lg flex items-center w-fit">Request a quote</a>
          </div>
          {hero && <img src={hero} alt={category.name} width="800" height="600" fetchPriority="high" referrerPolicy="no-referrer" className="w-full rounded-2xl object-cover aspect-4/3 border border-border-subtle" />}
        </div>
      </section>

      <section aria-labelledby="styles-h" className="w-full px-4 sm:px-8 lg:px-12 py-12 bg-surface-card border-y border-border-subtle">
        <div className="max-w-7xl mx-auto flex flex-col gap-6">
          <h2 id="styles-h" className="font-headline font-bold text-3xl text-primary">Styles &amp; Colours</h2>
          {styles.length === 0 ? <EmptyBlock icon="checkroom" title="Styles coming soon" text="No styles are published for this category yet." className="py-10" /> : (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Style">
                {styles.map((s) => { const id = s._id || s.id; return (
                  <button key={id} type="button" aria-pressed={styleId === id} onClick={() => setStyleId(id)} className={`px-4 py-2 rounded-full text-xs font-bold cursor-pointer ${styleId === id ? 'bg-primary text-white' : 'bg-surface border border-border-subtle text-on-surface'}`}>{s.name}</button>
                ); })}
              </div>
              {style?.description && <p className="text-sm text-muted max-w-2xl">{style.description}</p>}

              {variants.length > 0 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Colour">
                  <button type="button" aria-pressed={!variantId} onClick={() => setVariantId('')} className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${!variantId ? 'bg-accent text-primary' : 'bg-surface border border-border-subtle'}`}>All</button>
                  {variants.map((v) => { const id = v._id || v.id; return (
                    <button key={id} type="button" aria-pressed={variantId === id} onClick={() => setVariantId(id)} className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${variantId === id ? 'bg-accent text-primary' : 'bg-surface border border-border-subtle'}`}>{v.colorName || v.name}</button>
                  ); })}
                </div>
              )}

              <div className="flex gap-2" role="group" aria-label="View type">
                {VIEW_TABS.map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${view === k ? 'bg-primary text-white' : 'text-muted'}`}>{label}</button>
                ))}
              </div>

              {media.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <img src={media[Math.min(thumb, media.length - 1)].url} alt={media[Math.min(thumb, media.length - 1)].alt || `${category.name} ${style?.name || ''}`} width="800" height="1000" loading="lazy" referrerPolicy="no-referrer" className="lg:col-span-7 w-full rounded-xl object-cover aspect-4/5 bg-surface-container" />
                  <ul className="lg:col-span-5 grid grid-cols-4 gap-2 content-start">
                    {media.map((m, i) => (
                      <li key={m.url + i}><button type="button" aria-label={`Image ${i + 1}`} aria-current={thumb === i} onClick={() => setThumb(i)} className={`block w-full aspect-square rounded-lg overflow-hidden cursor-pointer ${thumb === i ? 'ring-2 ring-primary' : 'opacity-80 hover:opacity-100'}`}><img src={m.url} alt="" width="120" height="120" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" /></button></li>
                    ))}
                  </ul>
                </div>
              ) : <p className="text-sm text-muted">No images are available for this selection yet.</p>}
            </>
          )}
        </div>
      </section>

      <section id="rfq" aria-labelledby="rfq-h" className="w-full px-4 sm:px-8 lg:px-12 py-16 scroll-mt-28">
        <div className="max-w-3xl mx-auto">
          <h2 id="rfq-h" className="font-headline font-bold text-3xl text-primary mb-6">Request a Quote</h2>
          {done ? (
            <RequestSuccess title="Request sent" number={done.number} text="Our team will review your brief and reply with a quote. You can follow it in your account.">
              <button type="button" onClick={() => navigate('account', { tab: 'requests' })} className="px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer">View my requests</button>
            </RequestSuccess>
          ) : !isAuthenticated ? <SignInGate onSignIn={() => navigate('account')} what="send a manufacturing request" /> : (
            <form onSubmit={onSubmit} noValidate className="bg-white border border-border-subtle rounded-2xl p-6 flex flex-col gap-4">
              <ContactFields prefix="mf" value={contact} onChange={setContact} errors={errors} serverError={submit.error} />
              <div className="grid sm:grid-cols-3 gap-4">
                <Field id="mf-style" label="Style" error={errors.style}>
                  <select id="mf-style" value={styleId} onChange={(e) => setStyleId(e.target.value)} className={inputCls(errors.style)}>{styles.map((s) => <option key={s._id || s.id} value={s._id || s.id}>{s.name}</option>)}</select>
                </Field>
                <Field id="mf-variant" label="Colour (optional)">
                  <select id="mf-variant" value={variantId} onChange={(e) => setVariantId(e.target.value)} className={inputCls(false)}><option value="">No preference</option>{variants.map((v) => <option key={v._id || v.id} value={v._id || v.id}>{v.colorName || v.name}</option>)}</select>
                </Field>
                <Field id="mf-qty" label="Quantity" error={errors.quantity}>
                  <input id="mf-qty" type="number" min="1" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-describedby="mf-qty-err" className={inputCls(errors.quantity)} />
                </Field>
              </div>
              <Field id="mf-req" label="Requirements" error={errors.requirements}>
                <textarea id="mf-req" rows={5} maxLength={10000} value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Fabric, GSM, sizes, branding, deadlines…" aria-describedby="mf-req-err" className={inputCls(errors.requirements)} />
              </Field>
              <Field id="mf-notes" label="Notes (optional)"><textarea id="mf-notes" rows={2} maxLength={3000} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls(false)} /></Field>
              {submit.error && !Object.keys(submit.error.fieldErrors || {}).length && <FieldError message={submit.error.message} />}
              <button type="submit" disabled={submit.isPending} className="self-start px-7 py-3 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60">{submit.isPending ? 'Sending…' : 'Send request'}</button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
