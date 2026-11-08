// Admin: delete products and categories, against a stateful fake API that enforces the same rules as the backend. NOT a real backend/DB.
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
let cats2 = [
  { _id: 'c1', name: 'Tops', slug: 'tops', isActive: true, parentCategory: null, productsCount: 1 },
  { _id: 'c2', name: 'Empty Rail', slug: 'empty-rail', isActive: true, parentCategory: null, productsCount: 0 },
  { _id: 'c3', name: 'Parent', slug: 'parent', isActive: true, parentCategory: null, productsCount: 0 },
  { _id: 'c4', name: 'Child', slug: 'child', isActive: true, parentCategory: { _id: 'c3', name: 'Parent', slug: 'parent' }, productsCount: 0 },
];
let prods = [
  { _id: 'p1', name: 'Unused Tee', slug: 'unused-tee', status: 'draft', category: { _id: 'c1', name: 'Tops', slug: 'tops' }, images: [], summary: { variantsCount: 2, skuCount: 7, priceMin: 1500, priceMax: 1600, availableStock: 10, lowStockSkus: 0, outOfStockSkus: 0, eligibleSkuCount: 7 } },
  { _id: 'p2', name: 'Ordered Hoodie', slug: 'ordered-hoodie', status: 'active', category: { _id: 'c1', name: 'Tops', slug: 'tops' }, images: [], summary: { variantsCount: 1, skuCount: 3, priceMin: 4000, priceMax: 4000, availableStock: 4, lowStockSkus: 0, outOfStockSkus: 0, eligibleSkuCount: 3 } },
];
// what the fake backend thinks still references each record
const B = (key, label, count, plural) => ({ key, label, count, text: count === 1 ? `1 ${label}` : `${count} ${plural || label + 's'}` });
const productRefs = { p2: [B('orders', 'order', 2), B('returns', 'return or refund request', 1)] };
const calls = [];
const catBlockers = (c) => [
  B('subcategories', 'sub-category', cats2.filter((x) => x.parentCategory?._id === c._id).length, 'sub-categories'),
  B('products', 'product', c.productsCount),
].filter((x) => x.count > 0);
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
    const conflict = (msg, code) => r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, message: msg, code }) });
    const describe = (bs) => bs.map((x) => x.text).join(' and ');

    let mm = p.match(/^\/admin\/products\/([^/]+)\/delete-check$/);
    if (mm) { const pr = prods.find((x) => x._id === mm[1]); const bl = productRefs[mm[1]] || []; return j({ id: pr._id, name: pr.name, status: pr.status, variants: pr.summary.variantsCount, skus: pr.summary.skuCount, blockers: bl, canDelete: bl.length === 0 }); }
    mm = p.match(/^\/admin\/products\/([^/]+)$/);
    if (mm && m === 'DELETE') {
      calls.push(['DELETE product', mm[1]]);
      const bl = productRefs[mm[1]] || [];
      if (bl.length) return conflict(`This product is used by ${describe(bl)}, so it cannot be deleted. Deactivate it instead to hide it from the store.`, 'PRODUCT_IN_USE');
      const pr = prods.find((x) => x._id === mm[1]); prods = prods.filter((x) => x._id !== mm[1]);
      return j({ id: pr._id, name: pr.name, variants: pr.summary.variantsCount, skus: pr.summary.skuCount });
    }
    mm = p.match(/^\/admin\/products\/([^/]+)\/status$/);
    if (mm && m === 'PATCH') { calls.push(['PATCH status', mm[1], body.status]); const pr = prods.find((x) => x._id === mm[1]); pr.status = body.status; return j(pr); }

    mm = p.match(/^\/admin\/categories\/([^/]+)\/delete-check$/);
    if (mm) {
      const c = cats2.find((x) => x._id === mm[1]);
      const bl = catBlockers(c);
      return j({ id: c._id, name: c.name, slug: c.slug, blockers: bl, canDelete: bl.length === 0 });
    }
    mm = p.match(/^\/admin\/categories\/([^/]+)$/);
    if (mm && m === 'DELETE') {
      calls.push(['DELETE category', mm[1]]);
      const c = cats2.find((x) => x._id === mm[1]);
      const bl = catBlockers(c);
      if (bl.length) return conflict(`This category still has ${describe(bl)}. Move or delete them first, or deactivate the category instead.`, 'CATEGORY_NOT_EMPTY');
      cats2 = cats2.filter((x) => x._id !== mm[1]);
      return j({ id: c._id, name: c.name });
    }
    mm = p.match(/^\/admin\/categories\/([^/]+)\/status$/);
    if (mm && m === 'PATCH') { calls.push(['PATCH category status', mm[1], body.isActive]); const c = cats2.find((x) => x._id === mm[1]); c.isActive = body.isActive; return j(c); }
    if (p === '/admin/categories/summary') return j({ total: cats2.length, active: cats2.length, inactive: 0, showOnHome: 0, topLevel: 3 });
    if (p === '/admin/categories/audiences') return j([{ value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }]);
    if (p === '/admin/categories' && m === 'POST') { bodies.push(body); const c = { _id: 'n' + bodies.length, ...body, parentCategory: body.parentCategory ? cats.find((x) => x._id === body.parentCategory) : null, productsCount: 0 }; cats.push(c); return j(c, 201); }
    if (p === '/admin/categories') return j(cats2, 200, { meta: { page: 1, limit: 100, total: cats2.length, totalPages: 1 } });
    if (p === '/admin/products/summary') return j({ total: prods.length, active: 0, draft: 0, inactive: 0, lowStockProducts: 0, lowStockSkus: 0, outOfStockProducts: 0, outOfStockSkus: 0 });
    if (p === '/admin/products' && m === 'POST') { productBodies.push(body); return j({ _id: 'p1', status: 'draft', slug: 'x', ...body, summary: {} }, 201); }
    if (p === '/admin/products') return j(prods, 200, { meta: { page: 1, limit: 20, total: prods.length, totalPages: 1 } });
    return j([]);
  });


  const dialog = page.getByRole('dialog');
  const confirm = page.getByTestId('delete-confirm');

  // ================= Products =================
  await page.goto(BASE + '/products', { waitUntil: 'networkidle' });
  ok('each product row has a delete action', (await page.getByTestId('delete-product-p1').count()) === 1 && (await page.getByTestId('delete-product-p2').count()) === 1);

  // ---- blocked: product that has been ordered ----
  await page.getByTestId('delete-product-p2').click();
  await page.getByTestId('delete-blockers').waitFor();
  const blockText = (await page.getByTestId('delete-blockers').innerText()).replace(/\s+/g, ' ');
  ok('a product in use lists exactly what is blocking it', /Used by 2 orders/.test(blockText) && /Used by 1 return or refund request/.test(blockText), blockText);
  ok('the delete button is disabled while blocked', await confirm.isDisabled());
  ok('no "what will be removed" summary is shown for a blocked product', (await page.getByTestId('delete-summary').count()) === 0);
  ok('it offers to deactivate instead', await page.getByTestId('delete-deactivate').isVisible());
  await page.getByTestId('delete-deactivate').click(); await page.waitForTimeout(400);
  ok('deactivating sets the product inactive and never calls DELETE', JSON.stringify(calls) === JSON.stringify([['PATCH status', 'p2', 'inactive']]), JSON.stringify(calls));
  ok('the dialog closes and the product is still listed', (await dialog.count()) === 0 && (await page.getByTestId('delete-product-p2').count()) === 1);

  // ---- allowed: unused product ----
  await page.getByTestId('delete-product-p1').click();
  await page.getByTestId('delete-summary').waitFor();
  const summary = (await page.getByTestId('delete-summary').innerText()).replace(/\s+/g, ' ');
  ok('an unused product shows what will be removed (variants, SKUs, history)', /2 colour variants and 7 SKUs/.test(summary) && /stock history/.test(summary), summary);
  ok('the dialog warns the delete is permanent', /cannot be undone/i.test(await page.getByTestId('delete-dialog-body').innerText()));
  ok('no blockers are shown and delete is enabled', (await page.getByTestId('delete-blockers').count()) === 0 && !(await confirm.isDisabled()));
  ok('no "deactivate instead" button when the product can be deleted', (await page.getByTestId('delete-deactivate').count()) === 0);
  // cancel first: nothing happens
  await dialog.getByRole('button', { name: 'Cancel' }).click(); await page.waitForTimeout(300);
  ok('Cancel deletes nothing', calls.filter(([c]) => c === 'DELETE product').length === 0 && prods.length === 2);
  await page.getByTestId('delete-product-p1').click();
  await confirm.click(); await page.waitForTimeout(600);
  ok('confirming deletes the product on the server', prods.length === 1 && prods[0]._id === 'p2');
  ok('the row disappears from the list without a reload', (await page.getByTestId('delete-product-p1').count()) === 0);
  ok('a success toast names the product', /Unused Tee.*deleted/i.test(await page.locator('body').innerText()));

  // ---- the server refuses even if the check passed earlier ----
  productRefs.p2 = [];
  await page.goto(BASE + '/products', { waitUntil: 'networkidle' });
  await page.getByTestId('delete-product-p2').click();
  await page.getByTestId('delete-summary').waitFor();
  productRefs.p2 = [B('orders', 'order', 1)];   // it becomes referenced in the meantime
  await confirm.click(); await page.waitForTimeout(500);
  ok('a server refusal is shown in the dialog, not swallowed', /used by 1 order/i.test(await page.getByTestId('delete-error').innerText()));
  ok('and nothing was removed', prods.length === 1);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // ---- a reference check the server could not run blocks the delete ----
  productRefs.p2 = [{ key: 'unverified', label: 'reference that could not be checked (see the server log)', count: 1, text: '1 reference that could not be checked (see the server log)' }];
  await page.goto(BASE + '/products', { waitUntil: 'networkidle' });
  await page.getByTestId('delete-product-p2').click();
  await page.getByTestId('delete-blockers').waitFor();
  const unv = (await page.getByTestId('delete-blockers').innerText()).replace(/\s+/g, ' ');
  ok('an unverifiable check blocks the delete and says where to look', /Could not check/.test(unv) && /server log/.test(unv) && await confirm.isDisabled(), unv);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  productRefs.p2 = [];

  // ================= Categories =================
  await page.goto(BASE + '/categories', { waitUntil: 'networkidle' });
  const openMenu = async (id) => { await page.getByRole('button', { name: new RegExp(`Actions for ${id}`) }).click(); };

  // blocked: has products
  await openMenu('Tops');
  await page.getByTestId('delete-category-c1').click();
  await page.getByTestId('delete-blockers').waitFor();
  ok('a category with products is blocked and says so', /Contains 1 product/.test(await page.getByTestId('delete-blockers').innerText()) && await confirm.isDisabled());
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // blocked: has sub-categories
  await openMenu('Parent');
  await page.getByTestId('delete-category-c3').click();
  await page.getByTestId('delete-blockers').waitFor();
  ok('a category with sub-categories is blocked and says so', /Contains 1 sub-category/.test(await page.getByTestId('delete-blockers').innerText()));
  ok('it offers to deactivate the category instead', await page.getByTestId('delete-deactivate').isVisible());
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // allowed: empty category
  await openMenu('Empty Rail');
  await page.getByTestId('delete-category-c2').click();
  await page.getByTestId('delete-summary').waitFor();
  ok('an empty category can be deleted', /Nothing is inside it/i.test(await page.getByTestId('delete-summary').innerText()) && !(await confirm.isDisabled()));
  await confirm.click(); await page.waitForTimeout(600);
  ok('the category is deleted on the server and gone from the table', !cats2.some((c) => c._id === 'c2') && !/Empty Rail/.test(await page.locator('table').innerText()));
  ok('a success toast names the category', /Empty Rail.*deleted/i.test(await page.locator('body').innerText()));
  await openMenu('Child');
  await page.getByTestId('delete-category-c4').click();
  await confirm.click(); await page.waitForTimeout(600);
  await openMenu('Parent');
  await page.getByTestId('delete-category-c3').click();
  await page.getByTestId('delete-summary').waitFor();
  ok('once the child is gone the parent can be deleted', !(await confirm.isDisabled()));
  await confirm.click(); await page.waitForTimeout(600);
  ok('both are gone', !cats2.some((c) => ['c3', 'c4'].includes(c._id)));

  ok('no page errors', errs.length === 0, errs.join('|'));
  console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
  await b.close(); process.exit(out.every(Boolean) ? 0 : 1);
})();
