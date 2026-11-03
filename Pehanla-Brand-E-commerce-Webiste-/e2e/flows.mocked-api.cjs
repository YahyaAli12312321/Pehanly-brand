/* Browser flows against a mocked API (the real backend needs MongoDB, unavailable here).
 * The mock PREVIEW mirrors backend wholesale pricing rules (tiers, MOQ, pending freight/tax). */
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3998';
const img = 'https://img.test/p.jpg';
const id = (n) => String(n).padStart(24, '0');
const user = { id: 'u1', name: 'Ayesha Khan', email: 'a@x.pk', phone: '03001234567', role: 'customer' };

// ---- wholesale fixtures (the app must render exactly what these say; nothing is hardcoded in the UI) ----
const polo = { id: id(1), name: 'Pique Polo', slug: 'pique-polo', shortDescription: '220 GSM pique', image: img, moq: 10, basePrice: 1000, retailPrice: 1500, tiers: [{ minQuantity: 20, discountPercent: 5, unitPrice: 950, quoteOnly: false }, { minQuantity: 100, discountPercent: null, unitPrice: null, quoteOnly: true }],
  variants: [
    { id: id(2), colorName: 'Navy', hexCode: '#001f3f', sizes: [{ id: id(10), sku: 'POLO-NVY-M', size: 'M', wholesalePrice: 1000, inStock: true }, { id: id(11), sku: 'POLO-NVY-L', size: 'L', wholesalePrice: 1000, inStock: true }] },
    { id: id(3), colorName: 'White', hexCode: '#ffffff', sizes: [{ id: id(12), sku: 'POLO-WHT-M', size: 'M', wholesalePrice: 1000, inStock: true }, { id: id(13), sku: 'POLO-WHT-L', size: 'L', wholesalePrice: 1000, inStock: true }] },
  ] };
const tee = { id: id(4), name: 'Basic Tee', slug: 'basic-tee', image: img, moq: 5, basePrice: 600, retailPrice: 900, tiers: [], variants: [{ id: id(5), colorName: 'Black', hexCode: '#111', sizes: [{ id: id(20), sku: 'TEE-BLK-M', size: 'M', wholesalePrice: 600, inStock: true }] }] };
const catalog = [polo, tee];
const skuInfo = new Map(); catalog.forEach((p) => p.variants.forEach((v) => v.sizes.forEach((s) => skuInfo.set(s.id, { p, v, s }))));
const pack = { _id: id(30), name: 'Starter Tee Pack', slug: 'starter-tee-pack', description: 'Six tees, ready to restock.', image: { url: img }, badge: 'Best value', dispatchText: 'Ships within 24h', isFeatured: true, packPrice: 3000, compareAtValue: 5400,
  items: [{ sku: id(20), quantity: 6, productName: 'Basic Tee', colorName: 'Black', size: 'M' }],
  computed: { available: true, totalPieces: 6, calculatedPrice: 3600, packPrice: 3000, perPiece: 500, assortment: [{ colorName: 'Black', quantity: 6 }], sizeCurve: [{ size: 'M', quantity: 6 }] } };
const banners = { wholesale_promo: [{ id: 'b1', title: 'Lahore production hub', subtitle: 'Bulk dispatches daily', image: { url: img, alt: 'Wholesale floor' } }], manufacturing_promo: [{ id: 'b2', title: 'Atelier floor', image: { url: img, alt: 'Atelier' } }] };
// ---- manufacturing / printing fixtures ----
const mcat = { _id: id(40), name: 'Polos', slug: 'polos', description: 'Knitted polos for teams and brands.' };
const mstyles = [{ _id: id(41), name: 'Classic Polo', description: 'Three-button placket.' }, { _id: id(42), name: 'Tipped Polo', description: 'Contrast collar tipping.' }];
const mvariants = { [id(41)]: [{ _id: id(50), colorName: 'Navy', media: [{ url: img, viewType: 'model' }, { url: img, viewType: 'mockup' }] }, { _id: id(51), colorName: 'White', media: [{ url: img, viewType: 'model' }] }], [id(42)]: [{ _id: id(52), colorName: 'Black', media: [{ url: img, viewType: 'mockup' }] }] };
const pservices = [{ _id: id(60), name: 'Screen Printing', description: 'Durable screen prints.' }, { _id: id(61), name: 'Embroidery' }];
let registered = true; const posts = []; const settings = { wholesale: null };

function preview(items, { packId, ordered } = {}) {
  if (packId) items = pack.items.map((i) => ({ sku: i.sku, quantity: i.quantity }));
  const qtyByProduct = new Map();
  items.forEach((i) => { const { p } = skuInfo.get(i.sku); qtyByProduct.set(p.id, (qtyByProduct.get(p.id) || 0) + i.quantity); });
  let out = items.map((i) => { const { p, v, s } = skuInfo.get(i.sku); const q = qtyByProduct.get(p.id); const reached = [...p.tiers].filter((t) => q >= t.minQuantity).pop(); const tier = reached && !reached.quoteOnly ? reached : [...p.tiers].filter((t) => q >= t.minQuantity && !t.quoteOnly).pop();
    const unit = tier ? Math.round(s.wholesalePrice * (1 - tier.discountPercent / 100) * 100) / 100 : s.wholesalePrice;
    return { product: p.id, sku: i.sku, productName: p.name, colorName: v.colorName, size: s.size, wholesalePrice: unit, quantity: i.quantity, lineTotal: unit * i.quantity, ...(tier ? { baseWholesalePrice: s.wholesalePrice, tierDiscountPercent: tier.discountPercent } : {}) }; });
  if (packId) { const f = pack.packPrice / out.reduce((n, i) => n + i.lineTotal, 0); out = out.map((i) => ({ ...i, wholesalePrice: i.wholesalePrice * f, lineTotal: i.lineTotal * f })); }
  const products = [...qtyByProduct].map(([pid, q]) => { const p = catalog.find((c) => c.id === pid); return { product: pid, productName: p.name, quantity: q, moq: p.moq, moqMet: !p.moq || q >= p.moq, moqShortfall: p.moq && q < p.moq ? p.moq - q : 0, quoteRequired: p.tiers.some((t) => t.quoteOnly && q >= t.minQuantity) }; });
  const mismatches = (ordered || []).filter((o) => (qtyByProduct.get(o.product) || 0) !== o.ordered).map((o) => ({ product: o.product, ordered: o.ordered, allocated: qtyByProduct.get(o.product) || 0, remaining: o.ordered - (qtyByProduct.get(o.product) || 0) }));
  const subtotal = out.reduce((n, i) => n + i.lineTotal, 0);
  return { items: out, products, units: out.reduce((n, i) => n + i.quantity, 0), moqMet: products.every((x) => x.moqMet), quoteRequired: products.some((x) => x.quoteRequired), allocation: { checked: Boolean(ordered?.length), mismatches, matched: !mismatches.length }, pricing: { subtotal, estimatedTotal: subtotal, pending: ['freight', 'tax'], taxPercent: null } };
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const ctx = await b.newContext({ timezoneId: 'Asia/Karachi', locale: 'en-PK', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  let errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  await page.route(/https:\/\/(img\.test|fonts\.|lh3\.)/, (r) => r.fulfill({ status: 200, contentType: r.request().url().includes('fonts') ? 'text/css' : 'image/gif', body: r.request().url().includes('fonts') ? '' : Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') }));
  await page.route('**/api/v1/**', async (r) => {
    const req = r.request(); const u = new URL(req.url()); const p = u.pathname.replace('/api/v1', '').replace(/^\/catalog/, ''); const m = req.method();
    const j = (d, extra = {}, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status < 400, message: 'ok', data: d, ...extra }) });
    const err = (status, message, code) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false, message, code }) });
    const meta = { page: 1, limit: 12, total: 1, totalPages: 1 };
    if (p === '/auth/me') return registered ? j({ user }) : err(401, 'Unauthorized', 'UNAUTHORIZED');
    if (p === '/settings/public') return j({ checkout: { codEnabled: true }, currencies: { base: 'PKR', supported: ['PKR', 'USD'], paymentMethods: { PKR: ['cod', 'jazzcash_manual'], USD: [] } } });
    if (p.startsWith('/shipping/free-shipping')) return j({ available: false });
    if (p === '/wholesale/packs') return j([pack], { meta });
    if (p === '/wholesale/catalog') return j(catalog);
    if (p === '/wholesale/preview' && m === 'POST') {
      const body = JSON.parse(req.postData());
      posts.push({ p: 'preview', body });
      if ((body.items || []).some((i) => !skuInfo.has(i.sku))) return err(400, 'One or more wholesale SKUs are invalid', 'INVALID_WHOLESALE_SKU');
      return j(preview(body.items, body));
    }
    if ((p === '/wholesale/requests/custom' || /^\/wholesale\/packs\/.+\/request$/.test(p)) && m === 'POST') {
      const body = JSON.parse(req.postData()); posts.push({ p, body });
      if (p.endsWith('custom')) { const pv = preview(body.items); if (!pv.moqMet) return err(400, 'Minimum wholesale quantity not met', 'WHOLESALE_MOQ_NOT_MET'); }
      return j({ requestNumber: `WH-00000${posts.length}` }, {}, 201);
    }
    if (p.startsWith('/wholesale/my')) return j([], { meta });
    if (p === '/manufacturing/categories') return j([mcat]);
    if (p === '/manufacturing/categories/polos') return j(mcat);
    if (p === `/manufacturing/categories/${mcat._id}/styles`) return j(mstyles);
    if (p.startsWith('/manufacturing/styles/') && p.endsWith('/variants')) return j(mvariants[p.split('/')[3]] || []);
    if (p === '/manufacturing/requests' && m === 'POST') { posts.push({ p, body: JSON.parse(req.postData()) }); return j({ requestNumber: 'MF-000001' }, {}, 201); }
    if (p === '/printing/services') return j(pservices);
    if (p === '/media' && m === 'POST') return j({ url: 'https://img.test/art.png', publicId: 'art1', originalName: 'logo.png', bytes: 68 }, {}, 201);
    if (p === '/printing/requests' && m === 'POST') { posts.push({ p, body: JSON.parse(req.postData()) }); return j({ requestNumber: 'PR-000001' }, {}, 201); }
    if (p === '/banners') return j(banners[u.searchParams.get('placement')] || []);
    if (p === '/categories') return j([]);
    return j([], { meta });
  });

  // The Material Symbols icon font is blocked in this sandbox, so ligature names would render as long text.
  // Emulate the loaded font: each icon occupies one em-square, like the real glyph.
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.material-symbols-outlined{display:inline-block;width:1em;overflow:hidden;white-space:nowrap;vertical-align:middle;font-style:normal}'; document.head.appendChild(st); }); });
  const fails = [];
  const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) fails.push(name); };
  const txt = async (sel) => (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  const overflowX = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // ================= Flows C + D: wholesale =================
  await page.goto(BASE + '/wholesale', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Lowest MOQ');
  check('wholesale: hero metrics come from backend data', /ready packs/i.test(await txt('[data-testid=wholesale-hero-visual] dl')) && /lowest moq/i.test(await txt('[data-testid=wholesale-hero-visual] dl')));
  check('N: admin Wholesale banner image + caption render in the hero', await page.locator('[data-testid=wholesale-hero-visual] img').count() === 1 && /Lahore production hub/.test(await txt('[data-testid=wholesale-hero-visual] figcaption')));
  if (process.env.DBG) { console.log('HEROFIG', JSON.stringify(await txt('[data-testid=wholesale-hero-visual]')), await page.locator('[data-testid=wholesale-hero-visual] img').count(), await page.locator('[data-testid=wholesale-hero-visual]').innerHTML().then((h) => h.slice(0, 400))); console.log('CARD', await txt('[data-testid=pack-card]')); }
  check('wholesale: four feature cards', await page.locator('section[aria-label="Wholesale advantages"] li').count() === 4);
  check('wholesale: "Choose How You Want to Order" shows two separate paths', await page.getByRole('heading', { name: 'Choose How You Want to Order' }).isVisible() && await page.getByTestId('path-packs').isVisible() && await page.getByTestId('path-builder').isVisible());
  const card = '[data-testid=pack-card]';
  check('F/G: pack card shows backend badge, pieces, assortment, size curve', /best value/i.test(await txt(card)) && /6 pieces/i.test(await txt(card)) && /Black\s*6/.test(await txt(card)) && /M\(6\)/.test(await txt(card)));
  check('wholesale: pack price + per-piece come from the backend (3,000 / 500)', /3,000/.test(await txt('[data-testid=pack-price]')) && /500 \/ piece/.test(await txt('[data-testid=pack-price]')) && /5,400/.test(await txt('[data-testid=pack-price]')));
  check('wholesale: dispatch text from admin shown', /Ships within 24h/.test(await txt(card)));
  check('wholesale: both Ready Packs and Build Your Own are present', await page.getByRole('heading', { name: 'Ready Wholesale Packs', level: 2 }).isVisible() && await page.getByRole('heading', { name: 'Build Your Own Order', level: 2 }).isVisible());
  const poloRow = page.getByTestId('wholesale-product').filter({ hasText: 'Pique Polo' });
  const polotxt = async () => (await poloRow.innerText()).replace(/\s+/g, ' ');
  check('wholesale: MOQ, base price, retail comparison and tier matrix come from the catalog', /MOQ 10/.test(await polotxt()) && /1,000/.test(await polotxt()) && /1,500/.test(await polotxt()) && /10–19 pcs/.test(await polotxt()) && /20–99 pcs/.test(await polotxt()) && /100\+ pcs/.test(await polotxt()) && /Request quote/.test(await polotxt()));
  const active = () => poloRow.locator('tr[data-active=true] td').first().innerText().then((t) => t.replace(/\s+/g, ' '));
  check('H: qty 10 selects the first tier', /10–19/.test(await active()));
  await poloRow.getByLabel('Quantity', { exact: true }).fill('22');
  check('H: qty 22 auto-selects the 20–99 tier and prices 22 x 950', /20–99/.test(await active()) && /20,900/.test(await txt('[data-testid=builder-estimate]')));
  await poloRow.getByRole('button', { name: 'Increase quantity' }).click();
  check('H: + button increments (23)', await poloRow.getByLabel('Quantity', { exact: true }).inputValue() === '23');
  await poloRow.getByLabel('Quantity', { exact: true }).fill('120');
  check('H: qty 120 selects the quote tier and says quote required (never an invented price)', /100\+/.test(await active()) && /Quote required/.test(await txt('[data-testid=builder-estimate]')));
  await poloRow.getByLabel('Quantity', { exact: true }).fill('8');
  check('wholesale: below-MOQ is blocked with the backend MOQ', /Minimum order is 10/.test(await polotxt()) && await poloRow.getByRole('button', { name: 'Add to wholesale cart' }).isDisabled());
  check('wholesale: empty cart state', await page.getByTestId('wcart-empty').isVisible());

  // C: Ready pack -> cart -> summary
  await page.getByRole('button', { name: 'Add pack to wholesale cart' }).first().click();
  await page.waitForSelector('[data-testid=wsum-subtotal]:not(:has-text("—"))');
  check('C: pack in cart, summary subtotal = admin pack price from backend', (await txt('[data-testid=wsum-subtotal]')).includes('3,000'));
  check('C: pack previewed by packId (server decides price), not by browser numbers', posts.some((x) => x.p === 'preview' && x.body.packId === pack._id && !x.body.items));
  check('C: freight/tax not configured -> "Quoted by our team", never invented', (await txt('[data-testid=wsummary]')).split('Quoted by our team').length === 3);
  check('C: summary titled Consolidated Invoice Estimate', await page.getByRole('heading', { name: 'Consolidated Invoice Estimate' }).isVisible());
  check('C: MOQ status shown', /All minimums met/.test(await txt('[data-testid=wsum-moq]')));

  // D: Build your own with allocation
  await poloRow.getByLabel('Quantity', { exact: true }).fill('22');
  await poloRow.getByRole('button', { name: 'Add to wholesale cart' }).click();
  await page.waitForSelector('[data-testid^=alloc-status-]');
  check('D: manual line shows allocation panel', await page.getByText('Size & colour distribution').isVisible());
  check('D: checkout + quote actions blocked while allocation is empty', await page.getByTestId('wholesale-checkout').isDisabled() && await page.getByTestId('wholesale-quote').isDisabled());
  const status = () => txt(`[data-testid=alloc-status-${id(1)}]`);
  const aid = (sku) => `#a-m-${id(1)}-${sku}`;
  await page.locator(aid(id(10))).fill('10'); await page.locator(aid(id(11))).fill('5');
  check('I: partial allocation reports what is left', /15 of 22.*7 left/.test(await status()));
  check('I: confirm disabled while allocation != ordered', await page.getByRole('button', { name: 'Confirm & save allocation' }).isDisabled());
  await page.locator(aid(id(12))).fill('9');
  check('I: over-allocation is flagged', /2 too many/.test(await status()));
  await page.locator(aid(id(12))).fill('7');
  check('I: exact allocation is valid', /22 of 22 allocated/.test(await status()));
  check('D: still blocked until confirmed', await page.getByTestId('wholesale-checkout').isDisabled() && /confirm the size/i.test(await txt('[data-testid=wsum-problems]')));
  await page.getByRole('button', { name: 'Confirm & save allocation' }).click();
  await page.waitForTimeout(500);
  check('D: backend tier (22 >= 20 -> 5%) priced the line: 22 x 950', (await txt(`[data-testid="wline-total-m-${id(1)}"]`)).includes('20,900'));
  check('D: line shows allocation summary', /Allocated: 17 Navy, 5 White|Allocated: 15 Navy, 7 White/.test(await txt(`[data-testid="wline-alloc-m-${id(1)}"]`)));
  check('D: summary units = pack 6 + manual 22', (await txt('[data-testid=wsum-units]')) === '28');
  check('J: subtotal = 3,000 + 20,900 (backend)', (await txt('[data-testid=wsum-subtotal]')).includes('23,900'));
  check('J: volume discount line from backend base vs tier price (22 x 50)', /1,100/.test(await txt('[data-testid=wsum-discount]')));
  check('I: preview carries the ordered quantity so the BACKEND checks the allocation', posts.some((x) => x.p === 'preview' && x.body.ordered?.[0]?.ordered === 22));
  check('D: editing a confirmed allocation un-confirms it', await (async () => { await page.locator(aid(id(10))).fill('11'); const r = await page.getByTestId('wholesale-checkout').isDisabled(); await page.locator(aid(id(10))).fill('10'); await page.getByRole('button', { name: 'Confirm & save allocation' }).click(); return r; })());
  await page.waitForTimeout(300);
  check('D: Reset allocation clears all fields and un-confirms', await (async () => { await page.getByRole('button', { name: 'Reset allocation' }).click(); const z = (await page.locator(aid(id(10))).inputValue()) === '' && /0 of 22/.test(await status()); await page.locator(aid(id(10))).fill('10'); await page.locator(aid(id(11))).fill('5'); await page.locator(aid(id(12))).fill('7'); await page.getByRole('button', { name: 'Confirm & save allocation' }).click(); return z; })());
  await page.waitForTimeout(400);
  check('D: both summary actions are available when valid', await page.getByTestId('wholesale-checkout').isEnabled() && await page.getByTestId('wholesale-quote').isEnabled());

  // checkout = order request (real contract)
  await page.getByTestId('wholesale-checkout').click();
  await page.locator('#wc-name').fill('Ayesha Khan'); await page.locator('#wc-email').fill('a@x.pk'); await page.locator('#wc-phone').fill('03001234567');
  await page.getByTestId('wholesale-submit').click();
  check('D: submit without business name is rejected client-side', await page.getByText('Enter your business or brand name.').isVisible());
  await page.locator('#wc-biz').fill('Khan Traders');
  await page.getByTestId('wholesale-submit').click();
  await page.waitForSelector('text=Wholesale quote request sent').catch(async (e) => { await page.screenshot({ path: 'shots/dbg-submit.png', fullPage: true }); console.log('SUBMITDBG', await txt('[data-testid=wsummary]'), JSON.stringify(posts.slice(-3))); throw e; });
  const custom = posts.find((x) => x.p.endsWith('custom'));
  const pk = posts.find((x) => /packs\/.+\/request/.test(x.p));
  check('D: custom request sent with sku/quantity items only (no prices from the browser)', custom && custom.body.items.length === 3 && custom.body.items.every((i) => Object.keys(i).sort().join() === 'quantity,sku') && !JSON.stringify(custom.body).includes('Price'));
  check('I: create request carries the ordered quantity for backend allocation validation', custom && custom.body.ordered?.[0]?.ordered === 22);
  check('D: allocation quantities reach the backend', custom && custom.body.items.reduce((n, i) => n + i.quantity, 0) === 22);
  check('C: pack request posted to the pack endpoint', Boolean(pk) && pk.p.includes(pack._id));
  check('wholesale: cart emptied after both requests succeed', await page.evaluate(() => JSON.parse(localStorage.getItem('pehanly-wholesale-cart-v1') || '{"state":{"lines":[1]}}').state.lines.length === 0));
  check('wholesale: no auth/price data persisted in the cart storage', await page.evaluate(() => !/token|jwt|bearer|price/i.test(localStorage.getItem('pehanly-wholesale-cart-v1') || '')));

  // quote-only volume: checkout blocked, enterprise quote offered
  await page.goto(BASE + '/wholesale', { waitUntil: 'networkidle' });
  await poloRow.getByLabel('Quantity', { exact: true }).fill('120');
  await poloRow.getByRole('button', { name: 'Allocate sizes & colors' }).click();
  await page.waitForSelector('[data-testid^=alloc-status-]');
  for (const [sku, q] of [[id(10), 30], [id(11), 30], [id(12), 30], [id(13), 30]]) await page.locator(aid(sku)).fill(String(q));
  await page.getByRole('button', { name: 'Confirm & save allocation' }).click();
  await page.waitForTimeout(500);
  check('quote tier: summary says a custom quote is required and checkout is disabled', /custom quote/i.test(await txt('[data-testid=wsum-quote-note]')) && await page.getByTestId('wholesale-checkout').isDisabled());
  check('quote tier: Request custom / enterprise quote stays available', await page.getByTestId('wholesale-quote').isEnabled());
  await page.evaluate(() => localStorage.removeItem('pehanly-wholesale-cart-v1'));

  // unauthenticated visitor never sees wholesale prices
  registered = false;
  await page.goto(BASE + '/wholesale', { waitUntil: 'networkidle' });
  check('guest: pack price hidden, sign-in prompt shown', /Sign in to see wholesale pricing/.test(await txt('[data-testid=pack-card]')) && await page.getByText(/to see wholesale pricing and build your own order/).isVisible());
  registered = true;

  // responsive: wholesale at 6 widths
  for (const w of [1920, 1440, 1366, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + '/wholesale', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Add pack to wholesale cart' }).first().click();
    await poloRow.getByLabel('Quantity', { exact: true }).fill('12'); await poloRow.getByRole('button', { name: 'Add to wholesale cart' }).click();
    await page.waitForTimeout(500);
    check(`responsive ${w}: wholesale page has no horizontal overflow`, (await overflowX()) <= 1, `(${await overflowX()}px)`);
    const wide = await page.evaluate(() => [...document.querySelectorAll('main h1,main h2,main img,main table,h1,h2,img,table')].filter((e) => !e.closest('[aria-hidden=true],#mobile-menu,[id*=mobile]') && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.tagName + ':' + (e.getAttribute('src') || e.className || '').toString().slice(0, 60)).slice(0, 3));
    check(`responsive ${w}: no clipped headings/images/tables`, wide.length === 0, wide.join());
    const heroH = await page.evaluate(() => document.querySelector('[data-testid=wholesale-hero-visual]').getBoundingClientRect().height);
    check(`responsive ${w}: hero image is not giant (<= 480px)`, heroH <= 480, `(${Math.round(heroH)}px)`);
    await page.screenshot({ path: `shots/wholesale-${w}.png`, fullPage: true });
    await page.evaluate(() => localStorage.removeItem('pehanly-wholesale-cart-v1'));
  }

  // P: account moved out of the main icon row
  for (const w of [1440, 1024, 390]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const inMain = await page.evaluate(() => [...document.querySelectorAll('header a[aria-label=Account]')].length);
    const inBar = await page.getByTestId('header-account').isVisible().catch(() => false);
    check(`P ${w}: no account icon in the main header row`, inMain === 0);
    if (w >= 640) check(`P ${w}: Account sits in the top utility bar`, inBar);
    else { await page.locator('#mobile-menu-btn').click(); check('P 390: Account is first item in the mobile menu', await page.getByTestId('drawer-account').isVisible()); }
  }
  // O/M: manufacturing hero - no green background, admin banner on the right (desktop), stacked on mobile
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/custom-manufacturing', { waitUntil: 'networkidle' });
  const mh = await page.evaluate(() => { const sec = document.querySelector('[data-testid=mf-hero]'); const fig = document.querySelector('[data-testid=mf-hero-visual]'); const h1 = sec.querySelector('h1'); const bg = getComputedStyle(sec).backgroundColor; return { bg, figLeft: fig.getBoundingClientRect().left, h1Right: h1.getBoundingClientRect().right, hasImg: Boolean(fig.querySelector('img')) }; });
  check('O: manufacturing hero background is not green', !/rgb\(23, 59, 50\)/.test(mh.bg), mh.bg);
  check('M: manufacturing banner image is the right-hand visual on desktop', mh.hasImg && mh.figLeft > mh.h1Right);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(BASE + '/custom-manufacturing', { waitUntil: 'networkidle' });
  check('M: hero stacks on mobile (image below the copy)', await page.evaluate(() => document.querySelector('[data-testid=mf-hero-visual]').getBoundingClientRect().top > document.querySelector('[data-testid=mf-hero] h1').getBoundingClientRect().bottom));
  await page.setViewportSize({ width: 1440, height: 900 });
  // K/L: homepage keeps the two-card section and Stock Your Business
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  check('K: home keeps Wholesale Solutions + Custom Manufacturing cards', await page.getByRole('heading', { name: 'Wholesale Solutions' }).isVisible() && await page.getByRole('heading', { name: /Custom Manufacturing/ }).first().isVisible());
  if (process.env.DBG) console.log('LDBG', await page.getByRole('heading', { name: 'Stock Your Business With PEHANLY' }).count(), await page.getByRole('link', { name: 'Explore wholesale catalog' }).count(), await page.getByRole('link', { name: 'Request a custom quote' }).count(), await page.getByTestId('stock-card').count(), await page.getByRole('heading', { name: 'Stock Your Business With PEHANLY' }).isVisible());
  check('L: Stock Your Business section intact (heading, both CTAs, admin pack card)', await page.getByRole('heading', { name: 'Stock Your Business With PEHANLY' }).isVisible() && await page.getByRole('link', { name: 'Explore wholesale catalog' }).isVisible() && await page.getByRole('link', { name: 'Request a custom quote' }).isVisible() && await page.getByTestId('stock-card').count() === 1);
  check('L: Stock Your Business pack data is the admin pack (name, 500/piece for signed-in)', /Starter Tee Pack/.test(await txt('[data-testid=stock-card]')) && /500/.test(await txt('[data-testid=stock-rate]')));

  // ================= Flow A: manufacturing =================
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/custom-manufacturing', { waitUntil: 'networkidle' });
  check('A: hero headline', /From Concept\s+to\s+Creation\./.test(await txt('h1')));
  check('A: capability catalogue lists real categories', await page.getByRole('heading', { name: 'Polos' }).first().isVisible());
  check('A: polo spotlight comes from a real style', /Classic Polo|Tipped Polo/.test(await txt('[data-testid=mf-polo-spotlight]')));
  check('A: silhouette cards show real colour counts', /1 colour available/.test(await txt('[data-testid=mf-style-card]')));
  await page.getByRole('link', { name: /View styles/ }).first().click();
  await page.waitForURL('**/custom-manufacturing/polos');
  await page.waitForSelector('nav[aria-label=Breadcrumb]');
  check('A: breadcrumb present', await page.getByRole('navigation', { name: 'Breadcrumb' }).isVisible());
  await page.waitForSelector('[data-testid=mf-spec-card]');
  await page.waitForFunction(() => /Colours\s*2/.test(document.querySelector('[data-testid=mf-spec-card]')?.innerText.replace(/\n/g, ' ') || ''));
  check('A: spec sheet uses real counts only (2 styles, 2 colours)', /Styles\s*2/.test((await txt('[data-testid=mf-spec-card]'))) && /Colours\s*2/.test(await txt('[data-testid=mf-spec-card]')));
  check('A: no invented image counts on the page', !/\b17 images\b/i.test(await page.locator('body').innerText()));
  check('A: spec matrix table present', await page.getByRole('table').first().isVisible());
  check('A: related silhouettes section', await page.getByRole('heading', { name: 'Related Silhouettes' }).isVisible());
  await page.getByRole('button', { name: 'View gallery' }).nth(1).click();
  const gal = page.getByTestId('mf-gallery');
  check('A: gallery modal opens for the chosen style', await gal.isVisible() && /Classic Polo|Tipped Polo/.test(await gal.innerText()));
  check('A: Model/Mockup tabs reflect real media', (await gal.getByRole('button', { name: 'Model', exact: true }).count()) === 1 && (await gal.getByRole('button', { name: 'Mockup', exact: true }).count()) === 1);
  await gal.getByRole('button', { name: 'Mockup', exact: true }).click();
  check('A: mockup filter narrows the thumbnails', (await gal.getByRole('button', { name: /Image \d of \d/ }).count()) <= 2);
  await gal.getByRole('button', { name: 'White' }).click();
  check('A: colour filter updates the selected configuration', /White/.test(await txt('[data-testid=mf-selected-config]')));
  await page.keyboard.press('Escape');
  check('A: Escape closes the gallery', !(await gal.isVisible().catch(() => false)));
  await page.getByRole('button', { name: 'View gallery' }).nth(1).click();
  await gal.getByRole('button', { name: 'Navy' }).click();
  await gal.getByRole('button', { name: /Customize & request quote/ }).click();
  check('A: gallery hands the chosen colour to the inquiry form', (await page.locator('#mf-variant').inputValue()) === id(50));
  await page.locator('#mf-qty').fill('150'); await page.locator('#mf-req').fill('Embroidered logo on left chest, 220 GSM pique.');
  await page.locator('#mf-biz').fill('Khan Traders');
  await page.getByRole('button', { name: 'Send inquiry' }).click();
  await page.waitForSelector('text=Inquiry sent');
  const mf = posts.find((x) => x.p === '/manufacturing/requests');
  check('A: backend receives the inquiry with the real contract', mf && mf.body.category === id(40) && mf.body.style === id(41) && mf.body.variant === id(50) && mf.body.quantity === 150 && /Embroidered/.test(mf.body.requirements) && mf.body.customer.businessName === 'Khan Traders', JSON.stringify(mf?.body));
  // main-page inquiry form
  await page.goto(BASE + '/custom-manufacturing', { waitUntil: 'networkidle' });
  await page.locator('#mf-cat').selectOption(id(40)); await page.waitForTimeout(300);
  check('A: main inquiry form loads real styles for the chosen category', (await page.locator('#mf-style option').count()) === 3);
  await page.getByRole('button', { name: 'Send inquiry' }).click();
  check('A: inquiry validates required fields', await page.getByText('Enter the quantity you need (whole number).').isVisible());

  // ================= Flow B: printing =================
  await page.goto(BASE + '/printing-branding', { waitUntil: 'networkidle' });
  for (const t of ['Precision Printing', 'Industrial Embroidery', 'Strategic Logo Placement', 'Woven & Care Labels', 'Debossed Hang Tags', 'Turnkey Retail Packaging']) {
    if (!(await page.getByRole('heading', { name: t }).first().isVisible())) check(`B: section ${t}`, false);
  }
  check('B: all six capability sections are present', true);
  await page.getByRole('button', { name: 'Left Chest placement' }).click();
  check('B: clicking the garment selects a placement', (await page.getByRole('button', { name: 'Left Chest placement' }).getAttribute('aria-pressed')) === 'true' && await page.getByTestId('placement-details').isVisible());
  await page.getByRole('button', { name: 'Left Sleeve placement' }).click();
  await page.getByRole('button', { name: 'back', exact: true }).click();
  check('B: back view shows back zones only', (await page.getByRole('button', { name: 'Center Back placement' }).count()) === 1 && (await page.getByRole('button', { name: 'Left Chest placement' }).count()) === 0);
  await page.getByRole('button', { name: 'Center Back placement' }).click();
  await page.locator('#sz-Left\\ Chest').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Center Back placement' }).click(); // deselect
  await page.getByRole('button', { name: 'Center Back placement' }).click(); // reselect
  check('B: spec summary lists the chosen placements', /Left Chest, Left Sleeve, Center Back/.test(await txt('[data-testid=branding-spec]')));
  await page.locator('#pr-biz').fill('Khan Traders');
  await page.locator('#pr-service').selectOption(id(60)); await page.locator('#pr-qty').fill('200'); await page.locator('#pr-garment').fill('Polo shirt, 220 GSM');
  await page.locator('#pr-req').fill('Logo on chest and back.'); await page.locator('#pr-pack').selectOption('Standard polybag');
  await page.locator('#pr-files').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgo=', 'base64') });
  await page.getByRole('button', { name: /Send request|Request/ }).last().click();
  await page.waitForSelector('text=Request sent');
  const pr = posts.find((x) => x.p === '/printing/requests');
  check('B: payload has service, quantity and chosen placements with sizes', pr && pr.body.serviceId === id(60) && pr.body.quantity === 200 && pr.body.placements.map((x) => x.name).join() === 'Left Chest,Left Sleeve,Center Back' && /Medium/.test(pr.body.placements[0].description) && /back view/.test(pr.body.placements[2].description), JSON.stringify(pr?.body?.placements));
  check('B: artwork uploaded then referenced; packaging in requirements', pr && pr.body.artwork?.[0]?.publicId === 'art1' && /Packaging: Standard polybag/.test(pr.body.requirements));

  // ================= Flow H: header + wishlist at 5 widths =================
  for (const w of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    const hdr = await page.evaluate(() => {
      const h = document.querySelector('header'); const r = h.getBoundingClientRect();
      const vis = (el) => { if (!el) return false; const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
      const cart = document.querySelector('a[aria-label^="Cart"]'); const cb = cart.getBoundingClientRect();
      const kids = [...h.querySelectorAll('a,button')].filter(vis).map((e) => e.getBoundingClientRect());
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, cartRight: cb.right, vw: window.innerWidth, wish: vis(h.querySelector('a[aria-label^="Wishlist"]')), nav: vis(h.querySelector('nav[aria-label=Primary]')), burger: vis(document.getElementById('mobile-menu-btn')), clipped: kids.filter((b) => b.right > window.innerWidth + 0.5 || b.left < -0.5).length, height: r.height };
    });
    check(`H ${w}: no horizontal overflow / nothing off-screen`, hdr.overflow <= 1 && hdr.clipped === 0 && hdr.cartRight <= hdr.vw, JSON.stringify(hdr));
    check(`H ${w}: nav ${w >= 1280 ? 'visible' : 'collapsed into menu'}`, w >= 1280 ? hdr.nav && !hdr.burger : !hdr.nav && hdr.burger);
    check(`H ${w}: wishlist heart ${w >= 1280 ? 'in header' : 'moved to menu/account'}`, w >= 1280 ? hdr.wish : !hdr.wish);
    if (w < 1280) {
      { await page.locator('#mobile-menu-btn').click(); await page.waitForTimeout(350); check(`H ${w}: wishlist reachable in the mobile menu`, await page.getByRole('link', { name: /^Wishlist/ }).last().isVisible()); await page.locator('#mobile-menu-close').click(); }
    }
    await page.screenshot({ path: `shots/header-${w}.png`, clip: { x: 0, y: 0, width: w, height: 140 } });
  }

  // ================= Responsive sweep: manufacturing, detail, gallery modal, printing =================
  for (const w of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const [name, path] of [['mfg', '/custom-manufacturing'], ['mfg-detail', '/custom-manufacturing/polos'], ['printing', '/printing-branding']]) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(250);
      check(`responsive ${w}: ${name} has no horizontal overflow`, (await overflowX()) <= 1, `(${await overflowX()}px)`);
      await page.screenshot({ path: `shots/${name}-${w}.png`, fullPage: true });
    }
    await page.goto(BASE + '/custom-manufacturing/polos', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'View gallery' }).nth(1).click();
    const box = await page.getByTestId('mf-gallery').locator('> div').boundingBox();
    check(`responsive ${w}: gallery modal fits the viewport`, box.x >= -1 && box.x + box.width <= w + 1 && box.height <= 900 + 1, JSON.stringify(box));
    await page.screenshot({ path: `shots/gallery-${w}.png` });
    await page.keyboard.press('Escape');
  }

  check('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(' | ')}` : '\nALL FLOW CHECKS PASSED');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
