// Kids SKU mode in RETAIL product creation against a stateful fake API. Run: npm run build && npx vite preview --port 3997 --strictPort, then node e2e/kids-retail.mocked-api.cjs
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = 'http://localhost:3997';
const out = []; const ok = (n, c, d = '') => { out.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const owner = { id: 'u1', name: 'Owner', email: 'owner@pehanly.pk', role: 'admin', permissions: [] };

// Stateful fake of the backend catalog contract: product -> variants -> SKUs(+stock) -> ledger.
const db = { products: [], variants: [], skus: [], ledger: [], calls: [], packs: [], packBodies: [] };
const failSku = { value: null };
let seq = 0; const id = (p) => `${p}${++seq}`;
const summaryOf = (pid) => {
  const vs = db.variants.filter((v) => v.product === pid); const ss = db.skus.filter((s) => s.product === pid);
  const prices = ss.map((s) => s.price);
  return { variantsCount: vs.length, skuCount: ss.length, eligibleSkuCount: ss.length, priceMin: prices.length ? Math.min(...prices) : null, priceMax: prices.length ? Math.max(...prices) : null,
    availableStock: ss.reduce((n, s) => n + s.available, 0), lowStockSkus: ss.filter((s) => s.available > 0 && s.available <= s.lowStockThreshold).length, outOfStockSkus: ss.filter((s) => s.available <= 0).length };
};
const view = (p) => ({ ...p, category: { _id: 'c1', name: 'Shoes', slug: 'shoes' }, ...summaryOf(p._id) }); // list = flat spread, like product.service.list
const dview = (p) => { const { variantsCount, skuCount, eligibleSkuCount, priceMin, priceMax, availableStock, lowStockSkus, outOfStockSkus, ...rest } = view(p); return { ...rest, summary: summaryOf(p._id) }; };
const detail = (p) => ({ ...dview(p), readiness: { ready: summaryOf(p._id).skuCount > 0, issues: summaryOf(p._id).skuCount > 0 ? [] : ['Add a colour variant with a size'] },
  variants: db.variants.filter((v) => v.product === p._id).map((v) => ({ ...v, sizes: db.skus.filter((s) => s.variant === v._id) })) });

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.route(/https:\/\/fonts\./, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/api/v1/**', async (r) => {
    const req = r.request(); const p = new URL(req.url()).pathname.replace('/api/v1', ''); const m = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const j = (d, s = 200, x = {}) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify({ success: s < 400, message: 'ok', data: d, ...x }) });
    const err = (s, message, code) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify({ success: false, message, code }) });
    if (p === '/auth/me') return j({ user: owner });
    if (p === '/admin/categories') return j([{ _id: 'c1', name: 'Shoes', slug: 'shoes', isActive: true }], 200, { meta: { page: 1, limit: 100, total: 1, totalPages: 1 } });
    if (p === '/admin/products/summary') return j({ total: db.products.length, active: 0, draft: db.products.length, inactive: 0, lowStockProducts: 0, lowStockSkus: 0, outOfStockProducts: 0, outOfStockSkus: 0 });
    if (p === '/admin/products' && m === 'GET') return j(db.products.map(view), 200, { meta: { page: 1, limit: 20, total: db.products.length, totalPages: 1 } });
    if (p === '/admin/products' && m === 'POST') { db.calls.push('POST product'); const pr = { _id: id('p'), status: 'draft', slug: body.slug || 'x', ...body }; db.products.push(pr); return j(view(pr), 201); }
    let mm;
    if ((mm = p.match(/^\/admin\/products\/([^/]+)\/variants$/)) && m === 'POST') {
      db.calls.push('POST variant ' + body.color.name);
      if (failSku.value && body.sizes.some((s) => s.sku === failSku.value)) return err(409, `SKU ${failSku.value} already exists`, 'SKU_EXISTS');
      const v = { _id: id('v'), product: mm[1], color: body.color, variantCode: body.variantCode, images: [], isEnabled: true };
      db.variants.push(v);
      for (const s of body.sizes) { // same transaction on the real backend: SKU + stock + ledger row
        const sk = { _id: id('s'), product: mm[1], variant: v._id, size: s.size, sku: s.sku, price: s.price, wholesalePrice: s.wholesalePrice, priceUSD: s.priceUSD, stock: s.stock, reservedStock: 0, available: s.stock, isEnabled: true };
        db.skus.push(sk); if (s.stock > 0) db.ledger.push({ sku: s.sku, type: 'stock_in', qty: s.stock, reason: 'Initial stock' });
      }
      return j({ ...v, sizes: db.skus.filter((s) => s.variant === v._id) }, 201);
    }
    if ((mm = p.match(/^\/admin\/products\/([^/]+)\/variants\/([^/]+)$/)) && m === 'PATCH') {
      db.calls.push('PATCH variant'); db.patch = body;
      const v = db.variants.find((x) => x._id === mm[2]);
      for (const s of body.sizes) { if (db.skus.find((k) => k.sku === s.sku)) continue; const sk = { _id: id('s'), product: mm[1], variant: v._id, size: s.size, sku: s.sku, price: s.price, priceUSD: s.priceUSD, lowStockThreshold: s.lowStockThreshold, stock: s.stock || 0, reservedStock: 0, available: s.stock || 0, isEnabled: true }; db.skus.push(sk); if (sk.stock > 0) db.ledger.push({ sku: s.sku, type: 'stock_in', qty: sk.stock, reason: 'Initial stock' }); }
      return j({ ...v, sizes: db.skus.filter((k) => k.variant === v._id) });
    }
    if ((mm = p.match(/^\/admin\/products\/([^/]+)$/))) { const pr = db.products.find((x) => x._id === mm[1]); if (!pr) return err(404, 'nf', 'NOT_FOUND'); return j(m === 'GET' ? detail(pr) : view(pr)); }
    if ((mm = p.match(/^\/admin\/products\/([^/]+)\/status$/))) { const pr = db.products.find((x) => x._id === mm[1]); pr.status = body.status; db.calls.push('PATCH status ' + body.status); return j(view(pr)); }
    if (p === '/admin/wholesale/packs' && m === 'POST') { db.packBodies.push(body); const pk = { _id: id('k'), ...body }; db.packs.push(pk); return j(pk, 201); }
    if (p === '/admin/wholesale/packs') return j(db.packs, 200, { meta: { page: 1, limit: 10, total: db.packs.length, totalPages: 1 } });
    return j([]);
  });

  await page.goto(BASE + '/products', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Add Product/ }).first().click();
  await page.getByPlaceholder('Garment name...').fill('Kids Tee');
  await page.getByRole('button', { name: /Next Step/ }).click();
  await page.locator('select option[value="c1"]').first().waitFor({ state: 'attached' });
  await page.getByRole('dialog').locator('select:not([data-testid="audience-select"])').selectOption('c1');
  ok('retail is the default sales channel', await page.getByTestId('sales-channel').locator('input[value=retail]').isChecked());
  await page.getByRole('button', { name: /Next Step/ }).click();
  await page.getByRole('button', { name: /Save draft/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Add (Color|Colour)/i }).first().click();
  await page.getByRole('button', { name: /Add (Color|Colour)/i }).first().click();
  await page.getByPlaceholder(/Colour name/).nth(0).fill('Red'); await page.getByPlaceholder('VARIANT CODE').nth(0).fill('KT-RED');
  await page.getByPlaceholder(/Colour name/).nth(1).fill('Blue'); await page.getByPlaceholder('VARIANT CODE').nth(1).fill('KT-BLU');
  await page.getByRole('button', { name: /Next Step/ }).click();
  const rows = page.getByRole('dialog').locator('tbody tr');
  await page.getByTestId('size-mode-kids').click();
  ok('Kids: 6 chart sizes x 2 colours = 12 rows', (await rows.count()) === 12, String(await rows.count()));
  const opts = await rows.first().locator('select option').allInnerTexts();
  ok('size dropdown shows exactly the chart sizes with ages', JSON.stringify(opts) === JSON.stringify(['X-Small (1-2 yrs)', 'Small (3-4 yrs)', 'Medium (5-6 yrs)', 'Large (7-8 yrs)', 'X-Large (9-10 yrs)', '2-XL (11-12 yrs)']), JSON.stringify(opts));
  const codes = []; for (let i = 0; i < 12; i++) codes.push(await rows.nth(i).locator('input[type=text]').first().inputValue());
  ok('SKU codes use VARIANTCODE-SIZE for both colours', codes.slice(0, 6).join() === 'KT-RED-X-SMALL,KT-RED-SMALL,KT-RED-MEDIUM,KT-RED-LARGE,KT-RED-X-LARGE,KT-RED-2-XL' && codes[6] === 'KT-BLU-X-SMALL', codes.join());
  // edit one generated SKU, then regenerate: edit kept, no duplicates
  await rows.nth(1).locator('input[type=text]').first().fill('KT-RED-CUSTOM');
  await page.getByTestId('all-skus').click();
  ok('regenerating keeps the edited SKU and adds nothing', (await rows.count()) === 12 && (await rows.nth(1).locator('input[type=text]').first().inputValue()) === 'KT-RED-CUSTOM');
  await page.getByTestId('size-mode-adult').click();
  ok('Adult still generates the 7 adult sizes (edited kids row kept)', (await rows.count()) === 7 * 2 + 1, String(await rows.count()));
  await page.getByTestId('size-mode-manual').click();
  const before = await rows.count();
  await page.getByRole('dialog').getByRole('button', { name: /Add Size SKU/ }).first().click();
  ok('Manual still adds one row at a time', (await rows.count()) === before + 1);
  ok('no page errors', errs.length === 0, errs.join('|'));
  console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
  await b.close(); process.exit(out.every(Boolean) ? 0 : 1);
})();
