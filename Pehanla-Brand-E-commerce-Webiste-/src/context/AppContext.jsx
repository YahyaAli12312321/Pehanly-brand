import React, { createContext, useContext, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';

const AppContext = createContext(null);

/** Thin facade over the Zustand store so existing pages keep using `useApp()`. */
export function AppProvider({ children }) {
  const store = useAppStore();

  const value = useMemo(
    () => ({
      ...store,
      cartTotalQty: store.cartItems.reduce((acc, item) => acc + item.qty, 0),
      wishlistCount: store.wishlistItems.length,
    }),
    [store],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside <AppProvider>');
  return context;
}
