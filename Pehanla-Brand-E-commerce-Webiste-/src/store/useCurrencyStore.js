import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_CURRENCY, detectCurrency, isCurrency } from '../utils/currency';

/**
 * The visitor's display/transaction currency preference.
 *
 *  source: 'detected' -> picked automatically on first visit (never persisted)
 *          'manual'   -> the visitor chose it in the header selector (persisted; always overrides detection)
 *
 * Only { currency, source: 'manual' } is ever written to localStorage - no credentials, no PII.
 * The currency is NOT part of the URL, so switching creates no duplicate indexable pages.
 */
const STORAGE_KEY = 'pehanly-currency-v1';

const storage = () => {
  try {
    const probe = '__pl_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
  }
};

export const useCurrencyStore = create(
  persist(
    (set) => ({
      currency: DEFAULT_CURRENCY,
      source: 'detected',
      setCurrency: (currency) => {
        if (isCurrency(currency)) set({ currency, source: 'manual' });
      },
      /** Called once on startup: a stored manual choice wins, otherwise detect. */
      initDetected: () =>
        set((s) => (s.source === 'manual' && isCurrency(s.currency) ? s : { currency: detectCurrency(), source: 'detected' })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(storage),
      // Persist ONLY an explicit manual choice.
      partialize: (s) => (s.source === 'manual' ? { currency: s.currency, source: s.source } : {}),
      merge: (persisted, current) => {
        const p = persisted || {};
        return p.source === 'manual' && isCurrency(p.currency) ? { ...current, currency: p.currency, source: 'manual' } : current;
      },
    },
  ),
);

export const useCurrency = () => {
  const currency = useCurrencyStore((s) => s.currency);
  const setCurrency = useCurrencyStore((s) => s.setCurrency);
  return { currency, setCurrency };
};
