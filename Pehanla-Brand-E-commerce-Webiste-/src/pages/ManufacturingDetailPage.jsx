import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useManufacturingCategoriesQuery,
  useManufacturingCategoryQuery,
  useManufacturingStylesQuery,
  useManufacturingVariantsQuery,
} from '../hooks/useQueries';
import Seo from '../seo/Seo';
import { breadcrumbSchema } from '../seo/schema';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/StateViews';
import InquiryForm from '../components/manufacturing/InquiryForm';
import GalleryModal from '../components/manufacturing/GalleryModal';
import StyleCard from '../components/manufacturing/StyleCard';
import { categoryImage } from './CustomManufacturingPage';
import NotFoundPage from './NotFoundPage';
import { isLadiesShoes } from '../utils/product';

const list = (d) => (Array.isArray(d) ? d : d?.items || []);
const sid = (x) => x?._id || x?.id;

// Static presentational copy: what a manufacturing brief should cover. No figures are promised here;
// fabric, GSM, lead time and MOQ are confirmed by the team in the quote.
const CAPABILITIES = [
  ['design_services', 'Pattern & sampling', 'We translate your reference or tech pack into patterns and a sample for approval.'],
  ['content_cut', 'Cut & sew production', 'Bulk production in your approved fabric, colours and size run.'],
  ['brush', 'Branding & finishing', 'Printing, embroidery, labels and tags applied in-house. See Printing & Branding.'],
  ['inventory_2', 'Quality control & packing', 'Inspection before packing, with retail-ready or bulk packaging.'],
];
const SPEC_ROWS = [
  ['Fabric & weight', 'Tell us the fabric and GSM you want, or ask for a recommendation.'],
  ['Sizes & grading', 'Share your size run and quantity per size.'],
  ['Trims & labels', 'Buttons, zips, woven labels, care labels, hang tags.'],
  ['Branding', 'Print, embroidery or woven label placement and artwork.'],
  ['Lead time & MOQ', 'Confirmed by our team in your quote for the chosen style.'],
];

export default function ManufacturingDetailPage() {
  const { categorySlug } = useParams();
  const { data: category, isLoading, isError, error, refetch } = useManufacturingCategoryQuery(categorySlug);
  const categoryId = sid(category);
  const { data: stylesData, isLoading: stylesLoading } = useManufacturingStylesQuery(categoryId);
  const { data: allCats } = useManufacturingCategoriesQuery();
  const styles = useMemo(() => list(stylesData), [stylesData]);
  const otherCategories = list(allCats).filter((c) => sid(c) !== categoryId && !isLadiesShoes(c)).slice(0, 4);

  const [styleId, setStyleId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => { if (styles.length && !styles.some((s) => sid(s) === styleId)) setStyleId(sid(styles[0])); }, [styles, styleId]);
  const { data: variantsData } = useManufacturingVariantsQuery(styleId);
  const variants = useMemo(() => list(variantsData), [variantsData]);
  useEffect(() => { setVariantId(''); }, [styleId]);

  const style = styles.find((s) => sid(s) === styleId);
  const media = useMemo(() => variants.flatMap((v) => v.media || []).filter((m) => m.url), [variants]);
  const viewTypes = [...new Set(media.map((m) => m.viewType).filter(Boolean))];

  if (isLoading) return <LoadingBlock label="Loading…" className="py-40" />;
  if ((isError && error?.status === 404) || (category && isLadiesShoes(category))) return <NotFoundPage title="Category not found" text="This manufacturing category is not available." />;
  if (isError) return <ErrorBlock error={error} onRetry={refetch} className="py-40" />;
  if (!category) return null;

  const hero = media[0]?.url || categoryImage(category);
  const requestFromGallery = (vid) => {
    setVariantId(vid || '');
    setGalleryOpen(false);
    setTimeout(() => document.getElementById('rfq')?.scrollIntoView({ behavior: 'smooth' }), 60);
  };

  return (
    <div className="w-full flex flex-col bg-surface">
      <Seo
        title={`Custom ${category.name} Manufacturing`}
        description={category.description || `Custom ${category.name} manufacturing by PEHAN LY.`}
        path={`/custom-manufacturing/${category.slug}`}
        image={hero || undefined}
        jsonLd={[breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Custom Manufacturing', path: '/custom-manufacturing' }, { name: category.name, path: `/custom-manufacturing/${category.slug}` }])]}
      />

      <nav aria-label="Breadcrumb" className="bg-surface-container-low border-b border-border-subtle py-3 px-4 sm:px-8">
        <ol className="max-w-7xl mx-auto flex flex-wrap items-center gap-2 text-xs text-muted">
          <li><Link to="/" className="hover:text-primary">Home</Link></li><li aria-hidden="true">/</li>
          <li><Link to="/custom-manufacturing" className="hover:text-primary">Custom Manufacturing</Link></li><li aria-hidden="true">/</li>
          <li className="text-primary font-semibold" aria-current="page">{category.name}</li>
        </ol>
      </nav>

      <section className="w-full px-4 sm:px-8 lg:px-12 py-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div className="flex flex-col gap-4">
            <span className="text-xs uppercase tracking-widest font-bold text-primary">Custom manufacturing</span>
            <h1 className="font-headline font-bold text-4xl sm:text-5xl text-primary leading-tight">{category.name}</h1>
            {category.description && <p className="text-base text-muted whitespace-pre-line">{category.description}</p>}
            <div className="flex flex-wrap gap-4 pt-2">
              <a href="#rfq" className="h-12 px-8 bg-primary text-white text-xs font-bold uppercase tracking-widest rounded-lg flex items-center">Request a quote</a>
              {media.length > 0 && <button type="button" onClick={() => setGalleryOpen(true)} className="h-12 px-8 border-2 border-primary text-primary text-xs font-bold uppercase tracking-widest rounded-lg cursor-pointer">View gallery</button>}
            </div>

            <div className="mt-4 bg-white border border-border-subtle rounded-2xl p-5" data-testid="mf-spec-card">
              <h2 className="font-headline font-bold text-sm uppercase tracking-wider text-primary mb-3">Spec sheet</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                <dt className="text-muted">Garment</dt><dd className="font-semibold">{category.name}</dd>
                {styles.length > 0 && <><dt className="text-muted">Styles</dt><dd className="font-semibold">{styles.length}</dd></>}
                {style && <><dt className="text-muted">Selected style</dt><dd className="font-semibold">{style.name}</dd></>}
                {variants.length > 0 && <><dt className="text-muted">Colours</dt><dd className="font-semibold">{variants.length}</dd></>}
                {viewTypes.length > 0 && <><dt className="text-muted">Imagery</dt><dd className="font-semibold capitalize">{viewTypes.join(' · ')}</dd></>}
                <dt className="text-muted">Fabric, GSM, lead time, MOQ</dt><dd className="font-semibold">Confirmed in your quote</dd>
              </dl>
            </div>
          </div>
          <div>
            {hero ? <img src={hero} alt={category.name} width="800" height="600" fetchPriority="high" referrerPolicy="no-referrer" className="w-full rounded-2xl object-cover aspect-4/3 border border-border-subtle" /> : <div className="aspect-4/3 rounded-2xl bg-surface-container flex items-center justify-center text-muted"><span className="material-symbols-outlined text-6xl" aria-hidden="true">checkroom</span></div>}
          </div>
        </div>
      </section>

      <section aria-labelledby="cap-h" className="w-full px-4 sm:px-8 lg:px-12 py-12 bg-surface-card border-y border-border-subtle">
        <div className="max-w-7xl mx-auto">
          <h2 id="cap-h" className="font-headline font-bold text-3xl text-primary mb-6">Production Capabilities</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {CAPABILITIES.map(([icon, t, d]) => (
              <li key={t} className="bg-surface rounded-xl border border-border-subtle p-5">
                <span className="material-symbols-outlined text-primary" aria-hidden="true">{icon}</span>
                <h3 className="font-headline font-bold text-primary mt-2">{t}</h3>
                <p className="text-sm text-muted mt-1">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="styles-h" className="w-full px-4 sm:px-8 lg:px-12 py-12">
        <div className="max-w-7xl mx-auto">
          <h2 id="styles-h" className="font-headline font-bold text-3xl text-primary mb-6">Styles &amp; Silhouettes</h2>
          {stylesLoading ? <LoadingBlock label="Loading styles…" className="py-10" /> : styles.length === 0 ? <EmptyBlock icon="checkroom" title="Styles coming soon" text="No styles are published for this category yet." className="py-10" /> : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {styles.map((s) => <StyleCard key={sid(s)} style={s} selected={sid(s) === styleId} onSelect={setStyleId} onGallery={(id) => { setStyleId(id); setGalleryOpen(true); }} />)}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="matrix-h" className="w-full px-4 sm:px-8 lg:px-12 py-12 bg-surface-container-low border-y border-border-subtle">
        <div className="max-w-5xl mx-auto">
          <h2 id="matrix-h" className="font-headline font-bold text-3xl text-primary mb-6">What To Include In Your Brief</h2>
          <div className="overflow-x-auto rounded-xl border border-border-subtle bg-white">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-surface-container text-muted"><tr><th scope="col" className="text-left px-4 py-3 font-semibold">Specification</th><th scope="col" className="text-left px-4 py-3 font-semibold">What to tell us</th></tr></thead>
              <tbody>{SPEC_ROWS.map(([k, v]) => <tr key={k} className="border-t border-border-subtle"><th scope="row" className="text-left px-4 py-3 font-semibold text-primary whitespace-nowrap">{k}</th><td className="px-4 py-3 text-muted">{v}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </section>

      {(styles.length > 1 || otherCategories.length > 0) && (
        <section aria-labelledby="rel-h" className="w-full px-4 sm:px-8 lg:px-12 py-12">
          <div className="max-w-7xl mx-auto">
            <h2 id="rel-h" className="font-headline font-bold text-3xl text-primary mb-6">Related Silhouettes</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {styles.filter((s) => sid(s) !== styleId).slice(0, 4).map((s) => <StyleCard key={sid(s)} style={s} compact onSelect={setStyleId} />)}
              {otherCategories.map((c) => (
                <li key={sid(c)}><Link to={`/custom-manufacturing/${c.slug}`} className="block bg-white border border-border-subtle rounded-2xl p-5 h-full hover:shadow-md transition-shadow"><span className="text-[11px] uppercase tracking-widest font-bold text-primary">Also manufactured</span><h3 className="font-headline font-bold text-primary mt-1">{c.name}</h3><span className="inline-block mt-3 text-xs font-bold uppercase tracking-wider text-primary underline">View styles</span></Link></li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section id="rfq" aria-labelledby="rfq-h" className="w-full px-4 sm:px-8 lg:px-12 py-16 bg-surface-card border-t border-border-subtle scroll-mt-28">
        <div className="max-w-4xl mx-auto">
          <h2 id="rfq-h" className="font-headline font-bold text-3xl text-primary mb-6">Request a Quote</h2>
          <InquiryForm
            lockCategory
            categories={[category]}
            categoryId={categoryId}
            styles={styles}
            styleId={styleId}
            onStyle={setStyleId}
            variants={variants}
            variantId={variantId}
            onVariant={setVariantId}
          />
        </div>
      </section>

      <GalleryModal open={galleryOpen} onClose={() => setGalleryOpen(false)} styleName={style?.name || category.name} categoryName={category.name} variants={variants} initialVariantId={variantId} onRequest={requestFromGallery} />
    </div>
  );
}
