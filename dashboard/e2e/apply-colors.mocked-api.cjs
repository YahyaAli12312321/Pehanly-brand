// Apply to All Colors (retail + wholesale-only; Adult/Kids/Manual) against a stateful fake API (NOT a real backend/DB). Run: npm run build && npx vite preview --port 3997 --strictPort, then node e2e/kids-retail.mocked-api.cjs
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


  const dlg = page.getByRole('dialog');
  const rows = dlg.locator('tbody tr');
  const num = (r, i) => rows.nth(r).locator('input[type=number]').nth(i);
  const txt = (r, i) => rows.nth(r).locator('input[type=text], select').nth(i);
  const sel = async (r) => (await rows.nth(r).locator('select').count()) ? rows.nth(r).locator('select').inputValue() : rows.nth(r).locator('input[type=text]').first().inputValue();
  const skuAt = (r) => rows.nth(r).locator('input[type=text]').last().inputValue();
  const dump = async () => { const n = await rows.count(); const out = []; for (let r = 0; r < n; r++) out.push({ size: await sel(r), sku: await skuAt(r), price: await num(r, 0).inputValue(), wh: await num(r, 4).inputValue(), stock: await num(r, 5).inputValue() }); return out; };
  const toSkus = async (channel, name, prefix) => {
    await page.goto(BASE + '/products', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Add Product/ }).first().click();
    await page.getByPlaceholder('Garment name...').fill(name);
    await page.getByRole('button', { name: /Next Step/ }).click();
    await page.locator('select option[value="c1"]').first().waitFor({ state: 'attached' });
    await dlg.locator('select:not([data-testid="audience-select"])').selectOption('c1');
    if (channel === 'wholesale') await page.getByTestId('sales-channel').locator('input[value=wholesale]').check();
    await page.getByRole('button', { name: /Next Step/ }).click();
    await page.getByRole('button', { name: /Save draft/ }).click(); await page.waitForTimeout(400);
    const cols = [['Black', 'BLK'], ['Red', 'RED'], ['White', 'WHT'], ['Blue', 'BLU']];
    for (let i = 0; i < cols.length; i++) await page.getByRole('button', { name: /Add (Color|Colour)/i }).first().click();
    for (let i = 0; i < cols.length; i++) { await page.getByPlaceholder(/Colour name/).nth(i).fill(cols[i][0]); await page.getByPlaceholder('VARIANT CODE').nth(i).fill(`${prefix}-${cols[i][1]}`); }
    await page.getByRole('button', { name: /Next Step/ }).click();
  };
  // Black = first card. Manual: add rows, type sizes, enter price / (wholesale) / stock.
  const manualBlack = async (cfg) => { // [[size, price, wholesale, stock]]
    for (let i = 1; i < cfg.length; i++) await dlg.getByRole('button', { name: /Add Size SKU/ }).first().click();
    for (let r = 0; r < cfg.length; r++) {
      await rows.nth(r).locator('input[type=text]').first().fill(cfg[r][0]);
      await num(r, 0).fill(String(cfg[r][1])); if (cfg[r][2]) await num(r, 4).fill(String(cfg[r][2])); await num(r, 5).fill(String(cfg[r][3]));
    }
  };
  const BLACK = [['S', 1500, 0, 200], ['M', 1500, 0, 150], ['L', 1600, 0, 100], ['XL', 1600, 0, 80]];
  const panel = page.getByTestId('apply-panel');
  const colourRows = async () => { // group dump by prefix of SKU
    const d = await dump(); const g = {}; for (const r of d) { const k = r.sku.split('-').slice(0, 2).join('-'); (g[k] = g[k] || []).push(r); } return g;
  };

  // ===== 1. Retail / Manual: the brief's example =====
  await toSkus('retail', 'Retail Tee', 'RT');
  ok('Apply to All Colors button is on the SKU step', await page.getByTestId('apply-all-colors').isVisible());
  await page.getByTestId('size-mode-manual').click();
  await manualBlack(BLACK);
  await page.getByTestId('apply-all-colors').click();
  ok('preview shows the source colour (Black by default)', (await page.getByTestId('apply-source').locator('option:checked').innerText()) === 'Black');
  ok('preview lists the target colours', (await page.getByTestId('apply-targets').innerText()).includes('Red, White, Blue'));
  const prev = (await page.getByTestId('apply-preview').innerText()).replace(/\s+/g, ' ');
  ok('preview shows sizes, prices and stock to be copied', ['S 1,500 - - - 200', 'M 1,500 - - - 150', 'L 1,600 - - - 100', 'XL 1,600 - - - 80'].every((x) => prev.includes(x)), prev);
  ok('preview counts 9 new SKUs + 3 empty default S rows to fill, no conflicts', /9\s*new SKUs will be created/.test(await page.getByTestId('apply-counts').innerText()) && /3\s*empty existing rows will be filled/.test(await page.getByTestId('apply-counts').innerText()) && (await page.getByTestId('apply-conflicts').count()) === 0);
  await page.getByTestId('apply-confirm').click(); await page.waitForTimeout(300);
  const sum = (await page.getByTestId('apply-summary-counts').innerText()).replace(/\s+/g, ' ');
  ok('summary: 9 created + 3 filled (12 SKUs configured), 0 skipped, 0 conflicts', /SKUs created: 9/.test(sum) && /filled in: 3/.test(sum) && /existing skipped: 0/.test(sum) && /conflicts needing attention: 0/.test(sum), sum);
  let g = await colourRows();
  ok('16 rows, 4 colours x 4 sizes', (await rows.count()) === 16 && Object.keys(g).length === 4, Object.keys(g).join());
  const byS = (rs) => JSON.stringify(rs.map((r) => [r.size, r.price, r.stock]).sort((a, b) => a[0].localeCompare(b[0])));
  const same = Object.entries(g).every(([, rs]) => byS(rs) === byS(BLACK.map((b) => ({ size: b[0], price: String(b[1]), stock: String(b[3]) }))));
  ok('every colour has the same sizes, prices and stock as Black', same, JSON.stringify(g['RT-RED']));
  const allSkus = (await dump()).map((r) => r.sku);
  ok('all 16 SKUs unique, VARIANTCODE-SIZE', new Set(allSkus).size === 16 && allSkus.includes('RT-RED-XL') && allSkus.includes('RT-BLU-S'), allSkus.join());
  // repeat click
  await page.getByTestId('apply-all-colors').click();
  ok('repeat: preview says 0 new, 12 already match', /0\s*new SKUs/.test(await page.getByTestId('apply-counts').innerText()) && /12\s*already match/.test(await page.getByTestId('apply-counts').innerText()));
  ok('repeat: nothing to apply (button disabled)', await page.getByTestId('apply-confirm').isDisabled());
  await page.getByRole('button', { name: 'Cancel' }).click();
  ok('repeat: still exactly 16 rows', (await rows.count()) === 16);
  // protect manual data: edit Red S (row 4) and White M stock, then apply again
  await num(4, 0).fill('999'); await num(4, 5).fill('5');
  await page.getByTestId('apply-all-colors').click();
  const conf = (await page.getByTestId('apply-conflicts').innerText()).replace(/\s+/g, ' ');
  ok('conflict summary names Red S with old -> new values', /Red S \(RT-RED-S\).*Price 999 → 1,500.*Opening stock 5 → 200/.test(conf), conf);
  await page.getByTestId('apply-confirm').click(); await page.waitForTimeout(300);
  ok('"add missing only" keeps the hand-entered values', (await num(4, 0).inputValue()) === '999' && (await num(4, 5).inputValue()) === '5');
  ok('summary reports the conflict needing attention', /conflicts needing attention: 1/.test(await page.getByTestId('apply-summary-counts').innerText()));
  await page.getByTestId('apply-all-colors').click();
  await page.getByTestId('apply-overwrite').click(); await page.waitForTimeout(300); // dialog auto-accepted
  ok('confirmed overwrite replaces the conflicting values only', (await num(4, 0).inputValue()) === '1500' && (await num(4, 5).inputValue()) === '200' && (await rows.count()) === 16);
  // edit after applying, save one colour, check what the API receives
  await num(8, 5).fill('77'); // White S stock
  ok('colours remain individually editable after applying', (await num(8, 5).inputValue()) === '77');
  const saveBtns = dlg.getByRole('button', { name: /(Create|Save) colour variant/i });
  const nSave = await saveBtns.count();
  for (let i = 0; i < nSave; i++) { await saveBtns.nth(i).click(); await page.waitForTimeout(250); }
  const sk = db.skus;
  ok('API got 16 SKUs, all unique', sk.length === 16 && new Set(sk.map((s) => s.sku)).size === 16, String(sk.length));
  const bySku = Object.fromEntries(sk.map((s) => [s.sku, s]));
  ok('saved: Red/Blue copy Black exactly (price + stock)', ['RED', 'BLU'].every((c) => BLACK.every(([z, p, , st]) => bySku[`RT-${c}-${z}`]?.price === p && bySku[`RT-${c}-${z}`]?.stock === st)));
  ok('saved: the edited White S stock (77) was kept', bySku['RT-WHT-S']?.stock === 77 && bySku['RT-WHT-M']?.stock === 150);
  ok('opening stock written to the ledger for each SKU', db.ledger.length === 16);

  // ===== 2. Wholesale-only: wholesale price copies =====
  await toSkus('wholesale', 'Wholesale Tee', 'WT');
  await page.getByTestId('size-mode-manual').click();
  await manualBlack([['S', 1500, 1000, 200], ['M', 1500, 1000, 150], ['L', 1600, 1100, 100]]);
  await page.getByTestId('apply-all-colors').click();
  ok('wholesale-only: preview shows wholesale prices', (await page.getByTestId('apply-preview').innerText()).includes('1,100'));
  await page.getByTestId('apply-confirm').click(); await page.waitForTimeout(300);
  g = await colourRows();
  ok('wholesale-only: 12 rows, wholesale price + stock copied to every colour', (await rows.count()) === 12 && Object.values(g).every((rs) => JSON.stringify(rs.map((r) => [r.size, r.price, r.wh, r.stock])) === JSON.stringify([['S', '1500', '1000', '200'], ['M', '1500', '1000', '150'], ['L', '1600', '1100', '100']])), JSON.stringify(g));
  const before = db.skus.length; const sbtn = dlg.getByRole('button', { name: /(Create|Save) colour variant/i });
  for (let i = 0; i < (await sbtn.count()); i++) { await sbtn.nth(i).click(); await page.waitForTimeout(250); }
  const wsk = db.skus.slice(before);
  ok('wholesale-only: saved SKUs carry wholesalePrice', wsk.length === 12 && wsk.filter((s) => s.sku.startsWith('WT-')).every((s) => s.wholesalePrice === (s.price === 1600 ? 1100 : 1000)), JSON.stringify(wsk.slice(0, 2)));

  // ===== 3. Adult mode =====
  await toSkus('retail', 'Adult Tee', 'AT');
  await page.getByTestId('size-mode-adult').click(); await page.waitForTimeout(200);
  ok('adult: 7 sizes x 4 colours generated', (await rows.count()) === 28);
  const ADULT = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
  for (let r = 0; r < 7; r++) { await num(r, 0).fill(String(1000 + r * 100)); await num(r, 5).fill(String(10 + r)); }
  await page.getByTestId('apply-all-colors').click();
  ok('adult: blank generated rows are filled, not reported as conflicts', (await page.getByTestId('apply-conflicts').count()) === 0 && /21\s*empty existing rows will be filled/.test(await page.getByTestId('apply-counts').innerText()), await page.getByTestId('apply-counts').innerText());
  await page.getByTestId('apply-confirm').click(); await page.waitForTimeout(300);
  g = await colourRows();
  const blkA = (await dump()).slice(0, 7);
  ok('adult: all colours match Black (7 adult sizes); still 28 rows (no duplicates)', (await rows.count()) === 28 && blkA.map((r) => r.size).sort().join() === [...ADULT].sort().join() && Object.values(g).every((rs) => byS(rs) === byS(blkA)));

  // ===== 4. Kids mode keeps the client chart =====
  await toSkus('retail', 'Kids Tee', 'KT');
  await page.getByTestId('size-mode-kids').click(); await page.waitForTimeout(200);
  const KIDS = ['X-Small', 'Small', 'Medium', 'Large', 'X-Large', '2-XL'];
  ok('kids: 6 chart sizes x 4 colours', (await rows.count()) === 24);
  for (let r = 0; r < 6; r++) { await num(r, 0).fill(String(400 + r * 50)); await num(r, 5).fill(String(20 + r)); }
  await page.getByTestId('apply-all-colors').click(); await page.getByTestId('apply-confirm').click(); await page.waitForTimeout(300);
  g = await colourRows();
  const blkK = (await dump()).slice(0, 6);
  ok('kids: every colour has the 6 chart sizes with Black\'s prices and stock', blkK.map((r) => r.size).sort().join() === [...KIDS].sort().join() && Object.values(g).every((rs) => byS(rs) === byS(blkK)), JSON.stringify(blkK));
  // choose a different source colour
  await page.getByTestId('apply-all-colors').click();
  await page.getByTestId('apply-source').selectOption({ label: 'Blue' });
  ok('any colour can be the source', (await page.getByTestId('apply-targets').innerText()).includes('Black, Red, White'));
  await page.getByRole('button', { name: 'Cancel' }).click();
  ok('no page errors', errs.length === 0, errs.join('|'));
  console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
  await b.close(); process.exit(out.every(Boolean) ? 0 : 1);
})();
