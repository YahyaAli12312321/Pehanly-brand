import { usePublicSettingsQuery } from './useQueries';

/**
 * Which payment methods can settle an order in a currency. The backend is the authority
 * (public settings -> currencies.paymentMethods); the fallback only mirrors today's V1 contract:
 * PKR = cash on delivery, USD = none (no approved international provider yet).
 * A USD order is NEVER silently converted to PKR, and no USD payment is ever faked.
 */
export function usePaymentAvailability(currency) {
  const { data: settings, isLoading } = usePublicSettingsQuery();
  const fromBackend = settings?.currencies?.paymentMethods?.[currency];
  const fallback = currency === 'PKR' ? ['cod'] : [];
  let methods = Array.isArray(fromBackend) ? fromBackend : fallback;
  // The store can also switch COD off in settings.
  if (settings?.checkout && settings.checkout.codEnabled === false) methods = methods.filter((m) => m !== 'cod');
  return {
    isLoading,
    methods,
    available: methods.length > 0,
    reason:
      methods.length > 0
        ? null
        : currency === 'USD'
          ? 'USD checkout is not available yet — no international payment method is enabled. You can browse in USD, but orders are placed in PKR.'
          : 'No payment method is currently available.',
  };
}
