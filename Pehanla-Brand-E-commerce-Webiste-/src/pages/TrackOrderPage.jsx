import React, { useState } from 'react';
import { useTrackGuestOrderMutation } from '../hooks/useQueries';
import Seo from '../seo/Seo';
import { FieldError } from '../components/StateViews';
import { formatMoney, orderCurrency } from '../utils/currency';
import { formatDate, isValidEmail, isValidPhone, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../utils/format';

export default function TrackOrderPage() {
  const track = useTrackGuestOrderMutation();
  const [orderNumber, setOrderNumber] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');
  const order = track.data;

  const submit = (e) => {
    e.preventDefault();
    const num = orderNumber.trim();
    const c = contact.trim();
    if (!num) return setError('Enter your order number.');
    const isEmail = isValidEmail(c);
    if (!isEmail && !isValidPhone(c)) return setError('Enter the email or phone number used on the order.');
    setError('');
    track.mutate({ orderNumber: num, ...(isEmail ? { email: c } : { phone: c }) });
  };

  const inputCls = 'w-full px-4 py-3 rounded-lg bg-surface border border-border-subtle text-sm focus:outline-none focus:border-primary';

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-8 py-14 w-full">
      <Seo title="Track your order" description="Check the status of your PEHAN LY order." path="/track-order" noindex />
      <h1 className="font-headline text-3xl font-extrabold text-primary">Track your order</h1>
      <p className="text-sm text-muted mt-2">Enter your order number and the email or phone number you used at checkout.</p>

      <form onSubmit={submit} noValidate className="mt-8 bg-surface-card rounded-xl border border-border-subtle p-6 flex flex-col gap-4">
        <div>
          <label htmlFor="tr-num" className="block text-xs font-bold text-on-surface mb-1.5">Order number</label>
          <input id="tr-num" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} autoComplete="off" className={inputCls} />
        </div>
        <div>
          <label htmlFor="tr-contact" className="block text-xs font-bold text-on-surface mb-1.5">Email or phone</label>
          <input id="tr-contact" value={contact} onChange={(e) => setContact(e.target.value)} aria-describedby="tr-err" className={inputCls} />
        </div>
        <FieldError id="tr-err" message={error || (track.isError ? track.error.message : '')} />
        <button type="submit" disabled={track.isPending} className="self-start px-6 py-3 rounded-lg bg-primary text-white text-sm font-semibold cursor-pointer disabled:opacity-60">
          {track.isPending ? 'Checking…' : 'Track order'}
        </button>
      </form>

      {order && (
        <section aria-live="polite" aria-labelledby="tr-result" className="mt-8 bg-surface-card rounded-xl border border-border-subtle p-6 flex flex-col gap-5">
          <div className="flex flex-wrap justify-between gap-2">
            <h2 id="tr-result" className="font-headline text-lg font-bold text-primary">Order {order.orderNumber}</h2>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-accent-subtle text-primary">{ORDER_STATUS_LABELS[order.orderStatus] || order.orderStatus}</span>
          </div>
          <p className="text-xs text-muted">Placed {formatDate(order.placedAt)} · Payment: {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}</p>
          <ul className="divide-y divide-border-subtle border border-border-subtle rounded-lg">
            {order.items?.map((it, i) => (
              <li key={i} className="p-3 flex justify-between gap-3 text-sm">
                <span>{it.productName} <span className="text-muted">· {it.colorName} · {it.size} × {it.quantity}</span></span>
                <span className="font-semibold text-primary">{formatMoney(it.lineTotal, orderCurrency(order))}</span>
              </li>
            ))}
          </ul>
          <p className="text-right font-headline font-extrabold text-primary">Total {formatMoney(order.pricing?.total, orderCurrency(order))}</p>
          {order.shipment?.trackingNumber && (
            <p className="text-sm text-muted">
              Shipped via <strong>{order.shipment.courierName}</strong> · Tracking <strong>{order.shipment.trackingNumber}</strong>
              {order.shipment.trackingUrl && /^https?:\/\//.test(order.shipment.trackingUrl) && (
                <> · <a href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="underline text-primary">Track with courier</a></>
              )}
            </p>
          )}
          {order.statusHistory?.length > 0 && (
            <ol className="border-l-2 border-border-subtle pl-4 flex flex-col gap-3 text-sm">
              {order.statusHistory.map((h, i) => (
                <li key={i}><strong className="text-primary">{ORDER_STATUS_LABELS[h.status] || h.status}</strong><span className="text-muted text-xs block">{formatDate(h.changedAt || h.createdAt)}</span></li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
