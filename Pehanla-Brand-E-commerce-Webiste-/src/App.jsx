import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import RouterBridge from './components/RouterBridge';
import { LoadingBlock } from './components/StateViews';
import { useSessionBootstrap } from './hooks/useQueries';

// Route-level code splitting: each page is its own chunk.
const HomePage = lazy(() => import('./pages/HomePage'));
const ShopPage = lazy(() => import('./pages/ShopPage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const CustomManufacturingPage = lazy(() => import('./pages/CustomManufacturingPage'));
const ManufacturingDetailPage = lazy(() => import('./pages/ManufacturingDetailPage'));
const PrintingBrandingPage = lazy(() => import('./pages/PrintingBrandingPage'));
const WholesalePage = lazy(() => import('./pages/WholesalePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const WishlistPage = lazy(() => import('./pages/WishlistPage'));
const TrackOrderPage = lazy(() => import('./pages/TrackOrderPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function AppContent() {
  useSessionBootstrap();

  return (
    <Layout>
      <Suspense fallback={<LoadingBlock label="Loading page…" className="py-40" />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/shop/:category" element={<ShopPage />} />
          <Route path="/product/:slug" element={<ProductDetailPage />} />
          <Route path="/custom-manufacturing" element={<CustomManufacturingPage />} />
          <Route path="/custom-manufacturing/:categorySlug" element={<ManufacturingDetailPage />} />
          <Route path="/printing-branding" element={<PrintingBrandingPage />} />
          <Route path="/wholesale" element={<WholesalePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-confirmation" element={<CheckoutPage />} />
          <Route path="/track-order" element={<TrackOrderPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <RouterBridge />
      <AppContent />
    </AppProvider>
  );
}
