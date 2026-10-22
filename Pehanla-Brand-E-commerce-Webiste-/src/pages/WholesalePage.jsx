import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  useCategoriesQuery,
  useProductQuery,
  useProductsQuery,
  useWholesalePacksQuery,
  useWholesaleRequestMutations,
} from '../hooks/useQueries';
import Seo from '../seo/Seo';
import { breadcrumbSchema } from '../seo/schema';
import { ErrorBlock, FieldError, LoadingBlock } from '../components/StateViews';
import { ContactFields, Field, RequestSuccess, SignInGate, contactPayload, emptyContact, inputCls, validateContact } from '../components/B2BForm';
import { isLadiesShoes } from '../utils/product';

const sum = (arr, f) => arr.reduce((n, x) => n + f(x), 0);

function SkuPicker({ slug, staged, setQty }) {
  const { data: product, isLoading, isError, error, refetch } = useProductQuery(slug);
  if (isLoading) return <LoadingBlock label="Loading sizes…" className="py-6" />;
  if (isError) return <ErrorBlock error={error} onRetry={refetch} className="py-6" />;
  return (
    <div className="flex flex-col gap-4 pt-4 border-t border-border-subtle mt-4">
      {product.variants.map((v) => (
        <fieldset key={v.id}>
          <legend className="flex items-center gap-2 text-xs font-bold text-on-surface mb-2">
            <span className="w-3.5 h-3.5 rounded-full border border-border-subtle" style={{ backgroundColor: v.color?.hexCode || '#ccc' }} aria-hidden="true" />
            {v.color?.name}
          </legend>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {v.sizes.map((s) => (
              <div key={s.id}>
                <label htmlFor={`q-${s.id}`} className="block text-[11px] font-semibold text-muted mb-1">{s.size}{!s.inStock && ' (out)'}</label>
                <input
                  id={`q-${s.id}`}
                  type="number"
                  min="0"
                  max="100000"
                  inputMode="numeric"
                  disabled={!s.inStock}
                  value={staged[s.id]?.quantity ?? ''}
                  placeholder="0"
                  onChange={(e) => setQty({ skuId: s.id, quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)), productName: product.name, color: v.color?.name, size: s.size, sku: s.sku })}
                  className={`${inputCls(false)} py-2 text-center disabled:opacity-40`}
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export default function WholesalePage() {
  const { isAuthenticated, user, navigate, showToast } = useApp();
  const { data: packData, isLoading: packsLoading, isError: packsError, error: packsErr, refetch: refetchPacks } = useWholesalePacksQuery();
  const { data: categories } = useCategoriesQuery();
  const { pack: packMut, custom: customMut } = useWholesaleRequestMutations();

  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [openSlug, setOpenSlug] = useState(null);
  const [staged, setStaged] = useState({}); // skuId -> {skuId, quantity, productName, color, size, sku}
  const [contact, setContact] = useState(() => emptyContact(user));
  const [notes, setNotes] = useState('');
  const [proposal, setProposal] = useState('');
  const [errors, setErrors] = useState({});
  const [packTarget, setPackTarget] = useState(null);
  const [done, setDone] = useState(null);

  // Ladies' Shoes are retail-only: never offered here.
  const wsCategories = useMemo(() => (categories || []).filter((c) => !isLadiesShoes(c)), [categories]);
  const { data: productData, isLoading: productsLoading, isError: productsError, error: productsErr, refetch: refetchProducts } = useProductsQuery({ category: category || undefined, search: search || undefined, limit: 24 });
  const products = (productData?.items || []).filter((p) => !isLadiesShoes(p.category));
  const packs = packData?.items || [];

  const lines = Object.values(staged).filter((l) => l.quantity > 0);
  const totalUnits = sum(lines, (l) => l.quantity);

  const setQty = (line) => setStaged((s) => ({ ...s, [line.skuId]: line }));

  const submitCustom = (e) => {
    e.preventDefault();
    const errs = validateContact(contact, { requireBusiness: true });
    if (!lines.length) errs.items = 'Add at least one size quantity above.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    customMut.mutate(
      {
        customer: contactPayload(contact),
        items: lines.map((l) => ({ sku: l.skuId, quantity: l.quantity })),
        ...(proposal.trim() ? { partnershipProposal: proposal.trim() } : {}),
        ...(notes.trim() ? { customerNotes: notes.trim() } : {}),
      },
      { onSuccess: (r) => { setDone({ kind: 'custom', number: r?.requestNumber }); setStaged({}); showToast('Wholesale request sent'); } },
    );
  };

  const submitPack = (e) => {
    e.preventDefault();
    const errs = validateContact(contact, { requireBusiness: true });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    packMut.mutate(
      { packId: packTarget._id || packTarget.id, body: { customer: contactPayload(contact), ...(notes.trim() ? { customerNotes: notes.trim() } : {}) } },
      { onSuccess: (r) => { setDone({ kind: 'pack', number: r?.requestNumber, name: packTarget.name }); setPackTarget(null); showToast('Pack request sent'); } },
    );
  };

  const goSignIn = () => navigate('account');

  return (
    <div className="w-full flex flex-col bg-surface">
      <Seo
        title="Wholesale Clothing Supply"
        description="Source wholesale apparel from PEHAN LY: request a ready-made pack or build your own bulk order and get a quote from our team."
        path="/wholesale"
        jsonLd={[breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Wholesale', path: '/wholesale' }])]}
      />

      <section className="w-full px-4 sm:px-8 lg:px-12 py-14 lg:py-20 bg-primary text-white">
        <div className="max-w-5xl mx-auto flex flex-col gap-5">
          <span className="text-xs uppercase tracking-widest font-bold text-accent">PEHANLY Wholesale • B2B apparel supply</span>
          <h1 className="font-headline font-bold text-4xl sm:text-5xl lg:text-6xl leading-tight">Wholesale Made <span className="text-accent">Flexible.</span></h1>
          <p className="text-base lg:text-lg text-surface-container-high max-w-2xl">
            Choose a ready-made wholesale pack, or build a custom bulk order from our active catalogue by size and colour. Send your request and our team will respond with a quote.
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <a href="#builder-section" className="h-12 px-8 bg-accent text-primary text-xs font-bold uppercase tracking-widest rounded-lg flex items-center">Build your own order</a>
            <a href="#ready-packs-section" className="h-12 px-8 border-2 border-white/70 text-white text-xs font-bold uppercase tracking-widest rounded-lg flex items-center">Explore ready packs</a>
          </div>
        </div>
      </section>

      {done && (
        <div className="max-w-3xl mx-auto w-full px-4 py-10">
          <RequestSuccess
            title={done.kind === 'pack' ? `Pack request sent${done.name ? `: ${done.name}` : ''}` : 'Wholesale request sent'}
            number={done.number}
            text="Thank you. Our team will review your request and contact you with a quote. You can follow its status in your account."
          >
            <div className="flex gap-3 mt-2">
              <button type="button" onClick={() => navigate('account', { tab: 'requests' })} className="px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer">View my requests</button>
              <button type="button" onClick={() => setDone(null)} className="px-5 py-2.5 rounded-lg border border-border-subtle text-xs font-bold cursor-pointer">New request</button>
            </div>
          </RequestSuccess>
        </div>
      )}

      <section id="ready-packs-section" aria-labelledby="packs-h" className="w-full px-4 sm:px-8 lg:px-12 py-16 scroll-mt-28">
        <div className="max-w-7xl mx-auto">
          <span className="text-xs uppercase tracking-widest font-bold text-primary">Rapid restocking</span>
          <h2 id="packs-h" className="font-headline font-bold text-3xl sm:text-4xl text-primary mt-1 mb-8">Ready Wholesale Packs</h2>
          {packsLoading ? <LoadingBlock label="Loading packs…" className="py-10" /> : packsError ? <ErrorBlock error={packsErr} onRetry={refetchPacks} className="py-10" /> : packs.length === 0 ? (
            <p className="text-sm text-muted">No ready packs are available right now. You can still build your own order below.</p>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {packs.map((pk) => {
                const units = sum(pk.items || [], (i) => i.quantity || 0);
                return (
                  <li key={pk._id || pk.id || pk.slug} className="bg-white rounded-2xl border border-border-subtle overflow-hidden flex flex-col">
                    {pk.image?.url && <img src={pk.image.url} alt={pk.image.alt || pk.name} width="480" height="320" loading="lazy" referrerPolicy="no-referrer" className="w-full h-48 object-cover" />}
                    <div className="p-6 flex flex-col gap-2 flex-1">
                      <h3 className="font-headline font-bold text-lg text-primary">{pk.name}</h3>
                      {pk.description && <p className="text-sm text-muted">{pk.description}</p>}
                      {units > 0 && <p className="text-xs font-semibold text-on-surface">{units} pieces across {pk.items.length} {pk.items.length === 1 ? 'item' : 'items'}</p>}
                      <button type="button" onClick={() => { setPackTarget(pk); setErrors({}); setTimeout(() => document.getElementById('pack-form')?.scrollIntoView({ behavior: 'smooth' }), 50); }} className="mt-auto pt-3 self-start text-xs font-bold uppercase tracking-wider text-primary underline cursor-pointer">Request this pack</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {packTarget && (
            <form id="pack-form" onSubmit={submitPack} noValidate className="mt-8 bg-white border border-border-subtle rounded-2xl p-6 flex flex-col gap-4 scroll-mt-28">
              <h3 className="font-headline font-bold text-lg text-primary">Request: {packTarget.name}</h3>
              {!isAuthenticated ? <SignInGate onSignIn={goSignIn} what="request a pack" /> : (
                <>
                  <ContactFields prefix="pk" value={contact} onChange={setContact} errors={errors} serverError={packMut.error} />
                  <Field id="pk-notes" label="Notes (optional)"><textarea id="pk-notes" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls(false)} /></Field>
                  {packMut.error && !Object.keys(packMut.error.fieldErrors || {}).length && <p role="alert" className="text-xs font-semibold text-error">{packMut.error.message}</p>}
                  <div className="flex gap-3">
                    <button type="submit" disabled={packMut.isPending} className="px-6 py-3 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60">{packMut.isPending ? 'Sending…' : 'Send request'}</button>
                    <button type="button" onClick={() => setPackTarget(null)} className="px-6 py-3 text-xs font-bold cursor-pointer">Cancel</button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </section>

      <section id="builder-section" aria-labelledby="builder-h" className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface-container scroll-mt-28">
        <div className="max-w-7xl mx-auto">
          <span className="text-xs uppercase tracking-widest font-bold text-primary">Custom inventory</span>
          <h2 id="builder-h" className="font-headline font-bold text-3xl sm:text-4xl text-primary mt-1">Build Your Own Order</h2>
          <p className="text-sm text-muted mt-2 max-w-2xl">Pick products, then enter the quantity you need for each colour and size. Pricing is provided in the quote our team sends back.</p>

          <div className="flex flex-wrap gap-3 mt-6 mb-6">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
              {[{ slug: '', name: 'All' }, ...wsCategories].map((c) => (
                <button key={c.slug} type="button" aria-pressed={category === c.slug} onClick={() => setCategory(c.slug)} className={`px-4 py-2 rounded-full text-xs font-bold cursor-pointer ${category === c.slug ? 'bg-primary text-white' : 'bg-white border border-border-subtle text-on-surface'}`}>{c.name}</button>
              ))}
            </div>
            <div className="ml-auto">
              <label htmlFor="ws-search" className="sr-only">Search products</label>
              <input id="ws-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" className={`${inputCls(false)} w-64`} />
            </div>
          </div>

          {productsLoading ? <LoadingBlock label="Loading products…" className="py-10" /> : productsError ? <ErrorBlock error={productsErr} onRetry={refetchProducts} className="py-10" /> : products.length === 0 ? <p className="text-sm text-muted">No products match your search.</p> : (
            <ul className="flex flex-col gap-4">
              {products.map((p) => {
                const open = openSlug === p.slug;
                return (
                  <li key={p.id} className="bg-white rounded-xl border border-border-subtle p-5">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-20 rounded bg-surface-container overflow-hidden shrink-0">{p.image?.url && <img src={p.image.url} alt="" width="64" height="80" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}</div>
                      <div className="flex-1">
                        <h3 className="font-headline font-bold text-primary">{p.name}</h3>
                        {p.category && <p className="text-xs text-muted">{p.category.name}</p>}
                      </div>
                      <button type="button" aria-expanded={open} onClick={() => setOpenSlug(open ? null : p.slug)} className="px-4 py-2 rounded-lg bg-surface-container text-primary text-xs font-bold cursor-pointer">{open ? 'Close' : 'Choose sizes'}</button>
                    </div>
                    {open && <SkuPicker slug={p.slug} staged={staged} setQty={setQty} />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="summary-h" className="w-full px-4 sm:px-8 lg:px-12 py-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-border-subtle p-6 h-fit">
            <h2 id="summary-h" className="font-headline font-bold text-lg text-primary mb-1">Your order request</h2>
            <p className="text-xs text-muted mb-4">{totalUnits} {totalUnits === 1 ? 'piece' : 'pieces'} selected</p>
            {lines.length === 0 ? <p className="text-sm text-muted">Nothing selected yet.</p> : (
              <ul className="divide-y divide-border-subtle text-sm">
                {lines.map((l) => (
                  <li key={l.skuId} className="py-2 flex justify-between gap-3">
                    <span>{l.productName}<span className="block text-xs text-muted">{l.color} · {l.size}</span></span>
                    <span className="flex items-center gap-2 font-semibold">{l.quantity}<button type="button" onClick={() => setQty({ ...l, quantity: 0 })} aria-label={`Remove ${l.productName} ${l.color} ${l.size}`} className="text-muted hover:text-error cursor-pointer"><span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span></button></span>
                  </li>
                ))}
              </ul>
            )}
            <FieldError message={errors.items} />
          </div>

          <form onSubmit={submitCustom} noValidate className="lg:col-span-3 bg-white rounded-2xl border border-border-subtle p-6 flex flex-col gap-4">
            <h2 className="font-headline font-bold text-lg text-primary">Request a quote</h2>
            {!isAuthenticated ? <SignInGate onSignIn={goSignIn} what="send a wholesale request" /> : (
              <>
                <ContactFields prefix="ws" value={contact} onChange={setContact} errors={errors} serverError={customMut.error} />
                <Field id="ws-proposal" label="Tell us about your business (optional)"><textarea id="ws-proposal" rows={3} maxLength={5000} value={proposal} onChange={(e) => setProposal(e.target.value)} className={inputCls(false)} /></Field>
                <Field id="ws-notes" label="Notes (optional)"><textarea id="ws-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls(false)} /></Field>
                {customMut.error && !Object.keys(customMut.error.fieldErrors || {}).length && <p role="alert" className="text-xs font-semibold text-error">{customMut.error.message}</p>}
                <button type="submit" disabled={customMut.isPending} className="self-start px-7 py-3 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60">{customMut.isPending ? 'Sending…' : 'Send wholesale request'}</button>
              </>
            )}
          </form>
        </div>
      </section>

      <section aria-labelledby="faq-h" className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface-card border-t border-border-subtle">
        <div className="max-w-3xl mx-auto">
          <h2 id="faq-h" className="font-headline font-bold text-3xl text-primary mb-6">How wholesale ordering works</h2>
          <dl className="flex flex-col gap-5 text-sm">
            <div><dt className="font-bold text-on-surface">Do I pay when I send a request?</dt><dd className="text-muted mt-1">No. A request is not an order. Our team reviews it and replies with a quote you can accept or decline.</dd></div>
            <div><dt className="font-bold text-on-surface">Can I mix sizes and colours?</dt><dd className="text-muted mt-1">Yes. Enter a quantity for every colour and size you need, across as many products as you like.</dd></div>
            <div><dt className="font-bold text-on-surface">Where can I follow my request?</dt><dd className="text-muted mt-1">Sign in and open <Link to="/account?tab=requests" className="underline text-primary">Requests &amp; Returns</Link> in your account.</dd></div>
          </dl>
        </div>
      </section>
    </div>
  );
}
