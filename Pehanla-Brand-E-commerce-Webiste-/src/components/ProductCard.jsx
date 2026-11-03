import React from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import FramedImage from './FramedImage';
import { useCurrency } from '../store/useCurrencyStore';
import { formatMoney, priceRange, soldIn } from '../utils/currency';

/** Storefront product card, shared by the Shop page and dedicated section pages (e.g. Under Garments). */
export default function ProductCard({ item, idx = 0, showSizes = false }) {
  const { toggleWishlist, isItemInWishlist } = useApp();
  const { currency } = useCurrency();
  const money = (amount) => formatMoney(amount, currency);
  const saved = isItemInWishlist(item.id);
  const badge = item.isBestSeller ? 'Best Seller' : item.isNewArrival ? 'New Arrival' : item.isFeatured ? 'Featured' : null;
  return (
    <article className="group h-full bg-surface-card rounded-xl border border-border-subtle shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden relative">
      <div className="relative w-full aspect-3/4 bg-surface-container overflow-hidden">
        <Link to={`/product/${item.slug}`} aria-label={`View ${item.name}`} tabIndex={-1}>
          {item.image?.url ? (
            <FramedImage
              src={item.image.url}
              alt={item.image.alt || item.name}
              eager={idx < 3}
              hoverZoom
              width={600}
              height={800}
              ratio={0.75}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted"><span className="material-symbols-outlined text-4xl" aria-hidden="true">checkroom</span></div>
          )}
        </Link>
        {badge && (
          <div className="absolute top-3 left-3 z-10">
            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider shadow-xs bg-accent text-primary">{badge}</span>
          </div>
        )}
        {!item.inStock && (
          <div className="absolute bottom-3 left-3 z-10">
            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-primary text-white">Sold out</span>
          </div>
        )}
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? `Remove ${item.name} from wishlist` : `Save ${item.name} to wishlist`}
          onClick={() => toggleWishlist(item)}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur text-primary hover:text-red-600 shadow-sm flex items-center justify-center transition-transform hover:scale-110 z-10 cursor-pointer"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true" style={saved ? { fontVariationSettings: "'FILL' 1", color: '#dc2626' } : {}}>favorite</span>
        </button>
        <div className="absolute inset-x-3 bottom-3 translate-y-12 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 transition-all duration-300 z-10">
          <Link to={`/product/${item.slug}`} className="w-full bg-primary hover:bg-primary-light text-white py-2 rounded text-[11px] uppercase tracking-wider font-bold shadow-md transition-colors flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">add_shopping_cart</span>
            <span>Select Size</span>
          </Link>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-widest text-muted font-bold">{item.category?.name}</span>
            {item.colors?.length > 0 && (
              <div className="flex items-center gap-1" aria-label={`${item.colors.length} colors`}>
                {item.colors.slice(0, 5).map((c, i) => (
                  <span key={i} title={c.name} className="w-2.5 h-2.5 rounded-full border border-border-subtle inline-block" style={{ backgroundColor: c.hexCode || '#ccc' }} />
                ))}
              </div>
            )}
          </div>
          <h2 className="font-headline text-sm font-bold text-primary group-hover:text-accent transition-colors line-clamp-1">
            <Link to={`/product/${item.slug}`}>{item.name}</Link>
          </h2>
          {item.shortDescription && <p className="text-xs text-muted mt-0.5 line-clamp-1">{item.shortDescription}</p>}
        </div>
        {showSizes && item.sizes?.length > 0 && (
    <p className="text-[11px] text-muted -mt-1 line-clamp-1" data-testid="card-sizes">Sizes: {item.sizes.join(', ')}</p>
  )}
  <div className="flex items-baseline justify-between pt-1 border-t border-border-subtle">
          <span className="font-headline text-base font-bold text-primary">
            {(() => {
              const r = priceRange(item, currency);
              if (r.min == null || !soldIn(item, currency)) return currency === 'PKR' ? 'Unavailable' : `Not sold in ${currency}`;
              return r.max > r.min ? `From ${money(r.min)}` : money(r.min);
            })()}
          </span>
          <span className="text-[10px] text-muted font-semibold">{item.inStock ? 'In Stock' : 'Out of stock'}</span>
        </div>
      </div>
    </article>
  );
}
