import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useBannersQuery, useWholesaleCatalogQuery, useWholesalePacksQuery, useWholesaleRequestMutations } from '../hooks/useQueries';
import Seo from '../seo/Seo';
import { breadcrumbSchema } from '../seo/schema';
import { ContactFields, Field, RequestSuccess, SignInGate, contactPayload, emptyContact, inputCls, validateContact } from '../components/B2BForm';
import ReadyPacks from '../components/wholesale/ReadyPacks';
import Builder from '../components/wholesale/Builder';
import WholesaleCart from '../components/wholesale/WholesaleCart';
import WholesaleHero from '../components/wholesale/WholesaleHero';
import ChooseOrder from '../components/wholesale/ChooseOrder';

export default function WholesalePage() {
  const { isAuthenticated, user, navigate, showToast } = useApp();
  const { data: packData, isLoading: packsLoading, isError: packsError, error: packsErr, refetch: refetchPacks } = useWholesalePacksQuery();
  const catalog = useWholesaleCatalogQuery(isAuthenticated);
  const { pack: packMut } = useWholesaleRequestMutations();
  const { data: banners } = useBannersQuery('wholesale_promo', 1);

  const [contact, setContact] = useState(() => emptyContact(user));
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [packTarget, setPackTarget] = useState(null);
  const [done, setDone] = useState(null);

  const packs = packData?.items || [];
  const catalogById = useMemo(() => new Map((catalog.data || []).map((p) => [String(p.id), p])), [catalog.data]);
  const minMoq = (catalog.data || []).map((p) => p.moq).filter(Boolean);

  const submitPack = (e) => {
    e.preventDefault();
    const errs = validateContact(contact, { requireBusiness: true });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    packMut.mutate(
      { packId: packTarget._id || packTarget.id, body: { customer: contactPayload(contact), ...(notes.trim() ? { customerNotes: notes.trim() } : {}) } },
      { onSuccess: (r) => { setDone({ kind: 'pack', numbers: [r?.requestNumber], name: packTarget.name }); setPackTarget(null); showToast('Pack request sent'); } },
    );
  };

  const metrics = [
    packs.length ? { label: 'Ready packs', value: packs.length } : null,
    isAuthenticated && catalog.data?.length ? { label: 'Wholesale products', value: catalog.data.length } : null,
    isAuthenticated && minMoq.length ? { label: 'Lowest MOQ', value: Math.min(...minMoq) } : null,
  ].filter(Boolean);

  return (
    <div className="w-full flex flex-col bg-surface">
      <Seo
        title="Wholesale Clothing Supply"
        description="Source wholesale apparel from PEHAN LY: request a ready-made pack or build your own bulk order and get a quote from our team."
        path="/wholesale"
        jsonLd={[breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Wholesale', path: '/wholesale' }])]}
      />

      <WholesaleHero banner={banners?.[0]} metrics={metrics} />
      <ChooseOrder packsAvailable={packs.length > 0} />

      {done && (
        <div className="max-w-3xl mx-auto w-full px-4 py-10">
          <RequestSuccess
            title={done.kind === 'pack' ? `Pack request sent${done.name ? `: ${done.name}` : ''}` : 'Wholesale quote request sent'}
            number={(done.numbers || []).join(', ')}
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
          <span className="text-[11px] uppercase tracking-widest font-bold text-[#6f7f10]">Path A · Rapid restocking</span>
          <h2 id="packs-h" className="font-headline font-extrabold text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] text-primary mt-1 mb-8">Ready Wholesale Packs</h2>
          <ReadyPacks
            packs={packs}
            loading={packsLoading}
            error={packsError ? packsErr : null}
            onRetry={refetchPacks}
            onRequest={(pk) => { setPackTarget(pk); setErrors({}); setTimeout(() => document.getElementById('pack-form')?.scrollIntoView({ behavior: 'smooth' }), 50); }}
          />

          {packTarget && (
            <form id="pack-form" onSubmit={submitPack} noValidate className="mt-8 bg-white border border-border-subtle rounded-2xl p-6 flex flex-col gap-4 scroll-mt-28">
              <h3 className="font-headline font-bold text-lg text-primary">Request: {packTarget.name}</h3>
              {!isAuthenticated ? <SignInGate onSignIn={() => navigate('account')} what="request a pack" /> : (
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
          <span className="text-[11px] uppercase tracking-widest font-bold text-[#6f7f10]">Path B · Custom inventory</span>
          <h2 id="builder-h" className="font-headline font-extrabold text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] text-primary mt-1">Build Your Own Order</h2>
          <p className="text-sm text-muted mt-2 mb-6 max-w-2xl">Choose a product and quantity, watch the volume price tier update, then spread the quantity across colours and sizes.</p>
          <Builder catalog={catalog} />
        </div>
      </section>

      <WholesaleCart
        catalogById={catalogById}
        onDone={(numbers) => { setDone({ kind: 'custom', numbers }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      />

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
