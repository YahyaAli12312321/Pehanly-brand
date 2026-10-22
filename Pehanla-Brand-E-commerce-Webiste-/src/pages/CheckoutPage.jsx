import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAppStore } from '../store/useAppStore';
import { useCartPricing } from '../hooks/useCartPricing';
import {
  useAddressesQuery,
  useCheckoutOptionsQuery,
  useCreateOrderMutation,
  useFreeShippingInfoQuery,
  usePublicSettingsQuery,
  useValidateCouponMutation,
} from '../hooks/useQueries';
import Seo from '../seo/Seo';
import { FieldError } from '../components/StateViews';
import { isValidEmail, isValidPhone } from '../utils/format';
import { formatMoney, linePrice, orderCurrency } from '../utils/currency';
import { useCurrency } from '../store/useCurrencyStore';
import { usePaymentAvailability } from '../hooks/usePaymentAvailability';

const PROVINCES = ['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Islamabad Capital Territory', 'Gilgit-Baltistan', 'Azad Kashmir'];

const inputCls = (bad) =>
  `w-full px-4 py-3 rounded-lg bg-surface border text-sm focus:outline-none focus:border-primary ${bad ? 'border-error' : 'border-border-subtle'}`;

/** Look up a server field error by its last path segment (e.g. "shippingAddress.city" -> "city"). */
function serverError(err, key) {
  const fe = err?.fieldErrors || {};
  const hit = Object.keys(fe).find((k) => k === key || k.endsWith(`.${key}`));
  return hit ? fe[hit] : '';
}

function Field({ id, label, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-on-surface mb-1.5">{label}</label>
      {children}
      <FieldError id={`${id}-err`} message={error} />
    </div>
  );
}

function Confirmation({ order }) {
  const { isAuthenticated, navigate } = useApp();
  const { data: settings } = usePublicSettingsQuery();
  const wallet = settings?.checkout?.jazzcashManual;
  const manual = order.paymentMethod === 'jazzcash_manual';
  const [copied, setCopied] = useState(false);
  const pricing = order.pricing || {};
  // The order carries its own currency snapshot; never re-derive it from the current selector.
  const cur = orderCurrency(order);
  const money = (n) => formatMoney(n, cur);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.orderNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-14 w-full">
      <Seo title="Order confirmed" noindex />
      <div className="bg-surface-card rounded-2xl border border-border-subtle p-8 sm:p-12 text-center flex flex-col items-center gap-4">
        <span className="material-symbols-outlined text-5xl text-primary" aria-hidden="true">check_circle</span>
        <h1 className="font-headline text-3xl font-extrabold text-primary">Thank you, your order is placed</h1>
        <p className="text-sm text-muted max-w-md">
          {manual
            ? 'We have received your order. It is confirmed once we verify your JazzCash wallet payment.'
            : 'We have received your order and will confirm it shortly. Payment is collected in cash on delivery.'}
        </p>
        {manual && (
          <div role="status" className="w-full text-left rounded-xl border border-border-subtle bg-surface-container-low p-4 text-sm">
            <p className="font-headline font-bold text-primary">Pay by JazzCash wallet (manual payment)</p>
            <p className="text-muted mt-1">Send <strong className="text-primary">{money(pricing.total)}</strong> to:</p>
            {wallet?.enabled ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted">Wallet number</dt><dd className="font-bold text-primary">{wallet.walletNumber}</dd>
                {wallet.accountTitle && <><dt className="text-muted">Account title</dt><dd className="font-semibold text-primary">{wallet.accountTitle}</dd></>}
                <dt className="text-muted">Reference</dt><dd className="font-semibold text-primary">{order.orderNumber}</dd>
              </dl>
            ) : (
              <p className="text-xs text-muted mt-2">Our team will contact you with the wallet details for this order.</p>
            )}
            {wallet?.instructions && <p className="text-xs text-muted mt-2">{wallet.instructions}</p>}
            <p className="text-[11px] text-muted mt-2">Payment status: <strong>pending verification</strong>. This is a manual wallet transfer, not the JazzCash online gateway.</p>
          </div>
        )}
        <div className="flex items-center gap-3 bg-surface-container-low px-5 py-3 rounded-xl">
          <span className="text-xs text-muted">Order number</span>
          <strong className="font-headline text-lg text-primary">{order.orderNumber}</strong>
          <button type="button" onClick={copy} className="text-xs font-bold text-primary underline cursor-pointer">{copied ? 'Copied' : 'Copy'}</button>
        </div>

        {Array.isArray(order.items) && order.items.length > 0 && (
          <ul className="w-full text-left divide-y divide-border-subtle border border-border-subtle rounded-xl mt-2">
            {order.items.map((it, i) => (
              <li key={i} className="p-4 flex justify-between gap-4 text-sm">
                <span className="text-on-surface">{it.productName} <span className="text-muted">· {it.colorName} · {it.size} × {it.quantity}</span></span>
                <span className="font-semibold text-primary">{money(it.lineTotal)}</span>
              </li>
            ))}
          </ul>
        )}
        {pricing.total != null && (
          <dl className="w-full text-sm text-muted flex flex-col gap-2">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(pricing.subtotal)}</dd></div>
            {pricing.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>-{money(pricing.discount)}</dd></div>}
            <div className="flex justify-between"><dt>Shipping</dt><dd>{pricing.shipping === 0 ? 'Free' : money(pricing.shipping)}</dd></div>
            <div className="flex justify-between font-headline text-lg font-extrabold text-primary pt-2 border-t border-border-subtle"><dt>Total</dt><dd>{money(pricing.total)}</dd></div>
          </dl>
        )}

        <div className="flex flex-wrap gap-3 justify-center mt-4">
          {isAuthenticated ? (
            <button type="button" onClick={() => navigate('account')} className="px-6 py-3 rounded-xl bg-primary text-white text-sm font-semibold cursor-pointer">View my orders</button>
          ) : (
            <Link to="/track-order" className="px-6 py-3 rounded-xl bg-primary text-white text-sm font-semibold">Track this order</Link>
          )}
          <Link to="/shop" className="px-6 py-3 rounded-xl border border-border-subtle text-primary text-sm font-semibold">Continue shopping</Link>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const { cartItems, clearCart, user, isAuthenticated, navigate, showToast } = useApp();
  const couponCode = useAppStore((s) => s.couponCode);
  const setCouponCode = useAppStore((s) => s.setCouponCode);
  const { currency, setCurrency } = useCurrency();
  const { lines, purchasable, subtotal, isLoading, hasProblems } = useCartPricing(currency);
  const payment = usePaymentAvailability(currency);
  const money = (n) => formatMoney(n, currency);
  const { data: freeShipping } = useFreeShippingInfoQuery(currency);
  const { data: addresses } = useAddressesQuery();
  const createOrder = useCreateOrderMutation();
  const validateCoupon = useValidateCouponMutation();

  const [form, setForm] = useState({ name: '', email: '', phone: '', addressLine1: '', city: '', province: '', postalCode: '', country: 'Pakistan', notes: '' });
  const [paymentChoice, setPaymentChoice] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [errors, setErrors] = useState({});
  const [serverErr, setServerErr] = useState(null);
  const [coupon, setCoupon] = useState(null);

  const placed = location.state?.order;

  // Prefill from the signed-in profile and default saved address.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const def = addresses?.find((a) => a.isDefault) || addresses?.[0];
    setForm((f) => ({
      ...f,
      name: f.name || def?.fullName || user.name || '',
      email: f.email || user.email || '',
      phone: f.phone || def?.phone || user.phone || '',
      addressLine1: f.addressLine1 || def?.addressLine1 || '',
      city: f.city || def?.city || '',
      province: f.province || def?.province || '',
      postalCode: f.postalCode || def?.postalCode || '',
    }));
  }, [isAuthenticated, user, addresses]);

  // Price the coupon (registered customers only; backend is authoritative).
  const { mutate: priceCoupon } = validateCoupon;
  useEffect(() => {
    if (!isAuthenticated || !couponCode || !subtotal) { setCoupon(null); return; }
    priceCoupon({ code: couponCode, subtotal, ...(currency !== 'PKR' ? { currency } : {}) }, {
      onSuccess: setCoupon,
      onError: (err) => { setCoupon(null); setCouponCode(''); showToast(err.message); },
    });
  }, [couponCode, subtotal, currency, isAuthenticated, priceCoupon, setCouponCode, showToast]);

  const discount = coupon?.discountAmount || 0;
  // One backend call answers: deliverable? what does delivery cost (ShippingRule)? which payment methods apply here?
  const optionsQuery = useCheckoutOptionsQuery(
    { subtotal: Math.max(0, Math.round((subtotal - discount) * 100) / 100), city: form.city, province: form.province, country: form.country, currency },
    { enabled: form.city.trim().length >= 2 && subtotal > 0 },
  );
  const opts = form.city.trim().length >= 2 ? optionsQuery.data : undefined;
  const shipping = opts?.shipping?.amount;
  const availableMethods = opts?.payment?.methods || [];
  const method = availableMethods.includes(paymentChoice) ? paymentChoice : availableMethods[0] || '';
  const walletInfo = opts?.payment?.jazzcashManual;
  const total = Math.round((Math.max(0, subtotal - discount) + (shipping || 0)) * 100) / 100;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Enter your full name.';
    if (!isValidEmail(form.email)) e.email = 'Enter a valid email address.';
    if (!isValidPhone(form.phone)) e.phone = 'Enter a valid phone number.';
    if (form.addressLine1.trim().length < 5) e.addressLine1 = 'Enter your full street address.';
    if (form.city.trim().length < 2) e.city = 'Enter your city.';
    if (method === 'jazzcash_manual' && paymentRef.trim() && !/^[A-Za-z0-9._\-/ ]{4,64}$/.test(paymentRef.trim())) e.paymentRef = 'Use 4-64 letters, numbers or - . /';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setServerErr(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(Object.keys(e)[0] === 'name' ? 'co-name' : `co-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    if (!canPlace) { setErrors({ city: 'Enter your delivery city so we can show the available payment options.' }); document.getElementById('co-city')?.focus(); return; }
    const body = {
      items: purchasable.map((l) => ({ sku: l.id, quantity: Math.min(l.qty, l.maxQuantity ?? l.qty) })),
      customer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() },
      shippingAddress: {
        fullName: form.name.trim(),
        phone: form.phone.trim(),
        addressLine1: form.addressLine1.trim(),
        city: form.city.trim(),
        ...(form.province ? { province: form.province } : {}),
        ...(form.postalCode.trim() ? { postalCode: form.postalCode.trim() } : {}),
        country: form.country,
      },
      paymentMethod: method,
      ...(method === 'jazzcash_manual' && paymentRef.trim() ? { paymentReference: paymentRef.trim() } : {}),
      // PKR omits the field (original contract). USD is sent explicitly so the backend can answer authoritatively.
      ...(currency !== 'PKR' ? { currency } : {}),
      ...(isAuthenticated && couponCode ? { couponCode } : {}),
      ...(form.notes.trim() ? { customerNotes: form.notes.trim() } : {}),
    };
    try {
      const order = await createOrder.mutateAsync(body);
      clearCart();
      routerNavigate('/order-confirmation', { replace: true, state: { order } });
    } catch (err) {
      setServerErr(err);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (location.pathname === '/order-confirmation') {
    return placed ? <Confirmation order={placed} /> : <Navigate to="/track-order" replace />;
  }

  if (cartItems.length === 0) {
    return (
      <div className="max-w-lg mx-auto text-center px-6 py-28">
        <Seo title="Checkout" noindex />
        <h1 className="font-headline text-2xl font-bold text-primary">Your bag is empty</h1>
        <p className="text-sm text-muted mt-2">Add something to your bag to check out.</p>
        <Link to="/shop" className="inline-block mt-6 px-8 py-3 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded">Browse the shop</Link>
      </div>
    );
  }

  const blocked = isLoading || hasProblems || purchasable.length === 0;
  const cityReady = form.city.trim().length >= 2;
  const canPlace = Boolean(method) && opts?.deliverable === true && !opts?.shippingIssue && !optionsQuery.isFetching;
  const remaining = freeShipping?.available ? Math.max(0, freeShipping.minimumOrderAmount - subtotal) : null;

  return (
    <div className="w-full flex flex-col">
      <Seo title="Checkout" noindex />
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 w-full">
        <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-primary mb-2">Checkout</h1>
        {!isAuthenticated && (
          <p className="text-xs text-muted mb-6">
            Checking out as a guest.{' '}
            <button type="button" onClick={() => navigate('account')} className="text-primary font-bold underline cursor-pointer">Sign in</button> for member offers and order history.
          </p>
        )}

        {serverErr && (
          <div role="alert" className="mb-6 p-4 rounded-xl bg-error/10 text-error text-sm font-semibold">
            {serverErr.message}
            {serverErr.code === 'COUPON_AUTH_REQUIRED' && ' Please sign in to use a coupon.'}
          </div>
        )}

        <form onSubmit={submit} noValidate className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 flex flex-col gap-6">
            <section aria-labelledby="co-contact" className="bg-surface-card rounded-xl border border-border-subtle p-6 flex flex-col gap-4">
              <h2 id="co-contact" className="font-headline text-base font-bold text-primary">Contact &amp; delivery</h2>
              <Field id="co-name" label="Full name" error={errors.name || serverError(serverErr, 'name')}>
                <input id="co-name" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={Boolean(errors.name)} aria-describedby="co-name-err" className={inputCls(errors.name)} />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field id="co-email" label="Email" error={errors.email || serverError(serverErr, 'email')}>
                  <input id="co-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} aria-invalid={Boolean(errors.email)} aria-describedby="co-email-err" className={inputCls(errors.email)} />
                </Field>
                <Field id="co-phone" label="Phone" error={errors.phone || serverError(serverErr, 'phone')}>
                  <input id="co-phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} aria-invalid={Boolean(errors.phone)} aria-describedby="co-phone-err" className={inputCls(errors.phone)} />
                </Field>
              </div>
              <Field id="co-addressLine1" label="Street address" error={errors.addressLine1 || serverError(serverErr, 'addressLine1')}>
                <input id="co-addressLine1" autoComplete="address-line1" value={form.addressLine1} onChange={set('addressLine1')} aria-invalid={Boolean(errors.addressLine1)} aria-describedby="co-addressLine1-err" className={inputCls(errors.addressLine1)} />
              </Field>
              <Field id="co-country" label="Country">
                <select id="co-country" value={form.country} onChange={set('country')} className={inputCls(false)}>
                  <option value="Pakistan">Pakistan</option>
                  <option value="Other">Other country (not supported yet)</option>
                </select>
              </Field>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field id="co-city" label="City" error={errors.city || serverError(serverErr, 'city')}>
                  <input id="co-city" autoComplete="address-level2" value={form.city} onChange={set('city')} aria-invalid={Boolean(errors.city)} aria-describedby="co-city-err" className={inputCls(errors.city)} />
                </Field>
                <Field id="co-province" label="Province">
                  <select id="co-province" value={form.province} onChange={set('province')} className={inputCls(false)}>
                    <option value="">Select…</option>
                    {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field id="co-postalCode" label="Postal code (optional)">
                  <input id="co-postalCode" autoComplete="postal-code" value={form.postalCode} onChange={set('postalCode')} className={inputCls(false)} />
                </Field>
              </div>
              <Field id="co-notes" label="Delivery notes (optional)">
                <textarea id="co-notes" rows={3} maxLength={2000} value={form.notes} onChange={set('notes')} className={inputCls(false)} />
              </Field>
            </section>

            <section aria-labelledby="co-pay" className="bg-surface-card rounded-xl border border-border-subtle p-6 flex flex-col gap-3">
              <h2 id="co-pay" className="font-headline text-base font-bold text-primary">Payment</h2>
              {currency !== 'PKR' && !payment.available && !payment.isLoading ? (
                <div role="status" className="p-4 rounded-lg border border-border-subtle bg-surface-container-low text-sm text-primary leading-relaxed">
                  <p className="font-bold">Payment not available in {currency}</p>
                  <p className="text-xs text-muted mt-1">{payment.reason}</p>
                  <button type="button" onClick={() => setCurrency('PKR')} className="mt-3 text-xs font-bold underline cursor-pointer">Switch to PKR to check out</button>
                </div>
              ) : !cityReady ? (
                <p className="text-sm text-muted">Enter your delivery city to see the payment options for your address.</p>
              ) : !opts ? (
                optionsQuery.isError
                  ? <p role="alert" className="text-sm text-error">{optionsQuery.error?.message || 'Could not load payment options.'} <button type="button" onClick={() => optionsQuery.refetch()} className="underline font-bold cursor-pointer">Retry</button></p>
                  : <p className="text-sm text-muted" role="status">Checking delivery and payment options…</p>
              ) : !opts.deliverable ? (
                <p role="alert" className="text-sm text-error font-semibold">{opts.deliveryMessage || 'We currently deliver within Pakistan only.'}</p>
              ) : (
                <>
                  <p className="text-xs text-primary font-semibold" role="status"><span className="material-symbols-outlined text-[14px] align-middle mr-1" aria-hidden="true">local_shipping</span>We deliver to {form.city.trim()}.</p>
                  <div role="radiogroup" aria-label="Payment method" className="flex flex-col gap-3">
                    {opts.payment.cod.available ? (
                      <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer ${method === 'cod' ? 'border-primary bg-accent-subtle/40' : 'border-border-subtle'}`}>
                        <input type="radio" name="payment" value="cod" checked={method === 'cod'} onChange={() => setPaymentChoice('cod')} className="mt-1 accent-[#173B32]" />
                        <span><strong className="text-sm text-primary">Cash on Delivery</strong><span className="block text-xs text-muted">Pay in cash when your order arrives.</span></span>
                      </label>
                    ) : (
                      <div aria-disabled="true" className="flex items-start gap-3 p-4 rounded-lg border border-border-subtle bg-surface-container-low opacity-70">
                        <input type="radio" disabled className="mt-1" aria-label="Cash on Delivery (unavailable)" />
                        <span><strong className="text-sm text-primary">Cash on Delivery</strong><span className="block text-xs text-muted">{opts.payment.cod.reason || 'Cash on Delivery is currently available in Karachi only.'}</span></span>
                      </div>
                    )}
                    {opts.payment.jazzcashManual.available ? (
                      <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer ${method === 'jazzcash_manual' ? 'border-primary bg-accent-subtle/40' : 'border-border-subtle'}`}>
                        <input type="radio" name="payment" value="jazzcash_manual" checked={method === 'jazzcash_manual'} onChange={() => setPaymentChoice('jazzcash_manual')} className="mt-1 accent-[#173B32]" />
                        <span>
                          <strong className="text-sm text-primary">JazzCash Wallet / Manual Payment</strong>
                          <span className="block text-xs text-muted">Send the total to our JazzCash wallet; your order is confirmed after we verify the payment.</span>
                        </span>
                      </label>
                    ) : (
                      <div aria-disabled="true" className="flex items-start gap-3 p-4 rounded-lg border border-border-subtle bg-surface-container-low opacity-70">
                        <input type="radio" disabled className="mt-1" aria-label="JazzCash Wallet (unavailable)" />
                        <span><strong className="text-sm text-primary">JazzCash Wallet / Manual Payment</strong><span className="block text-xs text-muted">{opts.payment.jazzcashManual.reason}</span></span>
                      </div>
                    )}
                  </div>
                  {method === 'jazzcash_manual' && walletInfo?.available && (
                    <div className="rounded-lg border border-border-subtle bg-surface-container-low p-4 text-xs flex flex-col gap-2">
                      <p className="font-bold text-primary">How to pay</p>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                        <dt className="text-muted">JazzCash wallet</dt><dd className="font-bold text-primary">{walletInfo.walletNumber}</dd>
                        {walletInfo.accountTitle && <><dt className="text-muted">Account title</dt><dd className="font-semibold text-primary">{walletInfo.accountTitle}</dd></>}
                        <dt className="text-muted">Amount</dt><dd className="font-semibold text-primary">{money(total)}</dd>
                      </dl>
                      {walletInfo.instructions && <p className="text-muted">{walletInfo.instructions}</p>}
                      <Field id="co-paymentRef" label="JazzCash transaction ID (optional)" error={errors.paymentRef || serverError(serverErr, 'paymentReference')}>
                        <input id="co-paymentRef" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="If you have already paid" className={inputCls(errors.paymentRef)} />
                      </Field>
                      <p className="text-[11px] text-muted">This is a manual wallet payment, not the JazzCash online gateway. Your order stays pending until we verify it.</p>
                    </div>
                  )}
                  {opts.shippingIssue && <p role="alert" className="text-sm text-error font-semibold">{opts.shippingIssue.message}</p>}
                  {!method && !opts.shippingIssue && <p role="alert" className="text-sm text-error font-semibold">No payment method is available for this address right now. Please contact support.</p>}
                </>
              )}
            </section>
          </div>

          <aside aria-label="Order summary" className="lg:col-span-5 bg-surface-card rounded-xl border border-border-subtle p-6 flex flex-col gap-5 lg:sticky lg:top-32">
            <h2 className="font-headline text-base font-bold text-primary border-b border-border-subtle pb-3">Order summary</h2>
            <ul className="flex flex-col gap-4 max-h-80 overflow-y-auto">
              {lines.map((l) => (
                <li key={l.id} className="flex gap-3 items-center">
                  <div className="w-14 h-16 rounded bg-surface-container overflow-hidden shrink-0">
                    {l.image && <img src={l.image} alt="" width="56" height="64" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 text-xs">
                    <p className="font-headline font-bold text-primary text-sm line-clamp-1">{l.name}</p>
                    <p className="text-muted">{l.color} · {l.size} × {l.qty}</p>
                    {(l.status === 'out_of_stock' || l.status === 'unavailable') && <p className="text-error font-semibold">Unavailable - remove from bag</p>}
                    {l.status === 'no_currency' && <p className="text-error font-semibold">Not sold in {currency} - remove or switch currency</p>}
                  </div>
                  <span className="text-xs font-semibold text-primary">{l.status === 'no_currency' ? '—' : money(Math.round(linePrice(l, currency) * l.qty * 100) / 100)}</span>
                </li>
              ))}
            </ul>

            <dl className="flex flex-col gap-2 text-xs text-muted border-t border-border-subtle pt-4">
              <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-semibold text-primary">{money(subtotal)}</dd></div>
              {discount > 0 && <div className="flex justify-between"><dt>Coupon ({coupon.code})</dt><dd className="font-semibold text-primary">-{money(discount)}</dd></div>}
              <div className="flex justify-between">
                <dt>Shipping</dt>
                <dd className="font-semibold text-primary">
                  {!cityReady ? 'Enter your city' : optionsQuery.isFetching && !opts ? '…' : shipping == null ? (opts?.shippingIssue ? 'Not configured' : 'Calculated on order') : shipping === 0 ? 'Free' : money(shipping)}
                </dd>
              </div>
              {remaining > 0 && <p className="text-[11px] text-primary bg-accent-subtle rounded p-2">Add {money(remaining)} more to unlock free shipping.</p>}
            </dl>

            {isAuthenticated ? (
              couponCode && !coupon ? null : coupon ? (
                <p className="text-[11px] text-muted">Coupon applied. <button type="button" onClick={() => setCouponCode('')} className="underline font-bold text-primary cursor-pointer">Remove</button></p>
              ) : (
                <p className="text-[11px] text-muted">Have a coupon? Apply it in your <Link to="/cart" className="underline font-bold text-primary">bag</Link>.</p>
              )
            ) : (
              <p className="text-[11px] text-muted">Coupons are for signed-in customers. <button type="button" onClick={() => navigate('account')} className="underline font-bold text-primary cursor-pointer">Sign in</button></p>
            )}

            <div className="flex justify-between items-baseline border-t border-border-subtle pt-4">
              <span className="font-headline text-base font-bold text-primary">Total</span>
              <span className="font-headline text-2xl font-extrabold text-primary">{money(total)}</span>
            </div>
            <p className="text-[11px] text-muted -mt-3">Final amount is confirmed by our server when you place the order.</p>

            <button type="submit" disabled={createOrder.isPending || blocked || (cityReady && !canPlace)} className="w-full py-3.5 bg-accent hover:bg-accent-light text-primary font-bold text-xs uppercase tracking-widest rounded shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {createOrder.isPending ? 'Placing order…' : 'Place order'}
            </button>
            <Link to="/cart" className="text-center text-xs text-muted underline">Back to bag</Link>
          </aside>
        </form>
      </div>
    </div>
  );
}
