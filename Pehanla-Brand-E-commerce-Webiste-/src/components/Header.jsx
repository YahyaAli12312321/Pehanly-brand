import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { buildPath } from '../routes';
import { useFreeShippingInfoQuery, usePublicSettingsQuery } from '../hooks/useQueries';
import { formatMoney } from '../utils/currency';
import { useCurrency } from '../store/useCurrencyStore';
import CurrencySelector from './CurrencySelector';

export default function Header() {
  const {
    currentRoute,
    cartTotalQty,
    wishlistCount,
    setIsSearchOpen
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const drawerRef = useRef(null);
  const menuButtonRef = useRef(null);
  const { data: settings } = usePublicSettingsQuery();
  const { currency } = useCurrency();
  const { data: freeShipping } = useFreeShippingInfoQuery(currency);
  // Cash on delivery is only offered where the backend says a currency can use it (PKR today).
  const codHere = settings?.checkout?.codEnabled && (settings?.currencies?.paymentMethods?.[currency] ?? (currency === 'PKR' ? ['cod'] : [])).includes('cod');

  // Announcement text comes from store settings / real shipping rules - never hardcoded promises.
  const announcement =
    settings?.announcement?.text ||
    [
      freeShipping?.available ? `FREE SHIPPING ON ORDERS ABOVE ${formatMoney(freeShipping.minimumOrderAmount, currency).toUpperCase()}` : null,
      codHere ? 'CASH ON DELIVERY AVAILABLE' : null,
    ]
      .filter(Boolean)
      .join(' • ');

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    drawerRef.current?.querySelector('a,button')?.focus();
    const menuButton = menuButtonRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      menuButton?.focus();
    };
  }, [mobileMenuOpen]);

  const navLinks = [
    { label: 'Home', route: 'home' },
    { label: 'Shop', route: 'shop' },
    { label: 'Custom Manufacturing', route: 'custom-manufacturing' },
    { label: 'Printing & Branding', route: 'printing-branding' },
    { label: 'Wholesale & Bulk Orders', route: 'wholesale' },
    { label: 'About', route: 'about' }
  ];

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <>
      {/* 1. Top Notification & Announcement Bar */}
      <div className="bg-primary text-white py-2 px-4 text-center text-[11px] font-semibold tracking-wider uppercase border-b border-primary-dark/40 fixed top-0 w-full z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="hidden sm:flex items-center gap-2 text-accent text-[11px]">
            <span className="material-symbols-outlined text-[15px]">verified</span>
            <span className="tracking-widest">OFFICIAL ATELIER STORE</span>
          </div>
          <div className="flex-1 flex items-center justify-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
            {announcement && <span>{announcement}</span>}
            {announcement && <span className="text-white/40 hidden md:inline">|</span>}
            <span className="font-urdu text-[13px] tracking-normal normal-case font-bold text-accent hidden md:inline">
              پہنو اپنی پہچان
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-[10px] tracking-widest text-[#B8C4BE]">
            <Link to={buildPath('wholesale')} className="hover:text-accent transition-colors uppercase">
              B2B PORTAL
            </Link>
            <span aria-hidden="true">•</span>
            <Link to={buildPath('custom-manufacturing')} className="hover:text-accent transition-colors uppercase">
              MANUFACTURING
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Global Header Navigation */}
      <header className="fixed top-[35px] w-full z-40 bg-surface/95 backdrop-blur-xl border-b border-border-subtle transition-all duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-20 flex items-center justify-between gap-6">
          {/* Brand Logo Emblem & Slogan */}
          <Link to="/" aria-label="PEHANLY - home" className="flex items-center gap-3 group shrink-0">
            <div className="relative w-12 h-12 rounded-full overflow-hidden shadow-sm border border-primary/20 bg-primary flex items-center justify-center transition-transform group-hover:scale-105">
              <img
                alt=""
                width="48"
                height="48"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBxMUNvItkOTRIqikBHFaJ1Z-aX1ouWGEfHt5RJASt5unaJeyXeyLh2ZnOmRqjqRBcx-db_jHOthNMhPbU3cbgbeX_Oktxnwnq-t2TWSvdJnlRjp6MEDuiSgswV2JNC96GC6fzw8z9OdnFQ2J0EGozz_ZEh3hbqmVjY17mfgvQgHp29Jqc7P2l8VMwkyNM9dMLG5mtBF1d4T1O_Qg8gPJMGWvY8gutrZeYabX0hXKuQY-Rpy2L_gizASNytW4C-TIvR7A"
              />
            </div>
            <div className="flex flex-col">
              <span className="font-headline font-extrabold text-2xl tracking-wider text-primary leading-none">
                PEHANLY
              </span>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[9px] uppercase tracking-[0.22em] text-muted font-bold">
                  Wear Your Identity
                </span>
              </div>
            </div>
          </Link>

          {/* Primary Navigation Links (Route-Aware Active State) */}
          <nav aria-label="Primary" className="hidden lg:flex items-center gap-5 xl:gap-7">
            {navLinks.map((link) => {
              const isActive = currentRoute === link.route ||
                (link.route === 'custom-manufacturing' && currentRoute === 'manufacturing-detail') ||
                (link.route === 'shop' && currentRoute === 'product-detail');
              return (
                <Link
                  key={link.route}
                  to={buildPath(link.route)}
                  aria-current={isActive ? 'page' : undefined}
                  className={
                    isActive
                      ? "text-[13px] font-semibold tracking-wide text-primary relative whitespace-nowrap after:absolute after:bottom-[-4px] after:left-0 after:w-full after:h-[2px] after:bg-[#173B32] transition-colors duration-200"
                      : "text-[13px] font-medium tracking-wide text-muted hover:text-primary whitespace-nowrap transition-colors duration-200"
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right Utility Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Currency (tablet/desktop; the mobile drawer has its own full-width selector) */}
            <CurrencySelector variant="compact" id="currency-select-header" className="hidden sm:inline-flex" />

            {/* Search Trigger */}
            <button
              type="button"
              aria-label="Search Catalog"
              aria-haspopup="dialog"
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface-card border border-border-subtle hover:border-primary/40 rounded-full text-muted hover:text-primary transition-all shadow-sm cursor-pointer"
              id="search-open-btn"
            >
              <span className="material-symbols-outlined text-[19px]">search</span>
              <span className="text-xs font-medium pr-2 hidden md:inline">Search</span>
            </button>

            {/* Wishlist Button with Dynamic Count */}
            <Link
              aria-label={`Wishlist (${wishlistCount} items)`}
              to={buildPath('wishlist')}
              className="relative p-2 rounded-full hover:bg-surface-container text-muted hover:text-primary transition-colors cursor-pointer"
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={currentRoute === 'wishlist' ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                favorite
              </span>
              <span
                className="absolute top-1 right-1 w-4 h-4 bg-primary text-white text-[9px] font-bold flex items-center justify-center rounded-full"
                id="wishlist-badge"
              >
                {wishlistCount}
              </span>
            </Link>

            {/* Account / Customer Portal */}
            <Link
              aria-label="Account"
              to={buildPath('account')}
              className="flex items-center gap-1 p-2 rounded-full hover:bg-surface-container text-muted hover:text-primary transition-colors cursor-pointer"
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={currentRoute === 'account' ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                person
              </span>
            </Link>

            {/* Shopping Bag / Cart with Dynamic Badge */}
            <Link
              aria-label={`Cart (${cartTotalQty} items)`}
              to={buildPath('cart')}
              className="relative p-2 rounded-full bg-surface-card border border-border-subtle hover:border-primary text-primary transition-all shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[22px]">shopping_bag</span>
              <span
                className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-primary text-[10px] font-black flex items-center justify-center rounded-full shadow-sm"
                id="cart-badge"
              >
                {cartTotalQty}
              </span>
            </Link>

            {/* Mobile Menu Toggle Button */}
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Open Navigation Menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-drawer"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-primary hover:text-accent transition-colors cursor-pointer"
              id="mobile-menu-btn"
            >
              <span className="material-symbols-outlined text-[26px]">menu</span>
            </button>
          </div>
        </div>
      </header>

      {/* 3. Mobile Navigation Drawer */}
      <div
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        aria-hidden={!mobileMenuOpen}
        inert={!mobileMenuOpen}
        onClick={(e) => e.target === e.currentTarget && closeMenu()}
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          ref={drawerRef}
          className={`absolute right-0 top-0 w-80 max-w-full h-full bg-surface p-6 flex flex-col justify-between shadow-2xl overflow-y-auto transform transition-transform duration-300 ${
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
              <div className="flex items-center gap-2.5">
                <img
                  alt=""
                  width="32"
                  height="32"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full border border-primary/20"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAyQ4oHSSJW9WjdvXRxGqreMOm0VA9qUUOWsmZq7S_ilnxcxZ0JxS7eAWKxMN7XhaJ9ezC__26TmEkMD1BI2-AqiPEi4XtQqqGLpWOCC93qrk1oa8TwxXEh_HOv7tg5lRQiUNu6YKYkiLCmGdOzhDxj8fbQG25euU2oy3dBCrI69sbtuucAinaFIp1OMctm_8VJf9E11pCivOtmFI2MgigE5W9kzGqxoKfQKqMQBg1p67kM7uZrSXdqE35KrlAtxUr4eg"
                />
                <span className="font-headline font-bold text-lg text-primary tracking-wide">
                  PEHANLY
                </span>
              </div>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={closeMenu}
                className="p-1 text-on-surface hover:text-primary cursor-pointer"
                id="mobile-menu-close"
              >
                <span className="material-symbols-outlined text-2xl">close</span>
              </button>
            </div>

            <div className="sm:hidden">
              <span className="block mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Currency</span>
              <CurrencySelector variant="full" id="currency-select-mobile" className="w-full" />
            </div>

            <nav aria-label="Mobile" className="flex flex-col gap-2 font-headline text-sm font-semibold tracking-wider uppercase">
              {navLinks.map((link) => {
                const isActive = currentRoute === link.route ||
                  (link.route === 'custom-manufacturing' && currentRoute === 'manufacturing-detail') ||
                  (link.route === 'shop' && currentRoute === 'product-detail');
                return (
                  <Link
                    key={link.route}
                    to={buildPath(link.route)}
                    onClick={closeMenu}
                    aria-current={isActive ? 'page' : undefined}
                    className={`py-2.5 border-b border-border-subtle flex items-center justify-between text-sm transition-colors ${
                      isActive
                        ? 'text-primary font-bold border-primary'
                        : 'text-muted hover:text-primary font-medium'
                    }`}
                  >
                    <span>{link.label}</span>
                    <span className="material-symbols-outlined text-base" aria-hidden="true">chevron_right</span>
                  </Link>
                );
              })}

              <div className="pt-3 flex flex-col gap-1">
                <Link
                  to={buildPath('account')}
                  onClick={closeMenu}
                  className="py-2 text-xs font-semibold text-muted hover:text-primary flex items-center gap-2 text-left"
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">person</span>
                  <span>My Account</span>
                </Link>
                <Link
                  to={buildPath('wishlist')}
                  onClick={closeMenu}
                  className="py-2 text-xs font-semibold text-muted hover:text-primary flex items-center gap-2 text-left"
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">favorite</span>
                  <span>Wishlist ({wishlistCount})</span>
                </Link>
                <Link
                  to={buildPath('cart')}
                  onClick={closeMenu}
                  className="py-2 text-xs font-semibold text-muted hover:text-primary flex items-center gap-2 text-left"
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">shopping_bag</span>
                  <span>Cart ({cartTotalQty})</span>
                </Link>
              </div>
            </nav>
          </div>

          <div className="pt-6 border-t border-border-subtle flex flex-col gap-3">
            <Link
              to={buildPath('wholesale')}
              onClick={closeMenu}
              className="block w-full py-3 bg-primary text-white text-xs font-semibold uppercase tracking-widest text-center rounded-lg shadow-sm hover:bg-primary-dark transition-colors"
            >
              Wholesale Inquiry
            </Link>
            <div className="text-center font-urdu text-sm text-primary font-bold">
              پہنو اپنی پہچان
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
