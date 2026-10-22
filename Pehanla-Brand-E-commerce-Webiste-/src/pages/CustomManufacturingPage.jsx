import React from 'react';
import { Link } from 'react-router-dom';
import { useManufacturingCategoriesQuery } from '../hooks/useQueries';
import Seo from '../seo/Seo';
import { breadcrumbSchema } from '../seo/schema';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/StateViews';
import { isLadiesShoes } from '../utils/product';

export const categoryImage = (c) => c?.image?.url || c?.media?.[0]?.url || c?.heroImage?.url || '';

const STEPS = [
  ['Choose a garment', 'Pick a category and style from our manufacturing catalogue.'],
  ['Send your brief', 'Tell us the quantity, fabric, colours and any branding you need.'],
  ['Receive a quote', 'Our team reviews your request and replies with a quote.'],
  ['Production', 'Once you accept the quote, production is scheduled and tracked with you.'],
];

export default function CustomManufacturingPage() {
  const { data, isLoading, isError, error, refetch } = useManufacturingCategoriesQuery();
  // Business rule: Ladies' Shoes are retail only and never offered for manufacturing.
  const categories = (Array.isArray(data) ? data : data?.items || []).filter((c) => !isLadiesShoes(c));

  return (
    <div className="w-full flex flex-col bg-surface">
      <Seo
        title="Custom Clothing Manufacturing"
        description="Private-label and custom apparel manufacturing from PEHAN LY. Choose a garment, send your brief and receive a quote."
        path="/custom-manufacturing"
        jsonLd={[breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Custom Manufacturing', path: '/custom-manufacturing' }])]}
      />

      <section className="w-full px-4 sm:px-8 lg:px-12 py-14 lg:py-20 bg-surface-container-low border-b border-border-subtle">
        <div className="max-w-5xl mx-auto flex flex-col gap-5">
          <span className="text-xs uppercase tracking-widest font-bold text-primary">Custom Production Atelier</span>
          <h1 className="font-headline font-bold text-4xl sm:text-5xl lg:text-6xl text-primary leading-tight">Custom Manufacturing, Made for Your Brand.</h1>
          <p className="text-base lg:text-lg text-muted max-w-2xl">From private-label collections to uniforms and team wear, send us your idea and we will quote the production.</p>
          <div className="flex flex-wrap gap-4 pt-2">
            <a href="#categories" className="h-12 px-8 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-lg flex items-center">Browse garments</a>
            <Link to="/printing-branding" className="h-12 px-8 border-2 border-primary text-primary text-xs font-bold uppercase tracking-widest rounded-lg flex items-center">Printing &amp; Branding</Link>
          </div>
        </div>
      </section>

      <section id="categories" aria-labelledby="mf-cats" className="w-full px-4 sm:px-8 lg:px-12 py-16 scroll-mt-28">
        <div className="max-w-7xl mx-auto">
          <h2 id="mf-cats" className="font-headline font-bold text-3xl text-primary mb-8">Garments We Manufacture</h2>
          {isLoading ? <LoadingBlock label="Loading catalogue…" /> : isError ? <ErrorBlock error={error} onRetry={refetch} /> : categories.length === 0 ? (
            <EmptyBlock icon="factory" title="Catalogue coming soon" text="Our manufacturing catalogue is being updated. Please check back shortly." />
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {categories.map((c) => (
                <li key={c._id || c.id || c.slug}>
                  <Link to={`/custom-manufacturing/${c.slug}`} className="group block bg-white border border-border-subtle rounded-2xl overflow-hidden hover:shadow-lg transition-shadow h-full">
                    <div className="aspect-4/3 bg-surface-container overflow-hidden">
                      {categoryImage(c) ? (
                        <img src={categoryImage(c)} alt={c.name} width="640" height="480" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : <div className="w-full h-full flex items-center justify-center text-muted"><span className="material-symbols-outlined text-5xl" aria-hidden="true">checkroom</span></div>}
                    </div>
                    <div className="p-5">
                      <h3 className="font-headline font-bold text-lg text-primary">{c.name}</h3>
                      {c.description && <p className="text-sm text-muted mt-1 line-clamp-2">{c.description}</p>}
                      <span className="inline-block mt-3 text-xs font-bold uppercase tracking-wider text-primary underline">View styles</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="mf-how" className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface-card border-t border-border-subtle">
        <div className="max-w-5xl mx-auto">
          <h2 id="mf-how" className="font-headline font-bold text-3xl text-primary mb-8">How It Works</h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="bg-surface rounded-xl border border-border-subtle p-5">
                <span className="font-headline text-xs font-bold text-accent">0{i + 1}</span>
                <h3 className="font-headline font-bold text-primary mt-1">{t}</h3>
                <p className="text-sm text-muted mt-1">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}
