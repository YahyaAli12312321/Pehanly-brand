/*
 * Size chart on the product page.
 *
 * Content is merchant data from Store Settings (Admin > Settings > Size Charts): column headings and values are free
 * text, so the same table renders an age range for kids ("Recommended age": 3-4 years) and measurements for adults
 * ("Chest (in)": 38-40). Nothing is hardcoded here and nothing is invented: a chart the store has not filled in is
 * simply not rendered.
 */

/** Kids sizes carry a name, not a code, which is what distinguishes them from adult sizing. */
const KIDS_SIZE_NAMES = ['x-small', 'small', 'medium', 'large', 'x-large', '2-xl'];
const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');

/**
 * Which chart a product should show.
 * The product's own audience wins; otherwise the category's audience (that is where "kids" lives, since a product's
 * audience is only men/women/unisex). As a last resort, a product sized entirely in kids size names is a kids product.
 */
export function resolveChartKey(product) {
  const own = norm(product?.audience);
  if (['men', 'women', 'unisex'].includes(own)) return own;

  const fromCategory = norm(product?.categoryAudience);
  if (['kids', 'men', 'women', 'unisex'].includes(fromCategory)) return fromCategory;

  const sizes = (product?.variants || []).flatMap((v) => (v.sizes || []).map((s) => norm(s.size))).filter(Boolean);
  if (sizes.length && sizes.every((s) => KIDS_SIZE_NAMES.includes(s))) return 'kids';

  return null;
}

/** The chart to render: the audience's own chart, falling back to the unisex one. Null when neither has rows. */
export function pickChart(charts, product) {
  const key = resolveChartKey(product);
  const has = (k) => k && charts?.[k]?.rows?.length > 0;

  if (has(key)) return { key, ...charts[key] };
  if (has('unisex')) return { key: 'unisex', ...charts.unisex };

  return null;
}

const LABELS = { kids: 'Kids', men: "Men's", women: "Women's", unisex: 'Unisex' };

export default function SizeChart({ product, charts, selectedSize }) {
  const chart = pickChart(charts, product);
  if (!chart) return null;

  const columns = chart.columns?.length ? chart.columns : ['Details'];
  const selected = norm(selectedSize);

  return (
    <section
      id="size-chart"
      aria-labelledby="size-chart-heading"
      className="max-w-[1200px] mx-auto px-4 sm:px-8 lg:px-10 py-10 w-full border-t border-border-subtle scroll-mt-24"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
        <div className="lg:col-span-4 flex flex-col gap-3">
          <span className="text-xs uppercase tracking-widest text-primary font-bold">Find your fit</span>
          <h2 id="size-chart-heading" className="font-headline font-bold text-2xl text-on-surface">
            {LABELS[chart.key]} size chart
          </h2>
          {chart.note && <p className="text-sm text-muted leading-relaxed">{chart.note}</p>}
        </div>

        <div className="lg:col-span-8">
          <div className="bg-white rounded-xl shadow-sm border border-border-subtle overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" data-testid="size-chart-table">
                <caption className="sr-only">{LABELS[chart.key]} size chart for {product?.name}</caption>
                <thead>
                  <tr className="bg-surface-container-low border-b border-border-subtle">
                    <th scope="col" className="px-4 sm:px-5 py-3 text-left text-xs uppercase tracking-wider font-bold text-on-surface whitespace-nowrap">Size</th>
                    {columns.map((c, i) => (
                      <th key={i} scope="col" className="px-4 sm:px-5 py-3 text-left text-xs uppercase tracking-wider font-bold text-on-surface whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chart.rows.map((row) => {
                    const isSelected = selected && norm(row.size) === selected;
                    return (
                      <tr
                        key={row.size}
                        data-testid={`size-chart-row-${row.size}`}
                        aria-current={isSelected ? 'true' : undefined}
                        className={`border-b border-border-subtle last:border-0 transition-colors ${isSelected ? 'bg-accent-subtle' : 'odd:bg-white even:bg-surface-container-low/40'}`}
                      >
                        <th scope="row" className={`px-4 sm:px-5 py-3 text-left font-bold whitespace-nowrap ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                          {row.size}
                          {isSelected && <span className="ml-2 align-middle text-[10px] uppercase tracking-wider font-bold text-primary/70">Selected</span>}
                        </th>
                        {columns.map((_, i) => (
                          <td key={i} className={`px-4 sm:px-5 py-3 whitespace-nowrap ${isSelected ? 'text-on-surface' : 'text-muted'}`}>
                            {row.values?.[i] || '—'}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-muted mt-3">Measurements can vary slightly between styles. Still unsure? Message us before ordering.</p>
        </div>
      </div>
    </section>
  );
}
