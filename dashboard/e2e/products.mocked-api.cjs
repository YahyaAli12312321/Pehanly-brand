// Browser test against a STATEFUL FAKE of the catalog API (no MongoDB). Run: npm run build && npx vite preview --port 3997 --strictPort, then node e2e/products.mocked-api.cjs
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = 'http://localhost:3997';
const out = []; const ok = (n, c, d = '') => { out.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const owner = { id: 'u1', name: 'Owner', email: 'owner@pehanly.pk', role: 'admin', permissions: [] };

// Stateful fake of the backend catalog contract: product -> variants -> SKUs(+stock) -> ledger.
const db = { products: [], variants: [], skus: [], ledger: [], calls: [] };
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
        const sk = { _id: id('s'), product: mm[1], variant: v._id, size: s.size, sku: s.sku, price: s.price, priceUSD: s.priceUSD, lowStockThreshold: s.lowStockThreshold, stock: s.stock, reservedStock: 0, available: s.stock, isEnabled: true };
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
    if ((mm = p.match(/^\/admin\/products\/([^/]+)\/status$/))) return j(view(db.products.find((x) => x._id === mm[1])));
    return j([]);
  });

  const fillColour = async (idx, name, code, rows) => {
    // step 3: colour cards
    await page.getByPlaceholder(/Colour name/).nth(idx).fill(name);
    await page.getByPlaceholder('VARIANT CODE').nth(idx).fill(code);
  };

  await page.goto(BASE + '/products', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Add Product/ }).first().click();
  await page.getByPlaceholder('Garment name...').fill('Court Sneaker');
  await page.getByRole('button', { name: /Next Step/ }).click();
  await page.locator('select option[value="c1"]').first().waitFor({ state: 'attached' });
  await page.getByRole('dialog').getByRole('combobox').selectOption('c1');
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /Next Step/ }).click(); // -> Images
  await page.getByRole('button', { name: /Save draft/ }).click(); // creates the draft, -> Colour variants
  await page.waitForTimeout(400);
  ok('draft product created via POST /admin/products', db.products.length === 1, (await page.locator('[role=dialog], body').last().innerText()).replace(/\s+/g,' ').slice(0,400));

  // Two colour variants.
  await page.getByRole('button', { name: /Add (Color|Colour)/i }).first().click();
  await page.getByRole('button', { name: /Add (Color|Colour)/i }).first().click();
  await fillColour(0, 'White', 'CS-WHT'); await fillColour(1, 'Black', 'CS-BLK');
  await page.getByRole('button', { name: /Next Step/ }).click(); // -> Sizes & SKUs

  const spec = [
    ['CS-WHT-M', 'M', 4500, 19.5, 10, 3], ['CS-WHT-L', 'L', 4700, 20.5, 8, 2],
    ['CS-BLK-M', 'M', 4600, 19.9, 6, 4], ['CS-BLK-L', 'L', 4800, 21.5, 4, 1],
  ];
  // each colour has 1 default size row (S). Add one more per colour, then fill 2 rows each.
  const addBtns = page.getByRole('button', { name: /Add Size SKU/ });
  await addBtns.nth(0).click(); await addBtns.nth(1).click();
  const rows = page.getByRole('dialog').locator('tbody tr');
  ok('4 size rows shown', (await rows.count()) === 4, String(await rows.count()));
  for (let i = 0; i < 4; i++) {
    const r = rows.nth(i); const [sku, size, price, usd, stock, low] = spec[i];
    const nums = r.locator('input[type=number]');
    await r.locator('input[type=text]').nth(0).fill(size);
    await r.locator('input[type=text]').nth(1).fill(sku);
    await nums.nth(0).fill(String(price)); // PKR
    await r.getByLabel(/^USD price/).fill(String(usd));
    await nums.nth(5).fill(String(stock)); // stock (6th number input)
    await nums.nth(6).fill(String(low));
  }
  await page.getByRole('button', { name: /^Save Product|Save Product/ }).first().isVisible().catch(() => {});
  await page.getByRole('button', { name: /SEO/ }).click();
  ok('summary shows 2 unsaved colours before saving', await page.getByText(/2 unsaved/).first().isVisible());
  await page.getByRole('button', { name: /Save Product/ }).click();
  await page.waitForTimeout(1200);
  ok('both variants persisted via POST /variants', db.variants.length === 2 && db.skus.length === 4, db.calls.join(' | '));
  ok('each SKU stored with its own stock/threshold/prices', JSON.stringify(db.skus.map((s) => [s.sku, s.price, s.priceUSD, s.stock, s.lowStockThreshold])) === JSON.stringify(spec.map((s) => [s[0], s[2], s[3], s[4], s[5]])));
  ok('ledger has 4 "Initial stock" stock_in rows, sum = 28', db.ledger.length === 4 && db.ledger.reduce((n, l) => n + l.qty, 0) === 28);
  ok('stock lives only on SKUs (product has no stock/variant fields)', !('stock' in db.products[0]) && !('variants' in db.products[0]));
  ok('editor closed after full success', (await page.getByRole('button', { name: /Save Product/ }).count()) === 0);

  const row = page.locator('tbody tr').first(); const txt = await row.innerText();
  ok('Products table: 2 colors', /2 colors/.test(txt), txt.replace(/\s+/g, ' '));
  ok('Products table: 4 SKUs', /4 SKUs/.test(txt));
  ok('Products table: 28 pcs', /28 pcs/.test(txt));
  ok('Products table: price range 4,500 – 4,800', /4,500.*4,800/.test(txt));

  // Reload = refetch from (fake) backend, no client storage.
  await page.reload({ waitUntil: 'networkidle' });
  const t2 = await page.locator('tbody tr').first().innerText();
  ok('after browser refresh values come from the API', /2 colors/.test(t2) && /4 SKUs/.test(t2) && /28 pcs/.test(t2));
  const ls = await page.evaluate(() => JSON.stringify({ l: Object.keys(localStorage), s: Object.keys(sessionStorage) }));
  ok('no product data in browser storage', !/product|variant|sku/i.test(ls), ls);

  // Edit flow: existing stock read-only, add a NEW SKU with initial stock.
  await page.locator('tbody tr').first().getByTitle('Open product editor').click();
  await page.getByRole('button', { name: /Sizes & SKUs/ }).click();
  await page.waitForTimeout(500);
  const firstStockCell = page.getByRole('dialog').locator('tbody tr').first().locator('td').nth(7);
  ok('existing SKU stock is read-only text', (await firstStockCell.locator('input').count()) === 0 && /10 avail/.test(await firstStockCell.innerText()));
  await page.getByRole('button', { name: /Add Size SKU/ }).first().click();
  const nr = page.getByRole('dialog').locator('tbody tr').nth(2);
  await nr.locator('input[type=text]').nth(0).fill('XL'); await nr.locator('input[type=text]').nth(1).fill('CS-WHT-XL');
  const nn = nr.locator('input[type=number]'); await nn.nth(0).fill('4900'); await nn.nth(5).fill('5');
  await page.getByRole('button', { name: /SEO/ }).click();
  failSku.value = null;
  await page.getByRole('button', { name: /Save Product/ }).click();
  await page.waitForTimeout(800);
  const old = db.patch && db.patch.sizes.filter((x) => x.sku !== 'CS-WHT-XL');
  ok('edit: PATCH sent, existing SKUs carry no stock field, new SKU carries stock 5', !!db.patch && old.every((x) => !('stock' in x)) && db.patch.sizes.find((x) => x.sku === 'CS-WHT-XL').stock === 5);
  ok('edit: new SKU became real inventory (5 added, ledger row), total now 33', db.skus.length === 5 && db.ledger.length === 5 && db.skus.reduce((n, k) => n + k.available, 0) === 33);

  // ---- Partial failure: 2nd colour's SKU is rejected by the backend.
  await page.getByRole('dialog').getByRole('button', { name: /Close/ }).click().catch(() => {});
  await page.waitForTimeout(300);
  await page.goto(BASE + '/products', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Add Product/ }).first().click();
  await page.getByPlaceholder('Garment name...').fill('Failing Shoe');
  await page.getByRole('button', { name: /Next Step/ }).click();
  await page.locator('select option[value="c1"]').first().waitFor({ state: 'attached' });
  await page.getByRole('dialog').getByRole('combobox').selectOption('c1');
  await page.getByRole('button', { name: /Next Step/ }).click();
  await page.getByRole('button', { name: /Save draft/ }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Add (Color|Colour)/i }).first().click();
  await page.getByRole('button', { name: /Add (Color|Colour)/i }).first().click();
  await fillColour(0, 'White', 'F-WHT'); await fillColour(1, 'Black', 'F-BLK');
  await page.getByRole('button', { name: /Next Step/ }).click();
  const fr = page.getByRole('dialog').locator('tbody tr');
  for (let i = 0; i < 2; i++) {
    const r = fr.nth(i); const n = r.locator('input[type=number]');
    await r.locator('input[type=text]').nth(1).fill(i ? 'F-BLK-S' : 'F-WHT-S'); await n.nth(0).fill('3000'); await n.nth(5).fill('9');
  }
  failSku.value = 'F-BLK-S';
  const productsBefore = db.products.length;
  await page.getByRole('button', { name: /SEO/ }).click();
  await page.getByRole('button', { name: /Save Product/ }).click();
  await page.waitForTimeout(1000);
  const dlg = await page.getByRole('dialog').innerText();
  ok('partial failure is reported clearly (1 of 2 saved, names the colour)', /only 1 of 2 colour variants were saved/.test(dlg) && /Black/.test(dlg));
  ok('editor stays open, no fake success toast', (await page.getByRole('dialog').count()) === 1 && !(await page.getByText(/saved with 2 colour/).count()));
  ok('nothing auto-deleted: product + first colour remain', db.products.length === productsBefore && db.products.some((x) => x.name === 'Failing Shoe') && db.variants.filter((v) => v.variantCode === 'F-WHT').length === 1);
  ok('no page errors', errs.length === 0, errs.join(' | '));
  console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
  await b.close(); process.exit(out.every(Boolean) ? 0 : 1);
})();
