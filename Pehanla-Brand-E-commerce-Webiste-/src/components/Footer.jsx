import React from 'react';
import { Link } from 'react-router-dom';
import { buildPath } from '../routes';
import { useCategoriesQuery, usePublicSettingsQuery } from '../hooks/useQueries';
import BrandIcon from './BrandIcon';
import { resolveSocialLinks } from '../config/social';

const linkClass = 'text-xs text-[#B8C4BE] hover:text-white transition-colors';
/** Contact row: icon + text, so it reads as information rather than as a second set of social buttons. */
const contactLinkClass =
  'group inline-flex items-center gap-2.5 text-xs text-[#B8C4BE] hover:text-white transition-colors focus-visible:outline-none focus-visible:text-white';
const contactIconClass =
  'w-7 h-7 shrink-0 rounded-full border border-white/10 bg-primary-light/40 flex items-center justify-center text-accent group-hover:border-accent/70 group-hover:bg-accent/15 transition-colors';
/** Social buttons: one size, one weight, accent-on-hover with a soft lift. */
const socialLinkClass =
  'w-10 h-10 rounded-full border border-white/15 bg-primary-light/40 text-[#B8C4BE] flex items-center justify-center ' +
  'transition-[transform,background-color,border-color,color,box-shadow] duration-300 ease-out ' +
  'hover:bg-accent hover:text-primary hover:border-accent hover:shadow-[0_10px_22px_-10px_rgba(168,189,36,0.9)] ' +
  'motion-safe:hover:-translate-y-0.5 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-primary';

export default function Footer() {
  const { data: settings } = usePublicSettingsQuery();
  const { data: categories } = useCategoriesQuery();

  const contact = settings?.contact || {};
  const social = settings?.social || {};
  const whatsappDigits = String(contact.whatsapp || '').replace(/\D/g, '');
  const storeName = settings?.storeName || 'PEHAN LY';
  // Merchant-managed in Admin -> Settings -> Social, with config/social.js fallbacks. Missing profiles are not rendered.
  const socialLinks = resolveSocialLinks(social);

  return (
    <footer className="w-full bg-primary text-white mt-12 border-t border-primary-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16 flex flex-col gap-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-primary-light/40">
          {/* Column 1: Brand Info */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full overflow-hidden border border-white/20 bg-white">
                <img
                  alt=""
                  width="44"
                  height="44"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBeGX3L9aXBU45grhMFspI3AiZB6T4v5m19xs0sAGii4OqA-OQO6eP5P2oqtf1ZMzl28XB2bGbi-aftJ8vy-JTE0uGDsl58LmNglvP2-gXXHOO1uwYjlWu6wJzInDLLh7id0C86q47kwYf5j9K5xCX_-OnOs9sZJOSOnRNZLP5XZ0wATeumKOTT_64xrO_YLRrtIHaOzOx8ZTz919p3FcE7f0kBFNd3M2i0sxo-7GvEJz0w3r5DqUXLkv_zQqeWCZshiA"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-headline font-bold text-xl tracking-wider text-white">PEHANLY</span>
                <span className="font-urdu text-sm text-accent font-bold">پہنو اپنی پہچان</span>
              </div>
            </div>
            <p className="text-xs text-[#B8C4BE] leading-relaxed max-w-sm">
              High-density apparel engineered for modern confidence. Direct retail, scalable B2B wholesale, custom manufacturing and printing &amp; branding.
            </p>
            {contact.address && <p className="text-xs text-[#B8C4BE] leading-relaxed max-w-sm">{contact.address}</p>}
            <ul className="flex flex-col gap-2.5 pt-2">
              {whatsappDigits && (
                <li>
                  <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noopener noreferrer" className={contactLinkClass}>
                    <span className={contactIconClass}><BrandIcon name="whatsapp" className="w-[15px] h-[15px]" /></span>
                    <span>Chat on WhatsApp</span>
                  </a>
                </li>
              )}
              {contact.email && (
                <li>
                  <a href={`mailto:${contact.email}`} className={contactLinkClass}>
                    <span className={contactIconClass}><span className="material-symbols-outlined text-[16px]" aria-hidden="true">mail</span></span>
                    <span className="break-all">{contact.email}</span>
                  </a>
                </li>
              )}
              {contact.phone && (
                <li>
                  <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className={contactLinkClass}>
                    <span className={contactIconClass}><span className="material-symbols-outlined text-[16px]" aria-hidden="true">call</span></span>
                    <span>{contact.phone}</span>
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Column 2: Retail Shop (live categories) */}
          <nav aria-label="Shop" className="flex flex-col gap-3">
            <h2 className="font-headline text-xs uppercase tracking-widest font-bold text-accent">Shop Retail</h2>
            <Link className={linkClass} to={buildPath('shop')}>All Products</Link>
            {(categories || []).slice(0, 8).map((c) => (
              <Link key={c.id} className={linkClass} to={buildPath('shop', { category: c.slug })}>
                {c.name}
              </Link>
            ))}
          </nav>

          {/* Column 3: Business & B2B */}
          <nav aria-label="Business" className="flex flex-col gap-3">
            <h2 className="font-headline text-xs uppercase tracking-widest font-bold text-accent">Business &amp; B2B</h2>
            <Link className={linkClass} to={buildPath('wholesale')}>Wholesale &amp; Bulk Orders</Link>
            <Link className={linkClass} to={buildPath('custom-manufacturing')}>Custom Manufacturing</Link>
            <Link className={linkClass} to={buildPath('printing-branding')}>Printing &amp; Branding</Link>
          </nav>

          {/* Column 4: Customer Care */}
          <nav aria-label="Customer care" className="flex flex-col gap-3">
            <h2 className="font-headline text-xs uppercase tracking-widest font-bold text-accent">Customer Care</h2>
            <Link className={linkClass} to={buildPath('track-order')}>Track Your Order</Link>
            <Link className={linkClass} to={buildPath('account')}>My Account</Link>
            <Link className={linkClass} to={buildPath('wishlist')}>Wishlist</Link>
            <Link className={linkClass} to={buildPath('about')}>About {storeName}</Link>
            {settings?.returns?.enabled && (
              <span className="text-xs text-[#B8C4BE]">Returns accepted within {settings.returns.windowDays} days</span>
            )}
          </nav>
        </div>

        {/* Social media */}
        {socialLinks.length > 0 && (
          <section
            aria-labelledby="footer-social-heading"
            className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6 pb-10 -mt-4 border-b border-primary-light/40"
          >
            <div className="text-center sm:text-left">
              <h2 id="footer-social-heading" className="font-headline text-xs uppercase tracking-widest font-bold text-accent">
                Follow {storeName}
              </h2>
              <p className="text-xs text-[#B8C4BE] mt-1.5">New drops, behind the seams and restock alerts.</p>
            </div>
            <ul className="flex flex-wrap items-center justify-center gap-3 sm:gap-3.5">
              {socialLinks.map(({ key, label, url }) => (
                <li key={key}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer me"
                    aria-label={`${storeName} on ${label}`}
                    title={label}
                    className={socialLinkClass}
                  >
                    <BrandIcon name={key} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Payment methods & Copyright */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-[#B8C4BE]">
          <div className="flex items-center gap-2">
            <span>© {new Date().getFullYear()} {storeName}. All rights reserved.</span>
            <span className="hidden sm:inline" aria-hidden="true">•</span>
            <span className="font-urdu text-xs text-accent hidden sm:inline">پہنو اپنی پہچان</span>
          </div>
          {(settings?.checkout?.codEnabled || settings?.checkout?.jazzcashManual?.enabled) && (
            <ul className="flex flex-wrap items-center gap-2 text-[10px] font-semibold" aria-label="Payment methods">
              {settings?.checkout?.codEnabled && <li className="px-2.5 py-1 bg-primary-light/50 border border-white/10 text-white rounded">Cash on Delivery (Karachi)</li>}
              {settings?.checkout?.jazzcashManual?.enabled && <li className="px-2.5 py-1 bg-primary-light/50 border border-white/10 text-white rounded">JazzCash Wallet</li>}
            </ul>
          )}
        </div>
      </div>
    </footer>
  );
}
