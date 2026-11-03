import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useBannersQuery, useManufacturingCategoriesQuery, useManufacturingStylesQuery, useManufacturingVariantsQuery } from '../hooks/useQueries';
import { manufacturingApi } from '../services/b2bApi';
import InquiryForm from '../components/manufacturing/InquiryForm';
import StyleCard from '../components/manufacturing/StyleCard';
import BannerImage from '../components/BannerImage';
import Seo from '../seo/Seo';
import { breadcrumbSchema } from '../seo/schema';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/StateViews';
import { isLadiesShoes } from '../utils/product';

const list = (d) => (Array.isArray(d) ? d : d?.items || []);
const sid = (x) => x?._id || x?.id;

export const categoryImage = (c) => c?.image?.url || c?.media?.[0]?.url || c?.heroImage?.url || '';

const STEPS = [
  ['Choose a garment', 'Pick a category and style from our manufacturing catalogue.'],
  ['Send your brief', 'Tell us the quantity, fabric, colours and any branding you need.'],
  ['Receive a quote', 'Our team reviews your request and replies with a quote.'],
  ['Production', 'Once you accept the quote, production is scheduled and tracked with you.'],
];

/** Silhouette cards drawn from the real styles of the first categories + a Polo spotlight when one exists. */
function Silhouettes({ categories }) {
  const first = categories.slice(0, 3);
  const results = useQueries({ queries: first.map((c) => ({ queryKey: ['manufacturing', 'styles', sid(c)], queryFn: () => manufacturingApi.styles(sid(c)), staleTime: 10 * 60 * 1000 })) });
  const rows = first.flatMap((c, i) => list(results[i]?.data).map((st) => ({ st, c })));
  const polo = rows.find((r) => /polo/i.test(r.st.name)) || null;
  const rest = rows.filter((r) => r !== polo).slice(0, 6);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="mf-sil" className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface-card border-y border-border-subtle">
      <div className="max-w-7xl mx-auto flex flex-col gap-10">
        <h2 id="mf-sil" className="font-headline font-bold text-3xl text-primary">Signature Silhouettes</h2>
        {polo && <PoloSpotlight style={polo.st} category={polo.c} />}
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {rest.map(({ st }) => (
            <StyleCard key={sid(st)} style={st} onGallery={undefined} onSelect={undefined} compact={false} />
          ))}
        </ul>
        <p className="text-sm text-muted">Open a garment above to see every style, colour and photo, then request a quote for the one you want.</p>
      </div>
    </section>
  );
}

function PoloSpotlight({ style, category }) {
  const { data } = useManufacturingVariantsQuery(sid(style));
  const image = list(data).flatMap((v) => v.media || []).find((m) => m.url)?.url;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center bg-primary text-white rounded-3xl overflow-hidden" data-testid="mf-polo-spotlight">
      <div className="p-8 lg:p-12 flex flex-col gap-3">
        <span className="text-xs uppercase tracking-widest font-bold text-accent">Spotlight</span>
        <h3 className="font-headline font-bold text-3xl">{style.name}</h3>
        {style.description && <p className="text-surface-container-high">{style.description}</p>}
        <Link to={`/custom-manufacturing/${category.slug}`} className="mt-2 h-12 px-8 bg-accent text-primary text-xs font-bold uppercase tracking-widest rounded-lg flex items-center w-fit">Explore {category.name}</Link>
      </div>
      {image && <img src={image} alt={style.name} width="640" height="480" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full max-h-96 object-cover" />}
    </div>
  );
}

function MainInquiry({ categories }) {
  const [categoryId, setCategoryId] = useState('');
  const [styleId, setStyleId] = useState('');
  const [variantId, setVariantId] = useState('');
  const { data: stylesData } = useManufacturingStylesQuery(categoryId);
  const styles = useMemo(() => list(stylesData), [stylesData]);
  const { data: variantsData } = useManufacturingVariantsQuery(styleId);
  const variants = useMemo(() => list(variantsData), [variantsData]);
  useEffect(() => { setStyleId(''); setVariantId(''); }, [categoryId]);
  useEffect(() => { if (styles.length && !styleId) setStyleId(sid(styles[0])); }, [styles, styleId]);
  useEffect(() => setVariantId(''), [styleId]);
  return <InquiryForm categories={categories} categoryId={categoryId} onCategory={setCategoryId} styles={styles} styleId={styleId} onStyle={setStyleId} variants={variants} variantId={variantId} onVariant={setVariantId} />;
}

export default function CustomManufacturingPage() {
  const { data, isLoading, isError, error, refetch } = useManufacturingCategoriesQuery();
  const { data: banners } = useBannersQuery('manufacturing_promo', 1);
  const banner = banners?.[0];
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

      <section aria-labelledby="mf-h1" className="w-full px-4 sm:px-8 lg:px-12 py-10 lg:py-16 bg-surface border-b border-border-subtle" data-testid="mf-hero">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-8 lg:gap-12 items-center">
          <div className="min-w-0 flex flex-col gap-5">
            <span className="w-fit px-3 py-1 rounded-full bg-surface-container text-primary text-[11px] font-bold uppercase tracking-widest">Custom Production Atelier</span>
            <h1 id="mf-h1" className="font-headline font-extrabold text-primary leading-[1.05] text-[clamp(2.25rem,1.5rem+3.2vw,4.25rem)]">From Concept <br className="hidden sm:block" />to <span className="text-[#7d8f12]">Creation.</span></h1>
            <p className="text-base text-muted max-w-xl leading-relaxed">Private-label collections, uniforms and team wear: tell us what you are building and we will quote the production, from pattern to packed garments.</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <a href="#inquiry" className="h-12 px-7 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-lg flex items-center hover:bg-primary-dark transition-colors">Start your inquiry</a>
              <a href="#categories" className="h-12 px-7 bg-white border border-border-subtle text-primary text-xs font-bold uppercase tracking-widest rounded-lg flex items-center hover:bg-surface-container transition-colors">Browse capabilities</a>
              <Link to="/printing-branding" className="h-12 px-3 text-primary text-xs font-bold uppercase tracking-widest rounded-lg flex items-center underline underline-offset-4">Printing &amp; Branding</Link>
            </div>
          </div>
          <figure className="relative min-w-0 m-0" data-testid="mf-hero-visual">
            <BannerImage src={banner?.image?.url} alt={banner?.image?.alt || banner?.title || 'PEHANLY production atelier'} priority icon="precision_manufacturing" className="w-full aspect-[4/3] lg:aspect-[5/4] max-h-[480px] rounded-2xl shadow-lg" />
            {(banner?.title || banner?.subtitle) && (
              <figcaption className="absolute left-3 right-3 bottom-3 sm:right-auto sm:max-w-xs bg-white/95 backdrop-blur rounded-xl p-3 shadow">
                {banner.title && <p className="font-headline font-bold text-sm text-primary m-0">{banner.title}</p>}
                {banner.subtitle && <p className="text-xs text-muted m-0 mt-0.5 line-clamp-2">{banner.subtitle}</p>}
              </figcaption>
            )}
          </figure>
        </div>
      </section>

      <section id="categories" aria-labelledby="mf-cats" className="w-full px-4 sm:px-8 lg:px-12 py-16 scroll-mt-28">
        <div className="max-w-7xl mx-auto">
          <h2 id="mf-cats" className="font-headline font-bold text-3xl text-primary mb-8">Capability Catalogue</h2>
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

      <Silhouettes categories={categories} />

      <section id="inquiry" aria-labelledby="mf-inq" className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface-container-low border-t border-border-subtle scroll-mt-28">
        <div className="max-w-4xl mx-auto">
          <span className="text-xs uppercase tracking-widest font-bold text-primary">Project inquiry</span>
          <h2 id="mf-inq" className="font-headline font-bold text-3xl text-primary mt-1 mb-6">Tell Us What You Are Building</h2>
          <MainInquiry categories={categories} />
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
