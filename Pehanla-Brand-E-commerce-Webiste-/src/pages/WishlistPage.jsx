import React from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useProductQuery } from '../hooks/useQueries';
import Seo from '../seo/Seo';
import { useCurrency } from '../store/useCurrencyStore';
import { formatMoney, priceRange } from '../utils/currency';

function WishlistCard({ item, onRemove }) {
  const { currency } = useCurrency();
  // Live price/availability; the saved snapshot only holds name/image.
  const { data: product, isError, error } = useProductQuery(item.slug);
  const gone = isError && error?.status === 404;
  return (
    <li className="group bg-surface-card rounded-xl border border-border-subtle overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow">
      <div className="relative aspect-3/4 overflow-hidden bg-surface-container">
        <Link to={`/product/${item.slug}`} tabIndex={-1} aria-hidden="true">
          {(product?.image?.url || item.image) && (
            <img src={product?.image?.url || item.image} alt="" width="400" height="533" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          )}
        </Link>
        <button type="button" onClick={() => onRemove(item)} aria-label={`Remove ${item.name} from wishlist`} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center cursor-pointer">
          <span className="material-symbols-outlined text-[18px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">favorite</span>
        </button>
      </div>
      <div className="p-4 flex flex-col gap-2">
        <span className="text-[10px] uppercase font-bold text-muted tracking-wider">{product?.category?.name || item.category}</span>
        <h2 className="font-headline font-bold text-sm text-primary line-clamp-1"><Link to={`/product/${item.slug}`}>{item.name}</Link></h2>
        <div className="text-sm font-bold text-primary min-h-5">
          {gone ? <span className="text-error text-xs">No longer available</span> : priceRange(product, currency).min != null ? formatMoney(priceRange(product, currency).min, currency) : currency === 'PKR' ? '' : `Not sold in ${currency}`}
        </div>
        {!gone && (
          <Link to={`/product/${item.slug}`} className="mt-3 w-full py-2.5 bg-accent hover:bg-accent-light text-primary font-bold text-xs uppercase tracking-wider rounded transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">shopping_bag</span>
            <span>Select size</span>
          </Link>
        )}
      </div>
    </li>
  );
}

export default function WishlistPage() {
  const { wishlistItems, toggleWishlist } = useApp();
  return (
    <div className="w-full flex flex-col">
      <Seo title="Wishlist" noindex />
      <nav aria-label="Breadcrumb" className="bg-surface border-b border-border-subtle py-3 px-4 sm:px-8">
        <ol className="max-w-7xl mx-auto flex items-center text-xs text-muted">
          <li><Link to="/" className="hover:text-primary transition-colors">Home</Link></li>
          <li className="mx-2" aria-hidden="true">/</li>
          <li className="text-primary font-semibold" aria-current="page">Saved Wishlist ({wishlistItems.length})</li>
        </ol>
      </nav>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 w-full">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 pb-4 border-b border-border-subtle gap-2">
          <div>
            <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-primary">Your Saved Garments</h1>
            <p className="text-xs text-muted mt-1">Pieces you have saved on this device.</p>
          </div>
          <span className="text-xs font-semibold text-primary">{wishlistItems.length} Saved {wishlistItems.length === 1 ? 'Item' : 'Items'}</span>
        </div>
        {wishlistItems.length === 0 ? (
          <div className="bg-surface-card rounded-2xl border border-border-subtle p-12 text-center flex flex-col items-center max-w-md mx-auto my-12">
            <span className="material-symbols-outlined text-6xl text-muted/30 mb-4" aria-hidden="true">favorite_border</span>
            <h2 className="font-headline text-xl font-bold text-primary">Your Wishlist is Empty</h2>
            <p className="text-xs text-muted mt-2">Tap the heart on any piece to save it here.</p>
            <Link to="/shop" className="mt-6 px-8 py-3 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-primary-light transition-all">Explore Shop</Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {wishlistItems.map((item) => <WishlistCard key={item.id} item={item} onRemove={toggleWishlist} />)}
          </ul>
        )}
      </div>
    </div>
  );
}
