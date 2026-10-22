import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { buildPath } from '../routes';

/**
 * Client/UI state only. Server state (catalog, orders, account data) lives in
 * TanStack Query. The cart and wishlist are intentionally device-local
 * (the backend has no cart/wishlist API); every price shown from them is
 * re-validated against the live catalog and re-computed by the backend at checkout.
 */

const MAX_LINE_QTY = 20; // mirrors the backend's public maxQuantity cap

let routerNavigate = null;
/** Registered once by <RouterBridge/> so non-component code can navigate. */
export const registerNavigator = (fn) => {
  routerNavigate = fn;
};

const safeStorage = () => {
  try {
    const key = '__pl_probe__';
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
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

let toastTimer = null;

export const useAppStore = create(
  persist(
    (set, get) => ({
      // 1. ROUTING (URL is the source of truth; these are mirrored by <RouterBridge/>)
      currentRoute: 'home',
      routeParams: {},
      setRouteState: (currentRoute, routeParams) => set({ currentRoute, routeParams }),
      navigate: (route, params = {}) => {
        const target = buildPath(route, params);
        if (routerNavigate) routerNavigate(target);
        else if (typeof window !== 'undefined') window.location.assign(target);
      },

      // 2. SESSION (the HttpOnly cookie is the credential; no token ever touches JS)
      user: null,
      isAuthenticated: false,
      authStatus: 'loading', // 'loading' | 'authenticated' | 'guest'
      setUser: (user) =>
        set({ user: user || null, isAuthenticated: Boolean(user), authStatus: user ? 'authenticated' : 'guest' }),
      clearSession: () => set({ user: null, isAuthenticated: false, authStatus: 'guest', couponCode: '' }),

      // Coupon code entered by a signed-in customer. Session-only (not persisted);
      // the backend re-validates and prices it on every use.
      couponCode: '',
      setCouponCode: (code) => set({ couponCode: code || '' }),
      logout: () => set({ user: null, isAuthenticated: false, authStatus: 'guest' }),

      // 3. CART (lines keyed by SKU id)
      cartItems: [],
      setCartItems: (items) => set({ cartItems: items }),
      addToCart: (line, quantity = 1) => {
        if (!line?.id) return false;
        const { cartItems, showToast } = get();
        if (Number.isFinite(line.maxQuantity) && line.maxQuantity < 1) {
          showToast('This size is currently out of stock');
          return false;
        }
        const cap = Math.min(line.maxQuantity || MAX_LINE_QTY, MAX_LINE_QTY);
        const existing = cartItems.find((item) => item.id === line.id);
        const nextQty = Math.min((existing?.qty || 0) + quantity, cap);
        if (existing && existing.qty >= cap) {
          showToast(`Maximum of ${cap} per item for this size`);
          return false;
        }
        set({
          cartItems: existing
            ? cartItems.map((item) => (item.id === line.id ? { ...item, ...line, qty: nextQty } : item))
            : [...cartItems, { ...line, qty: nextQty }],
        });
        showToast(`Added ${line.name} to bag`);
        return true;
      },
      removeFromCart: (id) => {
        set({ cartItems: get().cartItems.filter((item) => item.id !== id) });
        get().showToast('Removed item from bag');
      },
      updateCartQty: (id, delta) => {
        set({
          cartItems: get()
            .cartItems.map((item) => {
              if (item.id !== id) return item;
              const cap = Math.min(item.maxQuantity || MAX_LINE_QTY, MAX_LINE_QTY);
              const qty = Math.min(item.qty + delta, cap);
              return qty > 0 ? { ...item, qty } : null;
            })
            .filter(Boolean),
        });
      },
      /** Refresh display data (price, stock cap, image) from the live catalog. */
      syncCartLine: (id, patch) =>
        set({ cartItems: get().cartItems.map((item) => (item.id === id ? { ...item, ...patch } : item)) }),
      clearCart: () => set({ cartItems: [], couponCode: '' }),

      // 4. WISHLIST (device-local list of products)
      wishlistItems: [],
      setWishlistItems: (items) => set({ wishlistItems: items }),
      toggleWishlist: (product) => {
        const { wishlistItems, showToast } = get();
        const key = product.id;
        if (!key) return;
        if (wishlistItems.some((w) => w.id === key)) {
          set({ wishlistItems: wishlistItems.filter((w) => w.id !== key) });
          showToast('Removed from your wishlist');
        } else {
          set({
            wishlistItems: [
              ...wishlistItems,
              {
                id: product.id,
                slug: product.slug,
                name: product.name,
                category: product.category?.name || product.category || '',
                image: product.image?.url || product.image || '',
              },
            ],
          });
          showToast(`Saved ${product.name} to wishlist`);
        }
      },
      isItemInWishlist: (id) => get().wishlistItems.some((w) => w.id === id),

      // 5. SHARED UI STATE
      isSearchOpen: false,
      setIsSearchOpen: (isOpen) => set({ isSearchOpen: isOpen }),

      toastMessage: null,
      showToast: (message) => {
        set({ toastMessage: message });
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
          if (get().toastMessage === message) set({ toastMessage: null });
        }, 3200);
      },
    }),
    {
      name: 'pehanly-device-v1',
      version: 1,
      storage: createJSONStorage(safeStorage),
      // Persist only device-local shopping state - never session/auth data.
      partialize: (state) => ({ cartItems: state.cartItems, wishlistItems: state.wishlistItems }),
    },
  ),
);
