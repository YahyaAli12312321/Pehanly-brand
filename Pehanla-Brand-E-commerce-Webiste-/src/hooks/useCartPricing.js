import { useEffect, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { catalogApi } from '../services/catalogApi';
import { QUERY_KEYS } from './useQueries';
import { useAppStore } from '../store/useAppStore';
import { flattenSkus } from '../utils/product';
import { linePrice, skuPrice, sumMoney } from '../utils/currency';

/**
 * Re-validates every cart line against the live catalog (price, availability,
 * stock cap). The persisted cart is only a convenience snapshot - this hook is
 * what the UI trusts. The backend still recomputes everything at checkout.
 */
export function useCartPricing(currency = 'PKR') {
  const cartItems = useAppStore((s) => s.cartItems);
  const syncCartLine = useAppStore((s) => s.syncCartLine);

  const slugs = useMemo(() => [...new Set(cartItems.map((i) => i.slug).filter(Boolean))], [cartItems]);

  const results = useQueries({
    queries: slugs.map((slug) => ({
      queryKey: QUERY_KEYS.product(slug),
      queryFn: () => catalogApi.product(slug),
      staleTime: 60 * 1000,
      retry: (count, error) => error?.status !== 404 && count < 1,
    })),
  });

  const live = useMemo(() => {
    const bySlug = {};
    results.forEach((r, i) => {
      bySlug[slugs[i]] = { status: r.status, product: r.data, error: r.error };
    });
    return bySlug;
  }, [results, slugs]);

  const lines = useMemo(
    () =>
      cartItems.map((item) => {
        const entry = live[item.slug];
        if (!entry || entry.status === 'pending') return { ...item, status: 'loading' };
        if (entry.status === 'error') {
          return { ...item, status: entry.error?.status === 404 ? 'unavailable' : 'unknown' };
        }
        const sku = flattenSkus(entry.product).find((s) => s.id === item.id);
        if (!sku) return { ...item, status: 'unavailable' };
        const maxQuantity = sku.maxQuantity;
        return {
          ...item,
          price: sku.price,
          originalPrice: sku.compareAtPrice ?? null,
          priceUSD: sku.priceUSD ?? null,
          originalPriceUSD: sku.compareAtPriceUSD ?? null,
          maxQuantity,
          image: sku.images?.[0]?.url || entry.product.image?.url || item.image,
          // 'no_currency': this size has no price in the selected currency (switch currency or remove it).
          status:
            skuPrice(currency === 'USD' ? { priceUSD: sku.priceUSD } : { price: sku.price }, currency) === null
              ? 'no_currency'
              : !sku.inStock || maxQuantity < 1
                ? 'out_of_stock'
                : item.qty > maxQuantity
                  ? 'reduced'
                  : 'ok',
        };
      }),
    [cartItems, live, currency],
  );

  // Persist refreshed price/stock so the next visit starts from fresh numbers.
  useEffect(() => {
    lines.forEach((line, i) => {
      const stored = cartItems[i];
      if (
        stored &&
        (line.status === 'ok' || line.status === 'reduced') &&
        (stored.price !== line.price || stored.originalPrice !== line.originalPrice || (stored.priceUSD ?? null) !== (line.priceUSD ?? null) || (stored.originalPriceUSD ?? null) !== (line.originalPriceUSD ?? null) || stored.maxQuantity !== line.maxQuantity || stored.image !== line.image)
      ) {
        syncCartLine(line.id, {
          price: line.price,
          originalPrice: line.originalPrice,
          priceUSD: line.priceUSD ?? null,
          originalPriceUSD: line.originalPriceUSD ?? null,
          maxQuantity: line.maxQuantity,
          image: line.image,
        });
      }
    });
  }, [lines, cartItems, syncCartLine]);

  const purchasable = lines.filter((l) => l.status === 'ok' || l.status === 'reduced');
  const subtotal = sumMoney(purchasable.map((l) => linePrice(l, currency) * Math.min(l.qty, l.maxQuantity ?? l.qty)));
  const isLoading = lines.some((l) => l.status === 'loading');
  const hasProblems = lines.some((l) => l.status === 'out_of_stock' || l.status === 'unavailable' || l.status === 'reduced' || l.status === 'no_currency');

  return { lines, purchasable, subtotal, isLoading, hasProblems };
}
