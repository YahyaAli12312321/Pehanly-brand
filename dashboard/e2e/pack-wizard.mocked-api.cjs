// Flexible wholesale pack wizard against a stateful fake API. Run: npm run build && npx vite preview --port 3997 --strictPort, then node e2e/pack-wizard.mocked-api.cjs
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

  await page.goto(BASE + '/wholesale', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Ready Packs' }).click();
  await page.getByRole('button', { name: /New pack/ }).click();
  ok('fixed pack form is unchanged by default (no wizard, single Create pack button)', (await page.getByTestId('flex-wizard').count()) === 0 && await page.getByRole('button', { name: 'Create pack' }).isVisible());
  await page.getByRole('dialog').locator('input').first().fill('Mega Pack');
  await page.getByLabel('Customer chooses colours & sizes').check();
  ok('wizard shows the 5 steps', (await page.getByTestId('flex-wizard').locator('[data-testid^=pack-step-]').count()) === 5);
  await page.getByTestId('pack-size').fill('200');
  await page.getByTestId('pack-next').click(); // no category yet
  ok('category is required before the pack product is created', db.products.length === 0 && /category/i.test(await page.getByRole('dialog').innerText()));
  await page.getByTestId('pack-category').selectOption('c1');
  await page.getByTestId('pack-next').click();
  await page.waitForTimeout(400);
  ok('Save & continue creates ONE wholesale-only DRAFT product (not retail)', db.products.length === 1 && db.products[0].salesChannel === 'wholesale' && db.products[0].status === 'draft', JSON.stringify(db.products[0] && [db.products[0].salesChannel, db.products[0].status]));

  // Step 2: same Color Variants step as Product Creation
  ok('Color Variants step is the product-creation step', await page.getByText('Color Variants (Parent Variants)').isVisible());
  await page.getByRole('button', { name: /Add (Color|Colour)/i }).first().click();
  await page.getByRole('button', { name: /Add (Color|Colour)/i }).first().click();
  await page.getByPlaceholder(/Colour name/).nth(0).fill('Red'); await page.getByPlaceholder('VARIANT CODE').nth(0).fill('MP-RED');
  await page.getByPlaceholder(/Colour name/).nth(1).fill('Blue'); await page.getByPlaceholder('VARIANT CODE').nth(1).fill('MP-BLU');
  await page.getByTestId('pack-next').click();

  // Step 3: same SKUs step (Adult / Kids / Manual)
  ok('SKUs step has the Adult / Kids / Manual selector', await page.getByTestId('size-mode').isVisible());
  const rows = page.getByRole('dialog').locator('tbody tr');
  await page.getByTestId('size-mode-kids').click();
  const kids = await rows.count();
  ok('Kids mode: 6 chart sizes x 2 colours = 12 rows', kids === 12, String(kids));
  ok('kids SKU codes are the chart sizes', (await rows.nth(0).locator('input[type=text]').nth(0).inputValue()) === 'MP-RED-X-SMALL' && (await rows.nth(5).locator('input[type=text]').nth(0).inputValue()) === 'MP-RED-2-XL');
  await page.getByTestId('all-skus').click();
  ok('clicking generate again adds no duplicates', (await rows.count()) === 12);
  await page.getByTestId('size-mode-adult').click();
  ok('switching to Adult swaps to 7 adult sizes x 2 colours = 14 rows', (await rows.count()) === 14, String(await rows.count()));
  ok('SKU codes follow VARIANTCODE-SIZE', (await rows.first().locator('input[type=text]').first().inputValue()) === 'MP-RED-XS');
  for (let i = 0; i < 14; i++) { const n = rows.nth(i).locator('input[type=number]'); await n.nth(0).fill('2000'); await n.nth(4).fill('1500'); await n.nth(5).fill('50'); }
  // navigate back and forth: nothing lost
  await page.getByTestId('pack-step-0').click();
  ok('Pack details kept when going back', (await page.getByRole('dialog').locator('input').first().inputValue()) === 'Mega Pack');
  await page.getByTestId('pack-step-1').click();
  ok('colours kept', (await page.getByPlaceholder(/Colour name/).nth(1).inputValue()) === 'Blue');
  await page.getByTestId('pack-step-2').click();
  ok('SKU rows + typed prices kept after navigating', (await rows.count()) === 14 && (await rows.nth(5).locator('input[type=number]').nth(4).inputValue()) === '1500');
  await page.getByTestId('pack-step-3').click();
  await page.getByTestId('pack-step-4').click();
  ok('Review shows 2 unsaved colours', /2 unsaved/.test(await page.getByTestId('pack-review').innerText()));
  await page.getByTestId('pack-save').click();
  await page.waitForTimeout(1500);
  ok('colours saved through the product variant endpoints', db.variants.length === 2 && db.skus.length === 14, db.calls.join(' | '));
  ok('the pack product was published (wholesale-only)', db.products[0].status === 'active' && db.products[0].salesChannel === 'wholesale');
  const pb = db.packBodies[0] || {};
  ok('pack saved as flexible, size 200, linked to its product', pb.selectionMode === 'flexible' && pb.packSize === 200 && pb.colorProduct === db.products[0]._id, JSON.stringify([pb.selectionMode, pb.packSize, pb.colorProduct]));
  ok('pack items are exactly the 14 existing SKU records, quantity 1, no duplicates', pb.items && pb.items.length === 14 && new Set(pb.items.map((i) => i.sku)).size === 14 && pb.items.every((i) => i.quantity === 1 && db.skus.some((s) => s._id === i.sku)));
  ok('no second product / no retail product created', db.products.length === 1);
  ok('no page errors', errs.length === 0, errs.join('|'));
  console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
  await b.close(); process.exit(out.every(Boolean) ? 0 : 1);
})();
