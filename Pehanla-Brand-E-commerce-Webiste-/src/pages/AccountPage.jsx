import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  useAddressMutations,
  useAddressesQuery,
  useCancellationMutation,
  useChangePasswordMutation,
  useForgotPasswordMutation,
  useLoginMutation,
  useLogoutMutation,
  useLogoutOthersMutation,
  useMyOrderQuery,
  useMyOrdersQuery,
  useMyRequestsQuery,
  useQuoteActions,
  useQuotesQuery,
  useRegisterMutation,
  useResetPasswordMutation,
  useReturnRequestMutation,
  useReturnsQuery,
  useUpdateProfileMutation,
} from '../hooks/useQueries';
import Seo from '../seo/Seo';
import { ErrorBlock, FieldError, LoadingBlock } from '../components/StateViews';
import { formatMoney, orderCurrency } from '../utils/currency';
import { formatDate, formatPKR, isValidEmail, isValidPhone, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../utils/format';

const inputCls = 'w-full px-3.5 py-2.5 rounded-lg bg-surface border border-border-subtle text-sm focus:outline-none focus:border-primary';

function TextField({ id, label, error, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-primary mb-1">{label}</label>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={`${id}-err`} className={inputCls} {...props} />
      <FieldError id={`${id}-err`} message={error} />
    </div>
  );
}

const fe = (err, key) => {
  const f = err?.fieldErrors || {};
  const hit = Object.keys(f).find((k) => k === key || k.endsWith(`.${key}`));
  return hit ? f[hit] : '';
};

/* ----------------------------- signed-out portal ----------------------------- */

function AuthPortal({ view, token, setView }) {
  const { showToast } = useApp();
  const login = useLoginMutation();
  const register = useRegisterMutation();
  const forgot = useForgotPasswordMutation();
  const reset = useResetPasswordMutation();
  const [f, setF] = useState({ identifier: '', password: '', name: '', email: '', phone: '', password2: '' });
  const [local, setLocal] = useState({});
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const titles = {
    login: ['Sign In to Your Account', 'Access orders, addresses and member offers.'],
    register: ['Create Your Account', 'Register to track orders and unlock member coupons.'],
    forgot: ['Reset Your Password', 'We will send a reset link to your account.'],
    reset: ['Choose a New Password', 'Enter a new password for your account.'],
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (view === 'login') {
      if (f.identifier.trim().length < 3) errs.identifier = 'Enter your email or phone.';
      if (!f.password) errs.password = 'Enter your password.';
      setLocal(errs);
      if (Object.keys(errs).length) return;
      login.mutate({ identifier: f.identifier.trim(), password: f.password }, { onSuccess: () => showToast('Welcome back!') });
    } else if (view === 'register') {
      if (f.name.trim().length < 2) errs.name = 'Enter your full name.';
      if (!isValidEmail(f.email)) errs.email = 'Enter a valid email.';
      if (!isValidPhone(f.phone)) errs.phone = 'Enter a valid phone number.';
      if (f.password.length < 8) errs.password = 'Use at least 8 characters.';
      setLocal(errs);
      if (Object.keys(errs).length) return;
      register.mutate({ name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), password: f.password, role: 'customer' }, { onSuccess: () => showToast('Account created. Welcome!') });
    } else if (view === 'forgot') {
      if (f.identifier.trim().length < 3) { setLocal({ identifier: 'Enter your email or phone.' }); return; }
      setLocal({});
      forgot.mutate({ identifier: f.identifier.trim() });
    } else if (view === 'reset') {
      if (f.password.length < 8) errs.password = 'Use at least 8 characters.';
      if (f.password !== f.password2) errs.password2 = 'Passwords do not match.';
      setLocal(errs);
      if (Object.keys(errs).length) return;
      reset.mutate({ token, password: f.password }, { onSuccess: () => { showToast('Password updated. Please sign in.'); setView('login'); } });
    }
  };

  const mut = { login, register, forgot, reset }[view];
  const err = mut.error;

  return (
    <div className="w-full flex flex-col bg-surface py-12 px-4 sm:px-8">
      <Seo title={titles[view][0]} noindex />
      <div className="max-w-[460px] mx-auto w-full bg-white rounded-2xl shadow-xl p-8 border border-border-subtle">
        <div className="text-center mb-6">
          <span className="font-headline text-[10px] uppercase tracking-widest text-primary font-bold bg-accent-subtle px-3 py-1 rounded-full">PEHANLY Account</span>
          <h1 className="font-headline text-2xl font-bold text-primary mt-2">{titles[view][0]}</h1>
          <p className="text-xs text-muted mt-1">{titles[view][1]}</p>
        </div>

        {forgot.isSuccess && view === 'forgot' ? (
          <p role="status" className="text-sm text-primary bg-accent-subtle rounded-lg p-4">If an account exists for that email or phone, a reset link has been sent.</p>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            {view === 'register' && <TextField id="au-name" label="Full name" autoComplete="name" value={f.name} onChange={set('name')} error={local.name || fe(err, 'name')} />}
            {view === 'register' && (
              <div className="grid sm:grid-cols-2 gap-4">
                <TextField id="au-email" type="email" label="Email" autoComplete="email" value={f.email} onChange={set('email')} error={local.email || fe(err, 'email')} />
                <TextField id="au-phone" type="tel" label="Phone" autoComplete="tel" value={f.phone} onChange={set('phone')} error={local.phone || fe(err, 'phone')} />
              </div>
            )}
            {(view === 'login' || view === 'forgot') && <TextField id="au-id" label="Email or phone" autoComplete="username" value={f.identifier} onChange={set('identifier')} error={local.identifier || fe(err, 'identifier')} />}
            {view !== 'forgot' && (
              <TextField id="au-pass" type="password" label={view === 'reset' ? 'New password' : 'Password'} autoComplete={view === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} error={local.password || fe(err, 'password')} />
            )}
            {view === 'reset' && <TextField id="au-pass2" type="password" label="Confirm new password" autoComplete="new-password" value={f.password2} onChange={set('password2')} error={local.password2} />}
            {err && !Object.keys(err.fieldErrors || {}).length && <p role="alert" className="text-xs font-semibold text-error">{err.message}</p>}
            <button type="submit" disabled={mut.isPending} className="w-full py-3 bg-primary hover:bg-primary-light text-white font-headline text-xs font-bold uppercase rounded-lg shadow-sm transition cursor-pointer disabled:opacity-60">
              {mut.isPending ? 'Please wait…' : { login: 'Sign In', register: 'Create Account', forgot: 'Send reset link', reset: 'Update password' }[view]}
            </button>
          </form>
        )}

        <div className="mt-5 text-center text-xs text-muted flex flex-col gap-2">
          {view === 'login' && (<>
            <button type="button" onClick={() => setView('forgot')} className="underline cursor-pointer">Forgot password?</button>
            <span>New here? <button type="button" onClick={() => setView('register')} className="font-bold text-primary underline cursor-pointer">Create an account</button></span>
          </>)}
          {view !== 'login' && <button type="button" onClick={() => setView('login')} className="font-bold text-primary underline cursor-pointer">Back to sign in</button>}
          <Link to="/track-order" className="underline">Track a guest order</Link>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- signed-in sections ----------------------------- */

function StatusPill({ status }) {
  return <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-accent-subtle text-primary">{ORDER_STATUS_LABELS[status] || status}</span>;
}

function ReturnForm({ order, onDone }) {
  const { showToast } = useApp();
  const mut = useReturnRequestMutation();
  const [qty, setQty] = useState({});
  const [reason, setReason] = useState('');
  const [local, setLocal] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const items = (order.items || []).map((it) => ({ orderItem: it._id || it.id, quantity: Number(qty[it._id || it.id] || 0) })).filter((i) => i.orderItem && i.quantity > 0);
    if (!items.length) return setLocal('Choose at least one item to return.');
    if (reason.trim().length < 3) return setLocal('Tell us why you are returning the item(s).');
    setLocal('');
    mut.mutate({ orderId: order._id || order.id, body: { items, reason: reason.trim() } }, { onSuccess: () => { showToast('Return request sent'); onDone(); } });
  };
  return (
    <form onSubmit={submit} noValidate className="bg-white border border-border-subtle rounded-xl p-4 flex flex-col gap-3">
      <h3 className="font-headline font-bold text-primary text-sm">Request a return or exchange</h3>
      <ul className="flex flex-col gap-2">
        {order.items?.map((it) => {
          const key = it._id || it.id;
          return (
            <li key={key} className="flex items-center justify-between gap-3 text-sm">
              <label htmlFor={`rt-${key}`}>{it.productName} <span className="text-xs text-muted">· {it.colorName} · {it.size} (ordered {it.quantity})</span></label>
              <input id={`rt-${key}`} type="number" min="0" max={it.quantity} value={qty[key] ?? ''} placeholder="0" onChange={(e) => setQty({ ...qty, [key]: Math.min(it.quantity, Math.max(0, Math.floor(Number(e.target.value) || 0))) })} className={`${inputCls} w-20 text-center`} />
            </li>
          );
        })}
      </ul>
      <label htmlFor="rt-reason" className="text-xs font-bold text-primary">Reason</label>
      <textarea id="rt-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
      <FieldError message={local || mut.error?.message} />
      <div className="flex gap-3">
        <button type="submit" disabled={mut.isPending} className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-60">Send request</button>
        <button type="button" onClick={onDone} className="px-4 py-2 text-xs font-bold cursor-pointer">Cancel</button>
      </div>
    </form>
  );
}

function OrderDetail({ id, onBack }) {
  const { data: order, isLoading, isError, error, refetch } = useMyOrderQuery(id);
  const cancel = useCancellationMutation();
  const { showToast } = useApp();
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [returning, setReturning] = useState(false);

  if (isLoading) return <LoadingBlock label="Loading order…" className="py-16" />;
  if (isError) return <ErrorBlock error={error} onRetry={refetch} className="py-12" />;
  const canCancel = ['pending', 'confirmed'].includes(order.orderStatus);

  const submitCancel = (e) => {
    e.preventDefault();
    cancel.mutate({ id, body: { reason: reason.trim() } }, { onSuccess: () => { showToast('Cancellation request sent.'); setOpen(false); } });
  };

  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={onBack} className="self-start text-xs font-bold text-primary underline cursor-pointer">← All orders</button>
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="font-headline text-xl font-bold text-primary">Order {order.orderNumber}</h2>
        <StatusPill status={order.orderStatus} />
      </div>
      <p className="text-xs text-muted">Placed {formatDate(order.placedAt || order.createdAt)} · Payment: {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}</p>
      <ul className="divide-y divide-border-subtle border border-border-subtle rounded-xl bg-white">
        {order.items?.map((it, i) => (
          <li key={i} className="p-4 flex gap-4 items-center text-sm">
            {it.image && <img src={typeof it.image === 'string' ? it.image : it.image.url} alt="" width="48" height="56" loading="lazy" referrerPolicy="no-referrer" className="w-12 h-14 object-cover rounded bg-surface-container" />}
            <span className="flex-1">{it.productName}<span className="block text-xs text-muted">{it.colorName} · {it.size} × {it.quantity}</span></span>
            <span className="font-semibold text-primary">{formatMoney(it.lineTotal, orderCurrency(order))}</span>
          </li>
        ))}
      </ul>
      <dl className="text-sm text-muted flex flex-col gap-1.5 max-w-xs self-end w-full">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatMoney(order.pricing?.subtotal, orderCurrency(order))}</dd></div>
        {order.pricing?.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>-{formatMoney(order.pricing.discount, orderCurrency(order))}</dd></div>}
        <div className="flex justify-between"><dt>Shipping</dt><dd>{order.pricing?.shipping === 0 ? 'Free' : formatMoney(order.pricing?.shipping, orderCurrency(order))}</dd></div>
        <div className="flex justify-between font-headline font-extrabold text-primary text-base pt-1 border-t border-border-subtle"><dt>Total</dt><dd>{formatMoney(order.pricing?.total, orderCurrency(order))}</dd></div>
      </dl>
      {order.shipment?.trackingNumber && (
        <p className="text-sm text-muted">Shipped via <strong>{order.shipment.courierName}</strong> · Tracking <strong>{order.shipment.trackingNumber}</strong>
          {order.shipment.trackingUrl && /^https?:\/\//.test(order.shipment.trackingUrl) && <> · <a href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="underline text-primary">Courier tracking</a></>}
        </p>
      )}
      {order.statusHistory?.length > 0 && (
        <ol className="border-l-2 border-border-subtle pl-4 flex flex-col gap-3 text-sm">
          {order.statusHistory.map((h, i) => <li key={i}><strong className="text-primary">{ORDER_STATUS_LABELS[h.status] || h.status}</strong><span className="block text-xs text-muted">{formatDate(h.changedAt || h.createdAt)}</span></li>)}
        </ol>
      )}
      {order.orderStatus === 'delivered' && !returning && <button type="button" onClick={() => setReturning(true)} className="self-start px-4 py-2 rounded-lg border border-border-subtle text-primary text-xs font-bold cursor-pointer">Request return / exchange</button>}
      {returning && <ReturnForm order={order} onDone={() => setReturning(false)} />}
      {canCancel && !open && <button type="button" onClick={() => setOpen(true)} className="self-start px-4 py-2 rounded-lg border border-error text-error text-xs font-bold cursor-pointer">Request cancellation</button>}
      {open && (
        <form onSubmit={submitCancel} className="bg-white border border-border-subtle rounded-xl p-4 flex flex-col gap-3">
          <label htmlFor="cx-reason" className="text-xs font-bold text-primary">Reason for cancelling</label>
          <textarea id="cx-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby="cx-err" className={inputCls} />
          <FieldError id="cx-err" message={fe(cancel.error, 'reason') || (cancel.error && cancel.error.message)} />
          <div className="flex gap-3">
            <button type="submit" disabled={cancel.isPending || reason.trim().length < 3} className="px-4 py-2 rounded-lg bg-error text-white text-xs font-bold cursor-pointer disabled:opacity-50">Send request</button>
            <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-xs font-bold cursor-pointer">Keep order</button>
          </div>
        </form>
      )}
    </div>
  );
}

function OrdersSection() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const { data, isLoading, isError, error, refetch } = useMyOrdersQuery({ page, limit: 10 });
  if (selected) return <OrderDetail id={selected} onBack={() => setSelected(null)} />;
  if (isLoading) return <LoadingBlock label="Loading your orders…" className="py-16" />;
  if (isError) return <ErrorBlock error={error} onRetry={refetch} className="py-12" />;
  const orders = data?.items || [];
  if (!orders.length) {
    return <div className="text-center py-14 text-sm text-muted">You have no orders yet. <Link to="/shop" className="font-bold text-primary underline">Start shopping</Link></div>;
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <li key={o.id || o._id}>
            <button type="button" onClick={() => setSelected(o.id || o._id)} className="w-full text-left bg-white border border-border-subtle rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 hover:border-primary transition-colors cursor-pointer">
              <span><strong className="font-headline text-primary">{o.orderNumber}</strong><span className="block text-xs text-muted">{formatDate(o.placedAt || o.createdAt)}</span></span>
              <StatusPill status={o.orderStatus} />
              <span className="font-bold text-primary">{formatMoney(o.pricing?.total, orderCurrency(o))}</span>
            </button>
          </li>
        ))}
      </ul>
      {data?.meta?.totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-4 py-2 text-xs font-bold border border-border-subtle rounded disabled:opacity-40 cursor-pointer">Previous</button>
          <button type="button" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)} className="px-4 py-2 text-xs font-bold border border-border-subtle rounded disabled:opacity-40 cursor-pointer">Next</button>
        </div>
      )}
    </div>
  );
}

const EMPTY_ADDR = { label: '', fullName: '', phone: '', addressLine1: '', city: '', province: '', postalCode: '' };

function AddressesSection() {
  const { showToast } = useApp();
  const { data: addresses, isLoading, isError, error, refetch } = useAddressesQuery();
  const { add, update, remove } = useAddressMutations();
  const [editing, setEditing] = useState(null); // null | 'new' | address
  const [form, setForm] = useState(EMPTY_ADDR);
  const mut = editing === 'new' ? add : update;

  const startEdit = (a) => {
    setEditing(a);
    setForm(a === 'new' ? EMPTY_ADDR : { ...EMPTY_ADDR, ...Object.fromEntries(Object.keys(EMPTY_ADDR).map((k) => [k, a[k] || ''])) });
  };
  const save = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ''));
    const done = { onSuccess: () => { showToast('Address saved'); setEditing(null); } };
    if (editing === 'new') add.mutate(body, done);
    else update.mutate({ id: editing.id || editing._id, body }, done);
  };
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  if (isLoading) return <LoadingBlock label="Loading addresses…" className="py-16" />;
  if (isError) return <ErrorBlock error={error} onRetry={refetch} className="py-12" />;

  return (
    <div className="flex flex-col gap-4">
      {!editing && (
        <>
          <ul className="grid sm:grid-cols-2 gap-4">
            {(addresses || []).map((a) => (
              <li key={a.id || a._id} className="bg-white border border-border-subtle rounded-xl p-4 text-sm flex flex-col gap-1">
                <strong className="text-primary">{a.label || 'Address'} {a.isDefault && <span className="text-[10px] bg-accent-subtle px-2 py-0.5 rounded-full ml-1">Default</span>}</strong>
                <span>{a.fullName} · {a.phone}</span>
                <span className="text-muted">{a.addressLine1}, {a.city}{a.province ? `, ${a.province}` : ''}</span>
                <div className="flex gap-4 mt-2 text-xs font-bold">
                  <button type="button" onClick={() => startEdit(a)} className="text-primary underline cursor-pointer">Edit</button>
                  <button type="button" onClick={() => remove.mutate(a.id || a._id, { onSuccess: () => showToast('Address removed') })} className="text-error underline cursor-pointer">Delete</button>
                  {!a.isDefault && <button type="button" onClick={() => update.mutate({ id: a.id || a._id, body: { isDefault: true } })} className="underline cursor-pointer">Make default</button>}
                </div>
              </li>
            ))}
          </ul>
          {!addresses?.length && <p className="text-sm text-muted">No saved addresses yet.</p>}
          <button type="button" onClick={() => startEdit('new')} className="self-start px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer">Add address</button>
        </>
      )}
      {editing && (
        <form onSubmit={save} noValidate className="bg-white border border-border-subtle rounded-xl p-5 grid sm:grid-cols-2 gap-4">
          <TextField id="ad-label" label="Label (e.g. Home)" value={form.label} onChange={set('label')} error={fe(mut.error, 'label')} />
          <TextField id="ad-name" label="Full name" value={form.fullName} onChange={set('fullName')} error={fe(mut.error, 'fullName')} />
          <TextField id="ad-phone" label="Phone" type="tel" value={form.phone} onChange={set('phone')} error={fe(mut.error, 'phone')} />
          <TextField id="ad-line1" label="Street address" value={form.addressLine1} onChange={set('addressLine1')} error={fe(mut.error, 'addressLine1')} />
          <TextField id="ad-city" label="City" value={form.city} onChange={set('city')} error={fe(mut.error, 'city')} />
          <TextField id="ad-prov" label="Province" value={form.province} onChange={set('province')} error={fe(mut.error, 'province')} />
          <TextField id="ad-zip" label="Postal code" value={form.postalCode} onChange={set('postalCode')} error={fe(mut.error, 'postalCode')} />
          {mut.error && !Object.keys(mut.error.fieldErrors || {}).length && <p role="alert" className="sm:col-span-2 text-xs text-error font-semibold">{mut.error.message}</p>}
          <div className="sm:col-span-2 flex gap-3">
            <button type="submit" disabled={mut.isPending} className="px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-60">Save address</button>
            <button type="button" onClick={() => setEditing(null)} className="px-5 py-2.5 text-xs font-bold cursor-pointer">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

function ProfileSection() {
  const { user, showToast } = useApp();
  const update = useUpdateProfileMutation();
  const changePw = useChangePasswordMutation();
  const logoutOthers = useLogoutOthersMutation();
  const [p, setP] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });

  return (
    <div className="flex flex-col gap-8 max-w-xl">
      <form onSubmit={(e) => { e.preventDefault(); update.mutate({ name: p.name.trim(), phone: p.phone.trim() }, { onSuccess: () => showToast('Profile updated') }); }} noValidate className="bg-white border border-border-subtle rounded-xl p-5 flex flex-col gap-4">
        <h2 className="font-headline font-bold text-primary">Profile</h2>
        <TextField id="pf-name" label="Full name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} error={fe(update.error, 'name')} />
        <TextField id="pf-email" label="Email" value={user?.email || ''} readOnly disabled />
        <TextField id="pf-phone" label="Phone" type="tel" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} error={fe(update.error, 'phone')} />
        {update.error && !Object.keys(update.error.fieldErrors || {}).length && <p role="alert" className="text-xs text-error font-semibold">{update.error.message}</p>}
        <button type="submit" disabled={update.isPending} className="self-start px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-60">Save changes</button>
      </form>

      <form onSubmit={(e) => { e.preventDefault(); changePw.mutate(pw, { onSuccess: () => { showToast('Password changed'); setPw({ currentPassword: '', newPassword: '' }); } }); }} noValidate className="bg-white border border-border-subtle rounded-xl p-5 flex flex-col gap-4">
        <h2 className="font-headline font-bold text-primary">Change password</h2>
        <TextField id="pw-cur" type="password" autoComplete="current-password" label="Current password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} error={fe(changePw.error, 'currentPassword')} />
        <TextField id="pw-new" type="password" autoComplete="new-password" label="New password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} error={fe(changePw.error, 'newPassword')} />
        {changePw.error && !Object.keys(changePw.error.fieldErrors || {}).length && <p role="alert" className="text-xs text-error font-semibold">{changePw.error.message}</p>}
        <div className="flex gap-3 flex-wrap">
          <button type="submit" disabled={changePw.isPending} className="px-5 py-2.5 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-60">Update password</button>
          <button type="button" onClick={() => logoutOthers.mutate(undefined, { onSuccess: () => showToast('Signed out of other devices') })} className="px-5 py-2.5 rounded-lg border border-border-subtle text-xs font-bold cursor-pointer">Sign out other devices</button>
        </div>
      </form>
    </div>
  );
}

function RequestList({ kind, title }) {
  const { data, isLoading, isError, error, refetch } = useMyRequestsQuery(kind);
  const items = Array.isArray(data) ? data : data?.items || [];
  return (
    <section aria-label={title}>
      <h3 className="font-headline font-bold text-primary mb-2">{title}</h3>
      {isLoading ? <p className="text-xs text-muted">Loading…</p> : isError ? <ErrorBlock error={error} onRetry={refetch} className="py-6" /> : items.length === 0 ? <p className="text-xs text-muted">No requests yet.</p> : (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <li key={r.id || r._id} className="bg-white border border-border-subtle rounded-lg p-3 text-sm flex flex-wrap justify-between gap-2">
              <span><strong className="text-primary">{r.requestNumber || r.referenceNumber || r.title || 'Request'}</strong><span className="block text-xs text-muted">{formatDate(r.createdAt)}</span></span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-surface-container h-fit">{String(r.status || '').replace(/_/g, ' ')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const QUOTE_STATUS = { draft: 'Draft', sent: 'Awaiting your response', accepted: 'Accepted', rejected: 'Declined', expired: 'Expired', converted_to_order: 'Converted to order' };

function QuotesSection() {
  const { showToast } = useApp();
  const { data, isLoading, isError, error, refetch } = useQuotesQuery();
  const { accept, reject } = useQuoteActions();
  const quotes = (Array.isArray(data) ? data : data?.items || []).filter((q) => q.status !== 'draft');
  const act = (mutation, arg, msg) => mutation.mutate(arg, { onSuccess: () => showToast(msg) });
  return (
    <section aria-label="Quotes">
      <h3 className="font-headline font-bold text-primary mb-2">Quotes</h3>
      {isLoading ? <p className="text-xs text-muted">Loading…</p> : isError ? <ErrorBlock error={error} onRetry={refetch} className="py-6" /> : quotes.length === 0 ? <p className="text-xs text-muted">No quotes yet. When our team prices one of your requests it will appear here.</p> : (
        <ul className="flex flex-col gap-3">
          {quotes.map((q) => {
            const id = q.id || q._id;
            return (
              <li key={id} className="bg-white border border-border-subtle rounded-xl p-4 text-sm flex flex-col gap-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong className="font-headline text-primary">{q.quoteNumber}</strong>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-accent-subtle text-primary">{QUOTE_STATUS[q.status] || q.status}</span>
                </div>
                {q.items?.length > 0 && (
                  <ul className="text-xs text-muted">{q.items.map((it, i) => <li key={i}>{it.productName || it.manufacturingStyleName || it.printingServiceName || it.description} {it.colorName ? `· ${it.colorName}` : ''} {it.size ? `· ${it.size}` : ''} × {it.quantity} - {formatPKR(it.lineTotal)}</li>)}</ul>
                )}
                <p className="font-bold text-primary">Total {formatPKR(q.pricing?.total)}{q.validUntil && <span className="font-normal text-xs text-muted"> · valid until {formatDate(q.validUntil)}</span>}</p>
                {q.terms && <p className="text-xs text-muted whitespace-pre-line">{q.terms}</p>}
                {q.status === 'sent' && (
                  <div className="flex gap-3 pt-1">
                    <button type="button" disabled={accept.isPending} onClick={() => act(accept, id, 'Quote accepted')} className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-60">Accept quote</button>
                    <button type="button" disabled={reject.isPending} onClick={() => act(reject, { id }, 'Quote declined')} className="px-4 py-2 rounded-lg border border-border-subtle text-xs font-bold cursor-pointer disabled:opacity-60">Decline</button>
                  </div>
                )}
                {(accept.error || reject.error) && <FieldError message={(accept.error || reject.error).message} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RequestsSection() {
  const returns = useReturnsQuery();
  const rItems = returns.data?.items || (Array.isArray(returns.data) ? returns.data : []);
  return (
    <div className="flex flex-col gap-8">
      <QuotesSection />
      <RequestList kind="wholesale" title="Wholesale requests" />
      <RequestList kind="manufacturing" title="Manufacturing requests" />
      <RequestList kind="printing" title="Printing & branding requests" />
      <section aria-label="Returns">
        <h3 className="font-headline font-bold text-primary mb-2">Returns &amp; exchanges</h3>
        {rItems.length === 0 ? <p className="text-xs text-muted">No return requests.</p> : (
          <ul className="flex flex-col gap-2">{rItems.map((r) => <li key={r.id || r._id} className="bg-white border border-border-subtle rounded-lg p-3 text-sm flex justify-between"><span>{r.returnNumber || r.orderNumber || 'Return'}</span><span className="text-xs font-bold">{String(r.status || '').replace(/_/g, ' ')}</span></li>)}</ul>
        )}
      </section>
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'orders', label: 'My Orders', icon: 'inventory_2' },
  { id: 'addresses', label: 'Addresses', icon: 'location_on' },
  { id: 'requests', label: 'Requests & Returns', icon: 'assignment' },
  { id: 'profile', label: 'Profile & Security', icon: 'shield_person' },
];

function Dashboard({ tab, setTab }) {
  const { user, cartTotalQty, wishlistCount, showToast } = useApp();
  const logout = useLogoutMutation();
  const orders = useMyOrdersQuery({ page: 1, limit: 3 });
  const initials = (user?.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="w-full flex flex-col bg-surface text-on-surface">
      <Seo title="My Account" noindex />
      <section className="w-full bg-surface-container-low py-6 mb-6 border-b border-border-subtle">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold" aria-hidden="true">{initials}</div>
            <div>
              <h1 className="font-headline font-bold text-2xl sm:text-3xl text-primary">Welcome back, {(user?.name || '').split(' ')[0]}</h1>
              <p className="text-xs sm:text-sm text-muted mt-0.5">Here is what is happening with your PEHANLY account.</p>
            </div>
          </div>
          <Link to="/cart" className="inline-flex items-center gap-2 px-3.5 py-2 bg-primary text-white font-headline text-xs font-semibold rounded-lg self-start">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">shopping_bag</span>Bag
            <span className="px-1.5 bg-accent text-primary text-[10px] rounded-full font-bold">{cartTotalQty}</span>
          </Link>
        </div>
      </section>

      <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-12 pb-16 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        <aside className="lg:col-span-3 bg-white rounded-2xl p-2 border border-border-subtle">
          <nav aria-label="Account menu" className="space-y-1">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${tab === t.id ? 'bg-primary text-white' : 'text-on-surface hover:bg-surface-container-low'}`}>
                <span className="material-symbols-outlined text-base" aria-hidden="true">{t.icon}</span>{t.label}
              </button>
            ))}
            <Link to="/wishlist" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-on-surface hover:bg-surface-container-low">
              <span className="material-symbols-outlined text-base" aria-hidden="true">favorite</span>Wishlist ({wishlistCount})
            </Link>
            <button type="button" onClick={() => logout.mutate(undefined, { onSettled: () => showToast('Signed out') })} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-error hover:bg-surface-container-low cursor-pointer">
              <span className="material-symbols-outlined text-base" aria-hidden="true">logout</span>Sign out
            </button>
          </nav>
        </aside>

        <section className="lg:col-span-9" aria-label={TABS.find((t) => t.id === tab)?.label}>
          {tab === 'overview' && (
            <div className="flex flex-col gap-6">
              <h2 className="font-headline text-xl font-bold text-primary">Recent orders</h2>
              {orders.isLoading ? <LoadingBlock className="py-8" /> : orders.data?.items?.length ? (
                <ul className="flex flex-col gap-3">
                  {orders.data.items.map((o) => (
                    <li key={o.id || o._id} className="bg-white border border-border-subtle rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                      <span><strong className="font-headline text-primary">{o.orderNumber}</strong><span className="block text-xs text-muted">{formatDate(o.placedAt || o.createdAt)}</span></span>
                      <StatusPill status={o.orderStatus} /><span className="font-bold text-primary">{formatMoney(o.pricing?.total, orderCurrency(o))}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">No orders yet. <Link to="/shop" className="font-bold text-primary underline">Start shopping</Link></p>}
              <div className="bg-accent-subtle rounded-xl p-5 text-sm text-primary">
                <strong>Member offers:</strong> as a registered customer you can apply coupon codes in your bag and at checkout. Coupons are validated by our server when you apply them.
              </div>
            </div>
          )}
          {tab === 'orders' && <OrdersSection />}
          {tab === 'addresses' && <AddressesSection />}
          {tab === 'requests' && <RequestsSection />}
          {tab === 'profile' && <ProfileSection />}
        </section>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { isAuthenticated, authStatus } = useApp();
  const [params, setParams] = useSearchParams();
  const token = params.get('token') || '';
  const tab = params.get('tab') || (token ? 'reset' : 'overview');
  const [view, setView] = useState(token ? 'reset' : 'login');

  useEffect(() => { if (token) setView('reset'); }, [token]);

  if (authStatus === 'loading' || authStatus === 'unknown') return <LoadingBlock label="Loading your account…" className="py-40" />;
  if (!isAuthenticated) {
    const changeView = (v) => { setView(v); if (params.has('token')) setParams({}, { replace: true }); };
    return <AuthPortal view={view} token={token} setView={changeView} />;
  }
  const setTab = (t) => setParams(t === 'overview' ? {} : { tab: t });
  return <Dashboard tab={TABS.some((t) => t.id === tab) ? tab : 'overview'} setTab={setTab} />;
}
