import React from 'react';
import Header from './Header';
import Footer from './Footer';
import SearchModal from './SearchModal';
import { useApp } from '../context/AppContext';

export default function Layout({ children }) {
  const { toastMessage } = useApp();

  return (
    <div className="flex flex-col min-h-screen bg-surface font-body text-on-surface antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg"
      >
        Skip to main content
      </a>
      {/* Shared Global Master Header */}
      <Header />

      {/* Global Search Modal */}
      <SearchModal />

      {/* Global Toast Notification */}
      <div
        role="status"
        aria-live="polite"
        className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 transform flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-full shadow-2xl ${
          toastMessage ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
        }`}
        id="toast-notification"
      >
        <span className="material-symbols-outlined text-[18px] text-accent">check_circle</span>
        <span className="text-xs uppercase tracking-wider font-semibold">
          {toastMessage || ''}
        </span>
      </div>

      {/* Page Specific Main Content */}
      <main id="main-content" tabIndex={-1} className="flex-grow flex flex-col relative w-full pt-[115px] outline-none">
        {children}
      </main>

      {/* Shared Global Master Footer */}
      <Footer />
    </div>
  );
}
