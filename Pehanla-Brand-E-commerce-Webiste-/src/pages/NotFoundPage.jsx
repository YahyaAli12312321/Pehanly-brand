import React from 'react';
import { Link } from 'react-router-dom';
import Seo from '../seo/Seo';

export default function NotFoundPage({ title = 'Page not found', text = 'The page you are looking for does not exist or has moved.' }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-28">
      <Seo title={title} noindex />
      <span className="font-headline text-7xl font-extrabold text-primary/20" aria-hidden="true">404</span>
      <h1 className="font-headline text-3xl font-bold text-primary mt-2">{title}</h1>
      <p className="text-muted mt-3 max-w-md">{text}</p>
      <div className="flex flex-wrap gap-3 justify-center mt-8">
        <Link to="/" className="px-6 py-3 rounded-xl bg-primary text-white font-headline text-sm font-semibold hover:bg-primary-light transition-colors">Back to home</Link>
        <Link to="/shop" className="px-6 py-3 rounded-xl bg-surface-card border border-border-subtle text-primary font-headline text-sm font-semibold hover:border-primary transition-colors">Browse the shop</Link>
      </div>
    </div>
  );
}
