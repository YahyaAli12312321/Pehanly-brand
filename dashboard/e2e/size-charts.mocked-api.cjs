// Admin: Size Charts editor in Settings, against a fake API. NOT a real backend/DB.
// Run: npm run build && npx vite preview --port 3997 --strictPort, then node e2e/under-garments.mocked-api.cjs
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = 'http://localhost:3997';
const out = []; const ok = (n, c, d = '') => { out.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const owner = { id: 'u1', name: 'Owner', email: 'owner@pehanly.pk', role: 'admin', permissions: [] };
const cats = [
  { _id: 'c1', name: 'Tops', slug: 'tops', isActive: true, parentCategory: null, productsCount: 0 },
  { _id: 'cu', name: 'Under Garments', slug: 'under-garments', isActive: true, dedicatedSection: true, parentCategory: null, productsCount: 0 },
  { _id: 'cm', name: "Men's Underwear", slug: 'mens-underwear', isActive: true, parentCategory: { _id: 'cu', name: 'Under Garments', slug: 'under-garments' }, productsCount: 0 },
  { _id: 'cs', name: 'Socks', slug: 'socks', isActive: false, parentCategory: { _id: 'cu', name: 'Under Garments', slug: 'under-garments' }, productsCount: 0 },
];
const patches = [];
let store = {
  storeName: 'PEHANLY', tagline: 'Wear Your Identity', currency: 'PKR',
  contact: { email: 'care@pehanly.com' }, social: {}, checkout: { codEnabled: true, guestCheckoutEnabled: true, jazzcashEnabled: false },
  returns: { enabled: true, windowDays: 7 }, announcement: { enabled: false, text: '', link: '' },
  sizeCharts: { kids: { enabled: true, note: 'Kids sizes are by age.', columns: ['Recommended age'], rows: [
    { size: 'X-Small', values: ['1-2 years'] }, { size: 'Small', values: ['3-4 years'] }, { size: 'Medium', values: ['5-6 years'] },
    { size: 'Large', values: ['7-8 years'] }, { size: 'X-Large', values: ['9-10 years'] }, { size: '2-XL', values: ['11-12 years'] } ] } },
  updatedAt: new Date().toISOString(),
};
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('dialog', (d) => d.accept());
  await page.route(/https:\/\/fonts\./, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/api/v1/**', async (r) => {
    const req = r.request(); const p = new URL(req.url()).pathname.replace('/api/v1', ''); const m = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const j = (d, s = 200, x = {}) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'ok', data: d, ...x }) });
    if (p === '/auth/me') return j({ user: owner });
    if (p === '/admin/settings' && m === 'GET') return j(store);
    if (p === '/admin/settings' && m === 'PATCH') { patches.push(body); store = { ...store, ...body, updatedAt: new Date().toISOString() }; return j(store); }
    if (p.startsWith('/admin/shipping')) return j([], 200, { meta: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    if (p === '/admin/categories/summary') return j({ total: cats.length, active: 3, inactive: 1, showOnHome: 0, topLevel: 2 });
    if (p === '/admin/categories/audiences') return j([{ value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }]);
    if (p === '/admin/categories' && m === 'POST') { bodies.push(body); const c = { _id: 'n' + bodies.length, ...body, parentCategory: body.parentCategory ? cats.find((x) => x._id === body.parentCategory) : null, productsCount: 0 }; cats.push(c); return j(c, 201); }
    if (p === '/admin/categories') return j(cats, 200, { meta: { page: 1, limit: 100, total: cats.length, totalPages: 1 } });
    if (p === '/admin/products/summary') return j({ total: 0, active: 0, draft: 0, inactive: 0, lowStockProducts: 0, lowStockSkus: 0, outOfStockProducts: 0, outOfStockSkus: 0 });
    if (p === '/admin/products' && m === 'POST') { productBodies.push(body); return j({ _id: 'p1', status: 'draft', slug: 'x', ...body, summary: {} }, 201); }
    if (p === '/admin/products') return j([], 200, { meta: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    return j([]);
  });


  const row = (i) => page.getByTestId(`chart-kids-size-${i}`);
  const save = page.getByRole('button', { name: /Save Settings/i });

  await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Size Charts' }).click();
  ok('Settings has a Size Charts tab with one tab per audience', (await page.getByTestId('chart-tab-kids').count()) === 1 && (await page.getByTestId('chart-tab-men').count()) === 1 && (await page.getByTestId('chart-tab-women').count()) === 1 && (await page.getByTestId('chart-tab-unisex').count()) === 1);
  const kidsSizes = await page.getByTestId('chart-kids').locator('tbody input[data-testid^="chart-kids-size-"]').evaluateAll((i) => i.map((x) => x.value));
  const kidsAges = await page.getByTestId('chart-kids').locator('tbody input[data-testid^="chart-kids-cell-"]').evaluateAll((i) => i.map((x) => x.value));
  ok('kids chart is pre-filled with the client age ranges', JSON.stringify(kidsSizes) === JSON.stringify(['X-Small', 'Small', 'Medium', 'Large', 'X-Large', '2-XL']) && JSON.stringify(kidsAges) === JSON.stringify(['1-2 years', '3-4 years', '5-6 years', '7-8 years', '9-10 years', '11-12 years']), JSON.stringify(kidsSizes));
  ok('kids column heading is editable, not hardcoded', (await page.getByTestId('chart-kids-col-0').inputValue()) === 'Recommended age');

  // men: build a chart from scratch
  await page.getByTestId('chart-tab-men').click();
  ok('an empty chart says it will not be shown on the storefront', /not shown on the storefront/i.test(await page.getByTestId('chart-men').innerText()));
  await page.getByTestId('chart-men-add-col').click();
  await page.getByTestId('chart-men-col-0').fill('Chest (in)');
  await page.getByTestId('chart-men-add-col').click();
  await page.getByTestId('chart-men-col-1').fill('Waist (in)');
  for (const [i, size, chest, waist] of [[0, 'M', '38-40', '32-34'], [1, 'L', '40-42', '34-36']]) {
    await page.getByTestId('chart-men-add-row').click();
    await page.getByTestId(`chart-men-size-${i}`).fill(size);
    await page.getByTestId(`chart-men-cell-${i}-0`).fill(chest);
    await page.getByTestId(`chart-men-cell-${i}-1`).fill(waist);
  }
  await page.getByTestId('chart-men-note').fill('Measured flat.');
  await save.click(); await page.waitForTimeout(500);
  const sent = patches.at(-1)?.sizeCharts;
  ok('men chart is saved with its columns, rows and note', JSON.stringify(sent?.men) === JSON.stringify({ enabled: true, note: 'Measured flat.', columns: ['Chest (in)', 'Waist (in)'], rows: [{ size: 'M', values: ['38-40', '32-34'] }, { size: 'L', values: ['40-42', '34-36'] }] }), JSON.stringify(sent?.men));
  ok('kids chart is saved unchanged alongside it', sent?.kids?.rows?.length === 6 && sent.kids.rows[1].values[0] === '3-4 years');
  ok('untouched audiences are saved empty, not invented', JSON.stringify(sent?.women) === JSON.stringify({ enabled: true, note: '', columns: [], rows: [] }), JSON.stringify(sent?.women));

  // validation
  await page.getByTestId('chart-tab-women').click();
  await page.getByTestId('chart-women-add-row').click();
  await page.getByTestId('chart-women-size-0').fill('S');
  await save.click(); await page.waitForTimeout(300);
  ok('a size without any column is rejected with a clear message', /add at least one column/i.test(await page.locator('form').innerText()), (await page.locator('form').innerText()).slice(0, 120));
  await page.getByTestId('chart-women-add-col').click();
  await page.getByTestId('chart-women-col-0').fill('Bust (in)');
  await page.getByTestId('chart-women-add-row').click();
  await page.getByTestId('chart-women-size-1').fill('s');
  await save.click(); await page.waitForTimeout(300);
  ok('duplicate size names are rejected', /listed twice/i.test(await page.locator('form').innerText()));
  await page.getByTestId('chart-women-size-1').fill('M');
  await page.getByTestId('chart-women-cell-1-0').fill('34-36');
  await save.click(); await page.waitForTimeout(500);
  ok('fixing the duplicate saves the women chart', JSON.stringify(patches.at(-1)?.sizeCharts?.women?.rows) === JSON.stringify([{ size: 'S', values: [''] }, { size: 'M', values: ['34-36'] }]), JSON.stringify(patches.at(-1)?.sizeCharts?.women?.rows));

  // rows/columns can be removed, kids chart restored, chart switched off
  await page.getByTestId('chart-tab-kids').click();
  await page.getByRole('button', { name: 'Remove size row 1' }).click();
  ok('a size row can be removed', (await page.getByTestId('chart-kids').locator('tbody input[data-testid^="chart-kids-size-"]').count()) === 5);
  await page.getByTestId('chart-kids-restore').click();
  const restored = await page.getByTestId('chart-kids').locator('tbody input[data-testid^="chart-kids-cell-"]').evaluateAll((i) => i.map((x) => x.value));
  ok('"Restore client age ranges" brings back all six kids sizes', restored.length === 6 && restored[5] === '11-12 years', JSON.stringify(restored));
  await page.getByTestId('chart-kids').getByRole('checkbox', { name: /Show the Kids size chart/i }).dispatchEvent('click');
  await save.click(); await page.waitForTimeout(500);
  ok('a chart can be switched off without losing its rows', patches.at(-1).sizeCharts.kids.enabled === false && patches.at(-1).sizeCharts.kids.rows.length === 6);

  ok('no page errors', errs.length === 0, errs.join('|'));
  console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
  await b.close(); process.exit(out.every(Boolean) ? 0 : 1);
})();
