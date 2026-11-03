import React from 'react';
import { CURRENCIES, CURRENCY_LABELS } from '../utils/currency';
import { useCurrency } from '../store/useCurrencyStore';

/**
 * Manual currency choice. Native <select> = keyboard + screen-reader + mobile-picker support for free.
 * The choice is remembered (manual source) and overrides auto-detection; it never touches the URL.
 *   variant="compact": "PKR" / "USD" pill for the header bar
 *   variant="full":    full names, used inside the mobile drawer
 */
export default function CurrencySelector({ variant = 'compact', id = 'currency-select', className = '' }) {
  const { currency, setCurrency } = useCurrency();
  const full = variant === 'full';

  return (
    <div className={`inline-flex items-center ${className}`}>
      <label htmlFor={id} className={full ? 'sr-only' : 'sr-only'}>
        Currency
      </label>
      <div className="relative">
        <select
          id={id}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          aria-label="Currency"
          data-testid={`currency-${variant}`}
          className={`appearance-none cursor-pointer bg-surface-card border border-border-subtle hover:border-primary/40 text-primary font-headline font-bold rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors ${
            full ? 'w-full text-sm pl-4 pr-10 py-3' : 'text-xs pl-3 pr-7 py-2'
          }`}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {full ? CURRENCY_LABELS[c] : c}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className={`material-symbols-outlined pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted ${
            full ? 'right-3 text-[22px]' : 'right-1.5 text-[18px]'
          }`}
        >
          expand_more
        </span>
      </div>
    </div>
  );
}
