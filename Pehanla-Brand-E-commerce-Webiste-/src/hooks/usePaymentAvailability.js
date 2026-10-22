import { usePublicSettingsQuery } from './useQueries';

/**
 * STORE-LEVEL payment availability, used where no delivery address is known yet (bag, product page).
 * The authority for a specific address is the backend (POST /shipping/options, re-checked by POST /orders):
 *   - Cash on Delivery ... Karachi, Sindh only (current temporary policy)
 *   - JazzCash wallet ... anywhere in Pakistan, once the store has enabled it and set its wallet details
 *   - USD ............... no approved payment method yet (never faked or converted)
 * "COD unavailable" never means "delivery unavailable": delivery is Pakistan-wide.
 */
export function usePaymentAvailability(currency) {
  const { data: settings, isLoading } = usePublicSettingsQuery();
  const fromBackend = settings?.currencies?.paymentMethods?.[currency];
  const currencyMethods = Array.isArray(fromBackend) ? fromBackend : currency === 'PKR' ? ['cod'] : [];
  const codAllowed = currencyMethods.includes('cod') && settings?.checkout?.codEnabled !== false;
  const walletOn = currencyMethods.includes('jazzcash_manual') && settings?.checkout?.jazzcashManual?.enabled === true;
  const methods = [codAllowed && 'cod', walletOn && 'jazzcash_manual'].filter(Boolean);
  return {
    isLoading,
    methods,
    codKarachiOnly: codAllowed,
    wallet: walletOn ? settings.checkout.jazzcashManual : null,
    available: methods.length > 0,
    reason:
      methods.length > 0
        ? null
        : currency === 'USD'
          ? 'USD checkout is not available yet — no international payment method is enabled. You can browse in USD, but orders are placed in PKR.'
          : 'No payment method is currently available.',
  };
}
