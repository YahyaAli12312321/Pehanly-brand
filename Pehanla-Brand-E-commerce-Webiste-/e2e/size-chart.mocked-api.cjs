// Size chart on the product page, against a mocked API (NOT a real backend/DB).
// Run: npx vite build && npx vite preview --port 3998 --strictPort, then node e2e/size-chart.mocked-api.cjs
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3998';
const out = []; const ok = (n, c, d = '') => { out.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const img = 'https://img.test/p.jpg';
const sku = (id, size) => ({ id, sku: `X-${size}`, size, price: 2500, inStock: true, maxQuantity: 5, currencies: ['PKR'] });
const make = (slug, name, sizes, over = {}) => ({
  id: slug, name, slug, shortDescription: 'x', description: 'x', category: { name: 'Cat', slug: 'cat' },
  image: { url: img, alt: name }, images: [{ url: img, alt: name }], priceMin: 2500, priceMax: 2500, currencies: ['PKR'], inStock: true,
  variants: [{ id: 'v1', color: { name: 'Black', hexCode: '#111' }, images: [{ url: img }], sizes: sizes.map((s, i) => sku(String(i).repeat(24), s)) }],
  ...over,
});
const products = {
  'kids-kit': make('kids-kit', 'Kids Kit', ['Small', 'Medium', 'Large'], { audience: null, categoryAudience: 'kids' }),
  'mens-tee': make('mens-tee', "Men's Tee", ['M', 'L'], { audience: 'men' }),
  'womens-kurta': make('womens-kurta', "Women's Kurta", ['S', 'M'], { audience: 'women' }),
  'unisex-hoodie': make('unisex-hoodie', 'Unisex Hoodie', ['M'], { audience: 'unisex' }),
  'no-audience': make('no-audience', 'Mystery Item', ['M'], { audience: null, categoryAudience: null }),
};
const chart = (columns, rows, note = '') => ({ note, columns, rows });
let sizeCharts = {
  kids: chart(['Recommended age'], [
    { size: 'X-Small', values: ['1-2 years'] }, { size: 'Small', values: ['3-4 years'] }, { size: 'Medium', values: ['5-6 years'] },
    { size: 'Large', values: ['7-8 years'] }, { size: 'X-Large', values: ['9-10 years'] }, { size: '2-XL', values: ['11-12 years'] },
  ], 'Kids sizes are by age.'),
  men: chart(['Chest (in)', 'Waist (in)'], [{ size: 'M', values: ['38-40', '32-34'] }, { size: 'L', values: ['40-42', '34-36'] }]),
  women: chart(['Bust (in)', 'Hips (in)'], [{ size: 'S', values: ['32-34', '35-37'] }, { size: 'M', values: ['34-36', '37-39'] }]),
  unisex: chart(['Chest (in)'], [{ size: 'M', values: ['38-40'] }]),
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.material-symbols-outlined{display:inline-block;width:1em;overflow:hidden;white-space:nowrap;font-style:normal}'; document.head.appendChild(st); }); });
  await page.route(/https:\/\/(img\.test|fonts\.|lh3\.)/, (r) => r.fulfill({ status: 200, contentType: r.request().url().includes('img.test') ? 'image/gif' : 'text/css', body: r.request().url().includes('img.test') ? Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') : '' }));
  await page.route('**/api/v1/**', (r) => {
    const p = new URL(r.request().url()).pathname.replace('/api/v1', '').replace(/^\/catalog/, '');
    const j = (d, x = {}) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'ok', data: d, ...x }) });
    if (p === '/settings/public') return j({ storeName: 'PEHANLY', currency: 'PKR', currencies: { base: 'PKR', supported: ['PKR'], paymentMethods: { PKR: ['cod'] } }, sizeCharts, returns: { enabled: true, windowDays: 7 } });
    const m = p.match(/^\/products\/(.+)$/);
    if (m) return products[m[1]] ? j(products[m[1]]) : r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Product not found' }) });
    if (p === '/categories') return j([]);
    return j([], { meta: { page: 1, limit: 12, total: 0, totalPages: 1 } });
  });

  const table = page.getByTestId('size-chart-table');
  const section = page.locator('#size-chart');
  const open = async (slug) => { await page.goto(`${BASE}/product/${slug}`); await page.locator('h1').first().waitFor(); await page.waitForTimeout(350); };
  const grid = async () => table.locator('tbody tr').evaluateAll((rows) => rows.map((tr) => [...tr.querySelectorAll('th,td')].map((c) => c.textContent.replace(/\s*selected\s*$/i, '').trim())));
  const head = async () => table.locator('thead th').allInnerTexts().then((t) => t.map((x) => x.trim().toLowerCase())); // headings render uppercase via CSS

  // ---------- Kids: age ranges ----------
  await open('kids-kit');
  ok('kids product shows a size chart section', await section.isVisible());
  ok('heading names the audience', /kids size chart/i.test(await section.locator('h2').innerText()), await section.locator('h2').innerText());
  ok('kids columns are Size + Recommended age', JSON.stringify(await head()) === JSON.stringify(['size', 'recommended age']), JSON.stringify(await head()));
  ok('every kids size shows its age range', JSON.stringify(await grid()) === JSON.stringify([['X-Small', '1-2 years'], ['Small', '3-4 years'], ['Medium', '5-6 years'], ['Large', '7-8 years'], ['X-Large', '9-10 years'], ['2-XL', '11-12 years']]), JSON.stringify(await grid()));
  ok('admin note is shown', /kids sizes are by age/i.test(await section.innerText()));

  // selecting a size highlights its row
  ok('no row is highlighted before a size is chosen', (await table.locator('tbody tr[aria-current]').count()) === 0);
  await page.getByRole('radio', { name: 'Size Medium' }).click(); await page.waitForTimeout(250);
  const hi = table.locator('tbody tr[aria-current="true"]');
  ok('choosing Medium highlights the Medium row', (await hi.count()) === 1 && /medium\s*selected\s*5-6 years/i.test((await hi.innerText()).replace(/\s+/g, ' ')), (await hi.innerText()).replace(/\s+/g, ' '));
  // the link scrolls to the chart
  await page.getByTestId('size-chart-link').click(); await page.waitForTimeout(500);
  ok('the "Size chart" link next to the size picker jumps to the table', await table.isVisible() && (await page.evaluate(() => location.hash)) === '#size-chart');

  // ---------- Men / Women: their own measurements ----------
  await open('mens-tee');
  ok("men's product shows the men's chart with its own columns", /men's size chart/i.test(await section.locator('h2').innerText()) && JSON.stringify(await head()) === JSON.stringify(['size', 'chest (in)', 'waist (in)']));
  ok("men's rows carry the measurements", JSON.stringify(await grid()) === JSON.stringify([['M', '38-40', '32-34'], ['L', '40-42', '34-36']]));
  await open('womens-kurta');
  ok("women's product shows a different chart", /women's size chart/i.test(await section.locator('h2').innerText()) && JSON.stringify(await head()) === JSON.stringify(['size', 'bust (in)', 'hips (in)']));
  ok("women's rows carry their own measurements", JSON.stringify(await grid()) === JSON.stringify([['S', '32-34', '35-37'], ['M', '34-36', '37-39']]));
  await open('unisex-hoodie');
  ok('unisex product shows the unisex chart', /unisex size chart/i.test(await section.locator('h2').innerText()));

  // ---------- Fallbacks and empty states ----------
  await open('no-audience');
  ok('a product with no audience falls back to the unisex chart', /unisex size chart/i.test(await section.locator('h2').innerText()));
  sizeCharts = { ...sizeCharts, women: { note: '', columns: ['Bust (in)'], rows: [] } };
  await open('womens-kurta');
  ok('an empty women chart falls back to unisex, never an empty table', /unisex size chart/i.test(await section.locator('h2').innerText()) && (await table.locator('tbody tr').count()) === 1);
  sizeCharts = {};
  await open('mens-tee');
  ok('no charts configured -> no section and no size-chart link', (await section.count()) === 0 && (await page.getByTestId('size-chart-link').count()) === 0);
  ok('the rest of the product page still works', /Add to Cart/i.test(await page.locator('body').innerText()) && (await page.getByRole('radio', { name: /^Size /i }).count()) === 2);

  // ---------- Accessibility & responsive ----------
  sizeCharts = { kids: chart(['Recommended age'], [{ size: 'Small', values: ['3-4 years'] }, { size: 'Medium', values: ['5-6 years'] }]) };
  await open('kids-kit');
  const semantics = await table.evaluate((t) => ({
    caption: !!t.querySelector('caption'), colHeaders: [...t.querySelectorAll('thead th')].every((h) => h.getAttribute('scope') === 'col'),
    rowHeaders: [...t.querySelectorAll('tbody tr > th')].every((h) => h.getAttribute('scope') === 'row'),
  }));
  ok('table is semantic: caption, column and row headers', semantics.caption && semantics.colHeaders && semantics.rowHeaders, JSON.stringify(semantics));
  ok('section is labelled for screen readers', (await section.getAttribute('aria-labelledby')) === 'size-chart-heading');
  for (const [w, h, label] of [[1280, 900, 'desktop'], [768, 1024, 'tablet'], [390, 844, 'mobile']]) {
    await page.setViewportSize({ width: w, height: h });
    await section.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const visible = await table.isVisible();
    ok(`${label}: table visible, no horizontal page scroll`, fits && visible);
    await page.screenshot({ path: `/tmp/sizechart-${label}.png`, clip: await section.boundingBox().then((bb) => ({ x: 0, y: bb.y, width: w, height: Math.min(h, bb.height) })) });
  }

  ok('no page errors', errs.length === 0, errs.join('|'));
  console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
  await b.close(); process.exit(out.every(Boolean) ? 0 : 1);
})();
