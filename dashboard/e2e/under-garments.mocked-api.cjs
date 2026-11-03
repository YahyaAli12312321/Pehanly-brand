// Admin: dedicated-section toggle (top-level only) + grouped Category->Subcategory picker, against a fake API. NOT a real backend/DB.
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
const bodies = []; const productBodies = [];
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
    if (p === '/admin/categories/summary') return j({ total: cats.length, active: 3, inactive: 1, showOnHome: 0, topLevel: 2 });
    if (p === '/admin/categories/audiences') return j([{ value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }]);
    if (p === '/admin/categories' && m === 'POST') { bodies.push(body); const c = { _id: 'n' + bodies.length, ...body, parentCategory: body.parentCategory ? cats.find((x) => x._id === body.parentCategory) : null, productsCount: 0 }; cats.push(c); return j(c, 201); }
    if (p === '/admin/categories') return j(cats, 200, { meta: { page: 1, limit: 100, total: cats.length, totalPages: 1 } });
    if (p === '/admin/products/summary') return j({ total: 0, active: 0, draft: 0, inactive: 0, lowStockProducts: 0, lowStockSkus: 0, outOfStockProducts: 0, outOfStockSkus: 0 });
    if (p === '/admin/products' && m === 'POST') { productBodies.push(body); return j({ _id: 'p1', status: 'draft', slug: 'x', ...body, summary: {} }, 201); }
    if (p === '/admin/products') return j([], 200, { meta: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    return j([]);
  });

  // ---- Categories page ----
  await page.goto(BASE + '/categories', { waitUntil: 'networkidle' });
  const txt = await page.locator('body').innerText();
  ok('list shows the "Dedicated section" badge on Under Garments', /Dedicated section/.test(txt));
  await page.getByRole('button', { name: 'Add Category' }).first().click();
  ok('new top-level category shows the Dedicated section toggle', (await page.getByTestId('dedicated-section').count()) === 1);
  await page.getByRole('dialog').locator('input[type=text]').first().fill('Sleepwear');
  await page.getByTestId('dedicated-section').locator('label').first().click();
  await page.getByRole('button', { name: 'Save Category' }).click(); await page.waitForTimeout(500);
  ok('POST sends dedicatedSection:true for a top-level category', bodies[0]?.dedicatedSection === true, JSON.stringify(bodies[0]));
  // sub-category: toggle hidden, flag never sent
  await page.getByRole('button', { name: 'Add Category' }).first().click();
  await page.getByRole('dialog').locator('input[type=text]').first().fill('Thermals');
  await page.getByRole('dialog').locator('select').filter({ has: page.locator('option', { hasText: 'Under Garments' }) }).first().selectOption('cu');
  ok('choosing a parent hides the Dedicated section toggle', (await page.getByTestId('dedicated-section').count()) === 0);
  await page.getByRole('button', { name: 'Save Category' }).click(); await page.waitForTimeout(500);
  ok('sub-category POST has parentCategory and dedicatedSection:false', bodies[1]?.parentCategory === 'cu' && bodies[1]?.dedicatedSection === false, JSON.stringify(bodies[1]));

  // ---- Product editor picker ----
  await page.goto(BASE + '/products', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Add Product/ }).first().click();
  await page.getByPlaceholder('Garment name...').fill('Cotton Boxer');
  await page.getByRole('button', { name: /Next Step/ }).click();
  const sel = page.getByRole('dialog').locator('select:not([data-testid="audience-select"])').first();
  await sel.locator('option[value="cm"]').waitFor({ state: 'attached' });
  const groups = await sel.locator('optgroup').evaluateAll((g) => g.map((x) => x.label));
  ok('picker groups sub-categories under their parent (marked own page)', groups.includes('Under Garments (own page)'), JSON.stringify(groups));
  const ugOpts = await sel.locator('optgroup[label="Under Garments (own page)"] option').evaluateAll((o) => o.map((x) => ({ t: x.textContent, d: x.disabled })));
  ok('group lists whole category + sub-categories', ugOpts.some((o) => /whole category/.test(o.t)) && ugOpts.some((o) => /Men's Underwear/.test(o.t)), JSON.stringify(ugOpts));
  ok('inactive sub-category (Socks) is shown but disabled', ugOpts.some((o) => /Socks/.test(o.t) && /inactive/.test(o.t) && o.d), JSON.stringify(ugOpts));
  ok('plain category without children stays a plain option', (await sel.locator('> option', { hasText: 'Tops' }).count()) === 1);
  await sel.selectOption('cm');
  await page.getByRole('button', { name: /Next Step/ }).click();
  await page.getByRole('button', { name: /Save draft/ }).click(); await page.waitForTimeout(500);
  ok('product is saved with the sub-category id as its category', productBodies[0]?.category === 'cm', JSON.stringify(productBodies[0]?.category));
  ok('no page errors', errs.length === 0, errs.join('|'));
  console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
  await b.close(); process.exit(out.every(Boolean) ? 0 : 1);
})();
