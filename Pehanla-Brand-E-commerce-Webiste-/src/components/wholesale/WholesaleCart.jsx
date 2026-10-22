import React, { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext';
import { useWholesaleRequestMutations } from '../../hooks/useQueries';
import { wholesaleApi } from '../../services/b2bApi';
import { useWholesaleCartStore } from '../../store/useWholesaleCartStore';
import { formatMoney } from '../../utils/currency';
import { allocationStatus, cartErrors, manualItems, packItems } from '../../utils/wholesaleCart';
import { ContactFields, Field, SignInGate, contactPayload, emptyContact, inputCls, validateContact } from '../B2BForm';
import { ErrorBlock } from '../StateViews';
import AllocationPanel from './AllocationPanel';

const money = (n) => formatMoney(n, 'PKR');

/** "Allocated: 15 Charcoal, 10 Forest" - display only, from the buyer's own allocation. */
function allocationSummary(line, product) {
  if (!product) return '';
  return product.variants
    .map((v) => ({ name: v.colorName, qty: v.sizes.reduce((n, sz) => n + (line.alloc[sz.id] || 0), 0) }))
    .filter((x) => x.qty > 0)
    .map((x) => `${x.qty} ${x.name}`)
    .join(', ');
}

export default function WholesaleCart({ catalogById, onDone }) {
  const { isAuthenticated, user, navigate, showToast } = useApp();
  const { lines, setOrdered, setAlloc, resetAlloc, confirm, remove, clear } = useWholesaleCartStore();
  const { pack: packMut, custom: customMut } = useWholesaleRequestMutations();
  const [contact, setContact] = useState(() => emptyContact(user));
  const [notes, setNotes] = useState('');
  const [proposal, setProposal] = useState('');
  const [mode, setMode] = useState(null); // 'checkout' | 'quote'
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);

  // Each backend request is priced on its own (the manual lines are ONE custom request; every pack is its
  // own pack request), so the preview matches exactly what will be submitted - tiers, pack prices and charges included.
  const groups = useMemo(() => {
    const manualLines = lines.filter((l) => l.type !== 'pack');
    const manual = manualItems(lines);
    const ordered = manualLines.filter((l) => l.ordered > 0).map((l) => ({ product: l.productId, ordered: l.ordered }));
    return [
      ...(manual.length ? [{ key: 'manual', items: manual, ordered }] : []),
      ...lines.filter((l) => l.type === 'pack').map((l) => ({ key: l.id, items: packItems(l), packId: l.packId })),
    ];
  }, [lines]);
  const results = useQueries({
    queries: groups.map((g) => ({
      queryKey: ['wholesale', 'preview', g.packId || 'manual', g.items, g.ordered || null],
      queryFn: () => wholesaleApi.preview(g.items, { packId: g.packId, ordered: g.ordered }),
      enabled: isAuthenticated && g.items.length > 0,
      placeholderData: (prev) => prev,
      retry: false,
    })),
  });
  const failed = results.find((r) => r.isError);
  const allLoaded = groups.length > 0 && results.every((r) => r.data);
  const fetching = results.some((r) => r.isFetching);
  const parts = results.map((r) => r.data).filter(Boolean);
  const discounts = parts.reduce((n, d) => n + d.items.reduce((m, i) => m + (i.baseWholesalePrice ? (i.baseWholesalePrice - i.wholesalePrice) * i.quantity : 0), 0), 0);
  const data = allLoaded ? {
    units: parts.reduce((n, d) => n + d.units, 0),
    moqMet: parts.every((d) => d.moqMet),
    quoteRequired: parts.some((d) => d.quoteRequired),
    allocationMatched: parts.every((d) => d.allocation?.matched !== false),
    mismatches: parts.flatMap((d) => d.allocation?.mismatches || []),
    products: parts.flatMap((d) => d.products),
    pricing: {
      subtotal: parts.reduce((n, d) => n + d.pricing.subtotal, 0),
      freight: parts.reduce((n, d) => n + (d.pricing.freight || 0), 0),
      tax: parts.reduce((n, d) => n + (d.pricing.tax || 0), 0),
      estimatedTotal: parts.reduce((n, d) => n + d.pricing.estimatedTotal, 0),
      pending: [...new Set(parts.flatMap((d) => d.pricing.pending || []))],
    },
  } : undefined;
  const refetchAll = () => results.forEach((r) => r.refetch());

  const productStatus = useMemo(() => new Map(parts.flatMap((d) => d.products).map((p) => [String(p.product), p])), [parts]);
  const mismatchByProduct = new Map((data?.mismatches || []).map((m) => [String(m.product), m]));

  const lineTotal = (line) => {
    const idx = groups.findIndex((g) => g.key === (line.type === 'pack' ? line.id : 'manual'));
    const part = results[idx]?.data;
    if (!part) return null;
    const bySku = new Map(part.items.map((i) => [String(i.sku), i]));
    const its = line.type === 'pack' ? packItems(line) : manualItems([line]);
    if (!its.length || its.some((i) => !bySku.has(String(i.sku)))) return null;
    return its.reduce((n, i) => n + bySku.get(String(i.sku)).lineTotal, 0);
  };

  const problems = cartErrors(lines);
  const moqProblems = (data?.products || []).filter((p) => !p.moqMet).map((p) => `${p.productName}: minimum order is ${p.moq} (add ${p.moqShortfall} more).`);
  const allocProblems = data && !data.allocationMatched ? ['PEHANLY could not verify your size & colour allocation. Please review it.'] : [];
  const blocked = lines.length === 0 || problems.length > 0 || moqProblems.length > 0 || allocProblems.length > 0 || Boolean(failed) || fetching || !data;
  const checkoutBlocked = blocked || Boolean(data?.quoteRequired);

  const open = (m) => { setMode(m); setSubmitError(''); setTimeout(() => document.getElementById('wholesale-request-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    const errs = validateContact(contact, { requireBusiness: true });
    if (mode === 'quote' && !proposal.trim()) errs.proposal = 'Tell us about your requirements so we can prepare a quote.';
    setErrors(errs);
    if (Object.keys(errs).length || (mode === 'checkout' ? checkoutBlocked : blocked)) return;
    setBusy(true);
    const refs = [];
    try {
      const manual = lines.filter((l) => l.type !== 'pack');
      if (manual.length) {
        const r = await customMut.mutateAsync({
          customer: contactPayload(contact),
          items: manualItems(manual),
          ordered: manual.map((l) => ({ product: l.productId, ordered: l.ordered })),
          ...(proposal.trim() ? { partnershipProposal: proposal.trim() } : {}),
          ...(notes.trim() ? { customerNotes: notes.trim() } : {}),
        });
        refs.push(r?.requestNumber);
        manual.forEach((l) => remove(l.id));
      }
      for (const l of lines.filter((x) => x.type === 'pack')) {
        const r = await packMut.mutateAsync({ packId: l.packId, body: { customer: contactPayload(contact), ...(notes.trim() ? { customerNotes: notes.trim() } : {}) } });
        refs.push(r?.requestNumber);
        remove(l.id);
      }
      showToast('Wholesale order request sent');
      setMode(null);
      onDone(refs.filter(Boolean));
    } catch (err) {
      setSubmitError(err?.message || 'We could not send your request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const pending = data?.pricing?.pending || [];

  return (
    <section id="wholesale-cart" aria-labelledby="wcart-h" className="w-full px-4 sm:px-8 lg:px-12 py-14 lg:py-16 scroll-mt-28">
      <div className="max-w-7xl mx-auto">
        <span className="text-[11px] uppercase tracking-widest font-bold text-[#6f7f10]">Step 2 &amp; 3</span>
        <h2 id="wcart-h" className="font-headline font-extrabold text-primary text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] mt-1 mb-8">Wholesale Order Summary</h2>

        {lines.length === 0 ? (
          <p className="text-sm text-muted bg-white border border-border-subtle rounded-2xl p-8" data-testid="wcart-empty">Your wholesale cart is empty. Add a ready pack or choose products above to build your order.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] gap-6 lg:gap-8 items-start">
            <ul className="flex flex-col gap-5 min-w-0">
              {lines.map((line) => {
                const total = lineTotal(line);
                const product = line.type === 'pack' ? null : catalogById.get(String(line.productId));
                const st = productStatus.get(String(line.productId));
                const s = allocationStatus(line.ordered, line.alloc);
                const summary = allocationSummary(line, product);
                return (
                  <li key={line.id} id={`wline-${line.id}`} className="bg-white rounded-2xl border border-border-subtle p-4 sm:p-5 scroll-mt-32" data-testid={`wline-${line.id}`}>
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-20 rounded bg-surface-container overflow-hidden shrink-0">
                        {line.image && <img src={line.image} alt="" width="64" height="80" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-headline font-bold text-primary truncate">{line.name}</h3>
                        <p className="text-xs text-muted">{line.type === 'pack' ? `Ready pack · ${line.items.reduce((n, i) => n + i.quantity, 0)} pieces` : `${line.ordered || 0} pcs`}</p>
                        {line.type !== 'pack' && <p className="text-xs text-on-surface mt-0.5" data-testid={`wline-alloc-${line.id}`}>{summary ? `Allocated: ${summary}` : <span className="text-muted">Not allocated yet</span>}</p>}
                        {st && <p className={`text-xs font-semibold mt-1 ${st.moqMet ? 'text-primary' : 'text-error'}`}>{st.moq ? (st.moqMet ? `MOQ ${st.moq} met` : `MOQ ${st.moq} — add ${st.moqShortfall} more`) : 'No minimum'}{st.tierDiscountPercent ? ` · ${st.tierDiscountPercent}% volume discount applied` : ''}{st.quoteRequired ? ' · Quote required at this volume' : ''}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-on-surface" data-testid={`wline-total-${line.id}`}>{total === null ? '—' : money(total)}</p>
                        <button type="button" onClick={() => remove(line.id)} aria-label={`Remove ${line.name}`} className="text-xs text-muted hover:text-error underline cursor-pointer mt-1">Remove</button>
                      </div>
                    </div>

                    {line.type === 'pack' ? (
                      <ul className="mt-4 pt-4 border-t border-border-subtle grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted">
                        {line.items.map((i) => <li key={i.sku} className="flex justify-between gap-3"><span className="truncate">{i.productName} · {i.colorName} · {i.size}</span><span className="font-semibold text-on-surface">×{i.quantity}</span></li>)}
                      </ul>
                    ) : (
                      <>
                        <div className="mt-4 flex items-end gap-3">
                          <Field id={`ord-${line.id}`} label="Quantity ordered">
                            <input id={`ord-${line.id}`} type="number" min="1" max="1000000" inputMode="numeric" value={line.ordered || ''} onChange={(e) => setOrdered(line.id, e.target.value)} className={`${inputCls(false)} w-36`} />
                          </Field>
                          <p className="text-xs text-muted pb-3">{s.allocated} allocated{s.ordered ? ` · ${Math.max(0, s.remaining)} remaining` : ''}</p>
                        </div>
                        {product ? <AllocationPanel line={line} product={product} onSet={setAlloc} onConfirm={confirm} onReset={resetAlloc} backendMismatch={mismatchByProduct.get(String(line.productId))} /> : <p className="text-xs text-error mt-3">This product is no longer available for wholesale. Please remove it.</p>}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>

            <aside aria-labelledby="wsum-h" className="bg-white rounded-2xl border border-border-subtle shadow-sm p-5 sm:p-6 lg:sticky lg:top-36 min-w-0" data-testid="wsummary">
              <h3 id="wsum-h" className="font-headline font-bold text-lg text-primary mb-4">Consolidated Invoice Estimate</h3>
              {failed && <ErrorBlock error={failed.error} onRetry={refetchAll} title="We could not price your cart" className="py-4" />}
              <dl className="text-sm flex flex-col gap-2">
                <div className="flex justify-between gap-3"><dt className="text-muted">Total units</dt><dd className="font-semibold" data-testid="wsum-units">{data?.units ?? '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Wholesale subtotal</dt><dd className="font-semibold" data-testid="wsum-subtotal">{data ? money(data.pricing.subtotal) : '—'}</dd></div>
                {data && discounts > 0 && <div className="flex justify-between gap-3"><dt className="text-muted">Volume discounts applied</dt><dd className="font-semibold text-primary" data-testid="wsum-discount">−{money(discounts)}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-muted">Freight estimate</dt><dd className="font-semibold text-right">{data ? (pending.includes('freight') ? 'Quoted by our team' : money(data.pricing.freight)) : '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Tax</dt><dd className="font-semibold text-right">{data ? (pending.includes('tax') ? 'Quoted by our team' : money(data.pricing.tax)) : '—'}</dd></div>
                <div className="flex justify-between gap-3 border-t border-border-subtle pt-3 mt-1"><dt className="font-bold">{pending.length ? 'Estimated total (before ' + pending.join(' & ') + ')' : 'Estimated total'}</dt><dd className="font-bold text-primary" data-testid="wsum-total">{data ? money(data.pricing.estimatedTotal) : '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">MOQ status</dt><dd className={`font-semibold ${data?.moqMet ? 'text-primary' : 'text-error'}`} data-testid="wsum-moq">{data ? (data.moqMet ? 'All minimums met' : 'Minimum not met') : '—'}</dd></div>
              </dl>
              <p className="text-[11px] text-muted mt-3">Prices, minimums, volume discounts, freight and tax are calculated by PEHANLY. No payment is taken here: our team confirms the order and issues your invoice.</p>

              {(problems.length > 0 || moqProblems.length > 0 || allocProblems.length > 0) && (
                <ul role="alert" className="mt-4 text-xs text-error font-semibold flex flex-col gap-1" data-testid="wsum-problems">
                  {[...problems, ...moqProblems, ...allocProblems].map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
              {data?.quoteRequired && <p className="mt-4 text-xs font-semibold text-[#6f7f10]" data-testid="wsum-quote-note">This volume needs a custom quote — use “Request custom / enterprise quote”.</p>}

              {!isAuthenticated ? <div className="mt-4"><SignInGate onSignIn={() => navigate('account')} what="request a wholesale quote" /></div> : (
                <div className="mt-5 flex flex-col gap-3">
                  <button type="button" disabled={checkoutBlocked || busy} onClick={() => open('checkout')} data-testid="wholesale-checkout" className="h-12 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-widest cursor-pointer hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed">Proceed to wholesale checkout</button>
                  <button type="button" disabled={blocked || busy} onClick={() => open('quote')} data-testid="wholesale-quote" className="h-12 rounded-lg border-2 border-primary text-primary text-xs font-bold uppercase tracking-widest cursor-pointer hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed">Request custom / enterprise quote</button>
                  <button type="button" onClick={clear} className="text-xs text-muted underline cursor-pointer self-start">Clear wholesale cart</button>
                </div>
              )}

              {isAuthenticated && mode && (
                <form id="wholesale-request-form" onSubmit={submit} noValidate className="mt-5 pt-5 border-t border-border-subtle flex flex-col gap-4 scroll-mt-32">
                  <h4 className="font-headline font-bold text-sm text-primary">{mode === 'checkout' ? 'Confirm your business details' : 'Tell us what you need'}</h4>
                  <ContactFields prefix="wc" value={contact} onChange={setContact} errors={errors} serverError={customMut.error || packMut.error} />
                  <Field id="wc-proposal" label={mode === 'quote' ? 'Your requirements / business needs' : 'Tell us about your business (optional)'} error={errors.proposal}><textarea id="wc-proposal" rows={3} maxLength={5000} value={proposal} onChange={(e) => setProposal(e.target.value)} className={inputCls(Boolean(errors.proposal))} /></Field>
                  <Field id="wc-notes" label="Notes (optional)"><textarea id="wc-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls(false)} /></Field>
                  {submitError && <p role="alert" className="text-xs font-semibold text-error">{submitError}</p>}
                  <div className="flex gap-3">
                    <button type="submit" disabled={busy || (mode === 'checkout' ? checkoutBlocked : blocked)} data-testid="wholesale-submit" className="flex-1 h-12 rounded-lg bg-primary text-white text-xs font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">{busy ? 'Sending…' : mode === 'checkout' ? 'Place wholesale order request' : 'Send quote request'}</button>
                    <button type="button" onClick={() => setMode(null)} className="px-4 text-xs font-bold cursor-pointer">Cancel</button>
                  </div>
                </form>
              )}
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
