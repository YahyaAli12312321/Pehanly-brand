import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAppStore } from '../store/useAppStore';
import { useCartPricing } from '../hooks/useCartPricing';
import { useFreeShippingInfoQuery, usePublicSettingsQuery, useValidateCouponMutation } from '../hooks/useQueries';
import Seo from '../seo/Seo';
import { FieldError } from '../components/StateViews';
import { formatMoney, linePrice, lineOriginal } from '../utils/currency';
import { useCurrency } from '../store/useCurrencyStore';
import { usePaymentAvailability } from '../hooks/usePaymentAvailability';

const STATUS_NOTE = {
  out_of_stock: 'Out of stock - remove to continue',
  unavailable: 'No longer available - remove to continue',
  no_currency: 'Not sold in this currency - switch currency or remove it',
  reduced: 'Quantity reduced to available stock',
  unknown: 'Could not verify availability right now',
};

export default function CartPage() {
  const { cartItems, removeFromCart, updateCartQty, navigate, isAuthenticated } = useApp();
  const couponCode = useAppStore((s) => s.couponCode);
  const setCouponCode = useAppStore((s) => s.setCouponCode);
  const { currency, setCurrency } = useCurrency();
  const { lines, subtotal, isLoading, hasProblems } = useCartPricing(currency);
  const payment = usePaymentAvailability(currency);
  const money = (n) => formatMoney(n, currency);
  const { data: freeShipping } = useFreeShippingInfoQuery(currency);
  const { data: settings } = usePublicSettingsQuery();
  const validate = useValidateCouponMutation();
  const [input, setInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [applied, setApplied] = useState(null);

  const itemCount = cartItems.reduce((n, i) => n + i.qty, 0);
  const threshold = freeShipping?.available ? freeShipping.minimumOrderAmount : null;
  const remaining = threshold != null ? Math.max(0, threshold - subtotal) : null;

  // Re-price the applied coupon on the backend whenever the subtotal changes.
  const { mutate: revalidate } = validate;
  useEffect(() => {
    if (!isAuthenticated || !couponCode || !subtotal) {
      setApplied(null);
      return;
    }
    revalidate(
      // PKR sends the original body; other currencies tell the backend which currency the subtotal is in.
      { code: couponCode, subtotal, ...(currency !== 'PKR' ? { currency } : {}) },
      {
        onSuccess: (res) => { setApplied(res); setCouponError(''); },
        onError: (err) => { setApplied(null); setCouponCode(''); setCouponError(err.message); },
      },
    );
  }, [couponCode, subtotal, currency, isAuthenticated, revalidate, setCouponCode]);

  const applyCoupon = (e) => {
    e.preventDefault();
    const code = input.trim().toUpperCase();
    if (code.length < 2) { setCouponError('Enter a coupon code.'); return; }
    setCouponError('');
    setCouponCode(code);
    setInput('');
  };

  const discount = applied?.discountAmount || 0;
  const estimatedTotal = Math.max(0, Math.round((subtotal - discount) * 100) / 100);

  return (
    <div className="w-full flex flex-col">
      <Seo title="Shopping Bag" noindex />
      <nav aria-label="Breadcrumb" className="bg-surface border-b border-border-subtle py-3 px-4 sm:px-8">
        <ol className="max-w-7xl mx-auto flex items-center text-xs text-muted">
          <li><Link to="/" className="hover:text-primary transition-colors">Home</Link></li>
          <li className="mx-2" aria-hidden="true">/</li>
          <li><Link to="/shop" className="hover:text-primary transition-colors">Shop</Link></li>
          <li className="mx-2" aria-hidden="true">/</li>
          <li className="text-primary font-semibold" aria-current="page">Shopping Bag ({itemCount})</li>
        </ol>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 w-full">
        <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-primary mb-6">Your Shopping Bag</h1>

        {cartItems.length === 0 ? (
          <div className="bg-surface-card rounded-2xl border border-border-subtle p-12 text-center flex flex-col items-center max-w-lg mx-auto my-12">
            <span className="material-symbols-outlined text-6xl text-muted/40 mb-4" aria-hidden="true">shopping_bag</span>
            <h2 className="font-headline text-xl font-bold text-primary">Your Bag is Empty</h2>
            <p className="text-xs text-muted mt-2 max-w-xs">Browse the collection and add your favourites.</p>
            <Link to="/shop" className="mt-6 px-8 py-3 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-primary-light transition-all">
              Discover The Collection
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 flex flex-col gap-6">
              {threshold != null && (
                <div className="bg-surface-container rounded-xl p-4 border border-border-subtle">
                  <div className="flex justify-between items-center text-xs mb-2">
                    <span className="font-semibold text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px] text-accent" aria-hidden="true">local_shipping</span>
                      {remaining === 0 ? (
                        <strong>You qualify for free shipping!</strong>
                      ) : (
                        <span>Add <strong>{money(remaining)}</strong> more to unlock free shipping</span>
                      )}
                    </span>
                    <span className="text-[11px] font-bold text-muted">{Math.min(100, Math.round((subtotal / threshold) * 100))}%</span>
                  </div>
                  <div className="w-full h-2 bg-border-subtle rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((subtotal / threshold) * 100))} aria-label="Progress to free shipping">
                    <div className="h-full bg-accent transition-all duration-500 rounded-full" style={{ width: `${Math.min(100, (subtotal / threshold) * 100)}%` }} />
                  </div>
                </div>
              )}

              <ul className="bg-surface-card rounded-xl border border-border-subtle divide-y divide-border-subtle shadow-xs">
                {lines.map((item) => {
                  const bad = item.status === 'out_of_stock' || item.status === 'unavailable' || item.status === 'no_currency';
                  return (
                    <li key={item.id} className={`p-4 sm:p-6 flex gap-4 sm:gap-6 items-center ${bad ? 'opacity-70' : ''}`}>
                      <Link to={`/product/${item.slug}`} className="w-20 h-24 sm:w-24 sm:h-28 rounded-lg overflow-hidden bg-surface-container shrink-0 border border-border-subtle">
                        {item.image && <img src={item.image} alt={item.name} width="96" height="112" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
                      </Link>
                      <div className="flex-1 flex flex-col justify-between">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-muted font-bold">{item.category}</span>
                            <h2 className="font-headline font-bold text-sm sm:text-base text-primary">
                              <Link to={`/product/${item.slug}`}>{item.name}</Link>
                            </h2>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                              <span>Size: <strong className="text-primary">{item.size}</strong></span>
                              <span aria-hidden="true">•</span>
                              <span className="flex items-center gap-1">
                                Color: <strong className="text-primary">{item.color}</strong>
                                {item.colorHex && <span className="w-2.5 h-2.5 rounded-full inline-block border border-border-subtle" style={{ backgroundColor: item.colorHex }} aria-hidden="true" />}
                              </span>
                            </div>
                            {STATUS_NOTE[item.status] && <p role="status" className="mt-1 text-[11px] font-semibold text-error">{STATUS_NOTE[item.status]}</p>}
                          </div>
                          <button type="button" onClick={() => removeFromCart(item.id)} aria-label={`Remove ${item.name} from bag`} className="text-muted hover:text-error transition-colors p-1 cursor-pointer">
                            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">delete</span>
                          </button>
                        </div>
                        <div className="flex justify-between items-center mt-4">
                          <div className="flex items-center border border-border-subtle rounded-md bg-surface">
                            <button type="button" onClick={() => updateCartQty(item.id, -1)} disabled={bad} aria-label={`Decrease quantity of ${item.name}`} className="px-2.5 py-1 text-muted hover:text-primary cursor-pointer text-sm font-bold disabled:opacity-40">-</button>
                            <span className="px-3 py-1 text-xs font-bold text-primary" aria-live="polite">{item.qty}</span>
                            <button type="button" onClick={() => updateCartQty(item.id, 1)} disabled={bad || (item.maxQuantity != null && item.qty >= item.maxQuantity)} aria-label={`Increase quantity of ${item.name}`} className="px-2.5 py-1 text-muted hover:text-primary cursor-pointer text-sm font-bold disabled:opacity-40">+</button>
                          </div>
                          <div className="text-right">
                            {item.status === 'loading' ? (
                              <span className="text-xs text-muted">Updating…</span>
                            ) : (
                              <>
                                {item.status === 'no_currency' ? (
                                  <span className="text-xs text-muted">Not sold in {currency}</span>
                                ) : (
                                  <>
                                    <span className="font-headline font-extrabold text-sm sm:text-base text-primary">{money(Math.round(linePrice(item, currency) * item.qty * 100) / 100)}</span>
                                    {item.qty > 1 && <span className="text-[10px] text-muted block">{money(linePrice(item, currency))} each</span>}
                                    {lineOriginal(item, currency) && <span className="text-[10px] text-muted block line-through">{money(lineOriginal(item, currency))}</span>}
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <aside aria-label="Order summary" className="lg:col-span-4 bg-surface-card rounded-xl p-6 sm:p-8 border border-border-subtle shadow-sm flex flex-col gap-6 lg:sticky lg:top-32">
              <h2 className="font-headline text-base font-bold text-primary border-b border-border-subtle pb-3">Order Summary</h2>

              {/* Coupons: registered customers only. Backend is authoritative. */}
              {isAuthenticated ? (
                <div>
                  <form onSubmit={applyCoupon} className="flex gap-2" noValidate>
                    <label htmlFor="coupon-code" className="sr-only">Coupon code</label>
                    <input id="coupon-code" type="text" placeholder="Coupon code" autoComplete="off" value={input} onChange={(e) => setInput(e.target.value)} aria-describedby="coupon-err" className="flex-1 text-xs px-3 py-2 rounded border border-border-subtle uppercase focus:border-primary focus:outline-none bg-surface" />
                    <button type="submit" disabled={validate.isPending} className="px-4 py-2 bg-primary text-white text-xs font-semibold uppercase tracking-wider rounded hover:bg-primary-light cursor-pointer disabled:opacity-60">
                      {validate.isPending ? '…' : 'Apply'}
                    </button>
                  </form>
                  <FieldError id="coupon-err" message={couponError} />
                  {applied && (
                    <div role="status" className="mt-2 text-[11px] text-primary bg-accent-subtle p-2 rounded flex items-center justify-between gap-1.5">
                      <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]" aria-hidden="true">check_circle</span>{applied.code} applied</span>
                      <button type="button" onClick={() => { setCouponCode(''); setApplied(null); }} className="font-bold underline cursor-pointer">Remove</button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-muted bg-surface-container-low rounded p-3">
                  Have a coupon? Coupons are a member benefit.{' '}
                  <button type="button" onClick={() => navigate('account')} className="text-primary font-bold underline cursor-pointer">Sign in or create an account</button> to use them.
                </p>
              )}

              <dl className="flex flex-col gap-3 text-xs text-muted border-b border-border-subtle pb-4">
                <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-semibold text-primary">{money(subtotal)}</dd></div>
                {discount > 0 && (
                  <div className="flex justify-between text-primary font-semibold"><dt>Coupon ({applied.code})</dt><dd>-{money(discount)}</dd></div>
                )}
                <div className="flex justify-between"><dt>Shipping</dt><dd className="font-semibold text-primary">{threshold != null && remaining === 0 ? 'FREE' : 'Calculated at checkout'}</dd></div>
              </dl>

              <div className="flex justify-between items-baseline">
                <span className="font-headline text-base font-bold text-primary">Estimated Total</span>
                <span className="font-headline text-2xl font-extrabold text-primary">{money(estimatedTotal)}</span>
              </div>

              {hasProblems && <p role="alert" className="text-[11px] text-error font-semibold">Some items need attention before checkout.</p>}

              {!payment.isLoading && !payment.available && (
                <div role="status" className="text-[11px] text-primary bg-surface-container-low border border-border-subtle rounded p-3 leading-relaxed">
                  {payment.reason}
                  {currency !== 'PKR' && (
                    <button type="button" onClick={() => setCurrency('PKR')} className="mt-2 block text-primary font-bold underline cursor-pointer">Switch to PKR to check out</button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => navigate('checkout')}
                disabled={isLoading || hasProblems || subtotal <= 0 || !payment.available}
                className="w-full py-3.5 bg-accent hover:bg-accent-light text-primary font-bold text-xs uppercase tracking-widest rounded shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Proceed to Checkout</span>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">lock</span>
              </button>
              {!isAuthenticated && <p className="text-[11px] text-muted text-center">You can check out as a guest.</p>}

              <ul className="pt-2 flex flex-col gap-2 text-[11px] text-muted border-t border-border-subtle">
                {payment.methods.includes('cod') && <li className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px] text-accent" aria-hidden="true">payments</span>Cash on Delivery available</li>}
                {settings?.returns?.enabled && <li className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px] text-accent" aria-hidden="true">published_with_changes</span>{settings.returns.windowDays}-day returns &amp; exchange</li>}
              </ul>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
