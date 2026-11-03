import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../store/useAppStore';

const line = (over = {}) => ({ id: 's1', skuId: 's1', productId: 'p1', slug: 'tee', name: 'Tee', category: 'Tees', size: 'M', color: 'Black', colorHex: '#000', image: '', price: 1000, originalPrice: null, maxQuantity: 5, ...over });

describe('cart store', () => {
  beforeEach(() => { localStorage.clear(); useAppStore.setState({ cartItems: [], wishlistItems: [], couponCode: '', isAuthenticated: false, user: null }); });

  it('adds lines keyed by SKU and merges quantities', () => {
    const { addToCart } = useAppStore.getState();
    expect(addToCart(line(), 1)).toBe(true);
    addToCart(line(), 2);
    const items = useAppStore.getState().cartItems;
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(3);
  });
  it('caps quantity at the SKU maxQuantity and refuses unavailable SKUs', () => {
    const { addToCart } = useAppStore.getState();
    addToCart(line({ maxQuantity: 2 }), 5);
    expect(useAppStore.getState().cartItems[0].qty).toBe(2);
    useAppStore.setState({ cartItems: [] });
    expect(addToCart(line({ maxQuantity: 0 }), 1)).toBe(false);
    expect(useAppStore.getState().cartItems).toHaveLength(0);
  });
  it('updates, removes and clears (clearing also drops the coupon code)', () => {
    const s = useAppStore.getState();
    s.addToCart(line(), 2);
    s.updateCartQty('s1', -1);
    expect(useAppStore.getState().cartItems[0].qty).toBe(1);
    s.setCouponCode('SAVE10');
    s.clearCart();
    expect(useAppStore.getState().cartItems).toHaveLength(0);
    expect(useAppStore.getState().couponCode).toBe('');
  });
  it('clears the coupon on sign-out (coupons are for registered customers)', () => {
    useAppStore.getState().setCouponCode('SAVE10');
    useAppStore.getState().clearSession();
    expect(useAppStore.getState().couponCode).toBe('');
  });
  it('does not persist auth state or tokens', () => {
    useAppStore.setState({ user: { name: 'A' }, isAuthenticated: true });
    useAppStore.getState().addToCart(line(), 1);
    const saved = JSON.stringify(localStorage);
    expect(saved).not.toMatch(/isAuthenticated|token|"user"/i);
  });
  it('toggles the wishlist', () => {
    const { toggleWishlist, isItemInWishlist } = useAppStore.getState();
    toggleWishlist({ id: 'p1', slug: 'tee', name: 'Tee', category: { name: 'Tees' }, image: { url: 'u' } });
    expect(useAppStore.getState().isItemInWishlist('p1')).toBe(true);
    toggleWishlist({ id: 'p1', slug: 'tee', name: 'Tee' });
    expect(useAppStore.getState().isItemInWishlist('p1')).toBe(false);
    expect(typeof isItemInWishlist).toBe('function');
  });
});

describe('currency store', () => {
  it('persists only a manual choice and never auth data', async () => {
    const { useCurrencyStore } = await import('../store/useCurrencyStore');
    localStorage.clear();
    useCurrencyStore.setState({ currency: 'PKR', source: 'detected' });
    const before = localStorage.getItem('pehanly-currency-v1');
    expect(before === null || JSON.parse(before).state.currency === undefined).toBe(true);
    useCurrencyStore.getState().setCurrency('USD');
    const saved = JSON.parse(localStorage.getItem('pehanly-currency-v1'));
    expect(saved.state).toEqual({ currency: 'USD', source: 'manual' });
    useCurrencyStore.getState().setCurrency('EUR');
    expect(useCurrencyStore.getState().currency).toBe('USD');
    // a stored manual choice beats detection
    useCurrencyStore.getState().initDetected();
    expect(useCurrencyStore.getState().currency).toBe('USD');
  });
});
