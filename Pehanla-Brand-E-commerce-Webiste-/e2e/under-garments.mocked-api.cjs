/* Under Garments storefront flow against a mocked API that applies the SAME catalog rules as the backend
 * (dedicated section hidden from the general catalog; reachable only with section=true). NOT a real backend/database.
 * Run: npm run build:app && npx vite preview --port 3998 --strictPort, then node e2e/under-garments.mocked-api.cjs */
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3998';
const results = []; const check = (n, ok, x = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); };

// ---- fake backend state (admin changes are simulated by editing this) ----
const cats = [
  { id: 'c-tops', name: 'Tops', slug: 'tops', parentId: null, active: true },
  { id: 'c-kids', name: 'Kids', slug: 'kids', parentId: null, active: true },
  { id: 'c-ug', name: 'Under Garments', slug: 'under-garments', parentId: null, active: true, section: true, description: 'Everyday essentials.' },
  { id: 'c-m', name: "Men's Underwear", slug: 'mens-underwear', parentId: 'c-ug', active: true },
  { id: 'c-w', name: "Women's Underwear", slug: 'womens-underwear', parentId: 'c-ug', active: true },
  { id: 'c-k', name: "Kids' Underwear", slug: 'kids-underwear', parentId: 'c-ug', active: true },
  { id: 'c-s', name: 'Socks', slug: 'socks', parentId: 'c-ug', active: false },
];
const P = (id, name, cat, price, sizes, colors, inStock = true, extra = {}) => ({ id: `p${id}`, name, slug: name.toLowerCase().replace(/\W+/g, '-'), category: { name: cats.find((c) => c.slug === cat).name, slug: cat }, image: null, priceMin: price, priceMax: price, priceMinUSD: null, priceMaxUSD: null, currencies: ['PKR'], inStock, sizes, colors, ...extra });
const products = [
  P(1, 'Boxy Tee', 'tops', 2500, ['M', 'L'], [{ name: 'Black', hexCode: '#111' }]),
  P(2, 'Cotton Boxer', 'mens-underwear', 700, ['32', '34'], [{ name: 'Black', hexCode: '#111' }, { name: 'Grey', hexCode: '#888' }]),
  P(3, 'Trunk Pack', 'mens-underwear', 1200, ['34'], [{ name: 'Navy', hexCode: '#123' }]),
  P(4, 'Lace Bralette', 'womens-underwear', 1500, ['S', 'M'], [{ name: 'Nude', hexCode: '#e8c4a0' }]),
  P(5, 'Kids Vest', 'kids-underwear', 400, ['Small'], [{ name: 'White', hexCode: '#fff' }], false),
  P(6, 'Ankle Socks', 'socks', 300, ['Free'], [{ name: 'White', hexCode: '#fff' }]),
];
const catById = (id) => cats.find((c) => c.id === id);
const inSection = (slug) => { const c = cats.find((x) => x.slug === slug); return c && (c.section || catById(c.parentId)?.section); };
const subtree = (slug) => { const c = cats.find((x) => x.slug === slug); return c ? [c.slug, ...cats.filter((x) => x.parentId === c.id).map((x) => x.slug)] : []; };
const live = (c) => c.active && (!c.parentId || catById(c.parentId).active);

const sentProducts = [];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push(m.text()); });
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.material-symbols-outlined{display:inline-block;width:1em;overflow:hidden;white-space:nowrap;vertical-align:middle;font-style:normal}'; document.head.appendChild(st); }); });
  await page.route(/https:\/\/(fonts\.|lh3\.)/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/api/v1/**', async (r) => {
    const u = new URL(r.request().url()); const p = u.pathname.replace('/api/v1', ''); const sp = u.searchParams;
    const j = (data, extra = {}) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'ok', data, ...extra }) });
    const view = (c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, image: null, parentId: c.parentId, audience: null, showOnHome: false });
    if (p === '/catalog/categories') {
      const section = sp.get('section');
      if (section) { const root = cats.find((c) => c.slug === section && c.section && live(c)); return j(root ? cats.filter((c) => (c.id === root.id || c.parentId === root.id) && c.active).map(view) : []); }
      let list = cats.filter((c) => live(c) && !inSection(c.slug));
      if (sp.get('parentOnly') === 'true') list = list.filter((c) => !c.parentId);
      return j(list.map(view));
    }
    const scope = (cat, section) => {
      const base = products.filter((x) => live(cats.find((c) => c.slug === x.category.slug)));
      if (section) { if (!cat || !inSection(cat)) return []; return base.filter((x) => subtree(cat).includes(x.category.slug)); }
      const general = base.filter((x) => !inSection(x.category.slug));
      return cat ? general.filter((x) => subtree(cat).includes(x.category.slug)) : general;
    };
    if (p === '/catalog/facets') {
      const items = scope(sp.get('category'), sp.get('section') === 'true');
      const prices = items.map((x) => x.priceMin);
      const root = cats.find((c) => c.slug === sp.get('category'));
      return j({ total: items.length, sizes: [...new Set(items.flatMap((x) => x.sizes))], colors: [...new Map(items.flatMap((x) => x.colors).map((c) => [c.name, c])).values()], priceMin: prices.length ? Math.min(...prices) : null, priceMax: prices.length ? Math.max(...prices) : null, inStockCount: items.filter((x) => x.inStock).length,
        subcategories: root ? cats.filter((c) => c.parentId === root.id && c.active).map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: items.filter((x) => subtree(c.slug).includes(x.category.slug)).length })) : [] });
    }
    if (p === '/catalog/products') {
      sentProducts.push(Object.fromEntries(sp));
      let items = scope(sp.get('category'), sp.get('section') === 'true');
      const s = (sp.get('search') || '').toLowerCase(); if (s) items = items.filter((x) => x.name.toLowerCase().includes(s));
      if (sp.get('size')) items = items.filter((x) => x.sizes.includes(sp.get('size')));
      if (sp.get('color')) items = items.filter((x) => x.colors.some((c) => c.name === sp.get('color')));
      if (sp.get('minPrice')) items = items.filter((x) => x.priceMax >= Number(sp.get('minPrice')));
      if (sp.get('maxPrice')) items = items.filter((x) => x.priceMin <= Number(sp.get('maxPrice')));
      if (sp.get('inStock') === 'true') items = items.filter((x) => x.inStock);
      if (sp.get('sort') === 'price_asc') items = [...items].sort((a, b) => a.priceMin - b.priceMin);
      if (sp.get('sort') === 'price_desc') items = [...items].sort((a, b) => b.priceMin - a.priceMin);
      return j(items, { meta: { page: 1, limit: 24, total: items.length, totalPages: 1, pages: 1 } });
    }
    if (p === '/settings/public') return j({});
    return j([], { meta: { page: 1, limit: 12, total: 0, totalPages: 1 } });
  });
  const cardNames = async () => (await page.locator('article h2').allInnerTexts()).map((t) => t.trim());
  const settle = () => page.waitForTimeout(450);

  // ---------- 1. Shop page exclusion ----------
  await page.goto(`${BASE}/shop`); await page.locator('article').first().waitFor(); await settle();
  let n = await cardNames();
  check('Shop grid shows only normal products', JSON.stringify(n) === JSON.stringify(['Boxy Tee']), JSON.stringify(n));
  const shopText = await page.locator('main, #root').first().innerText();
  const aside = await page.locator('aside').first().innerText();
  const explore = await page.getByRole('region', { name: 'Explore categories' }).innerText().catch(() => '');
  check('Shop category filter does not list Under Garments or its sub-categories', !/under garments|underwear|socks/i.test(aside), aside.replace(/\s+/g, ' ').slice(0, 160));
  check('Shop "Explore categories" strip does not list them', !/under garments|underwear|socks/i.test(explore));
  check('Shop page has no Under Garments card, banner or text outside the header menu', !/under garments/i.test(await page.locator('main').innerText().catch(() => shopText)));
  check('Shop grid request never asked for the section', sentProducts.every((q) => q.section !== 'true'), JSON.stringify(sentProducts[0]));
  await page.goto(`${BASE}/shop?q=boxer`); await settle();
  check('General search for "boxer" does not find Under Garments products', (await cardNames()).length === 0);
  await page.goto(`${BASE}/shop/under-garments`); await settle();
  const t404 = await page.locator('body').innerText(); check('/shop/under-garments shows no products (category unknown to the Shop)', (await cardNames()).length === 0, JSON.stringify(t404.slice(0,300)));

  // ---------- 2. Header menu (desktop) ----------
  await page.goto(`${BASE}/`); await settle();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Shop', exact: true }).hover();
  await page.getByTestId('shop-menu').waitFor();
  const menu = (await page.getByTestId('shop-menu').innerText()).replace(/\s+/g, ' ');
  check('Shop dropdown opens on hover with Men, Women, categories, Under Garments, New Arrivals', ['Men', 'Women', 'Tops', 'Kids', 'Under Garments', 'New Arrivals'].every((t) => menu.includes(t)), menu);
  check('Under Garments is not a separate main nav item', !(await page.getByRole('navigation', { name: 'Primary' }).locator(':scope > a', { hasText: 'Under Garments' }).count()));
  await page.getByTestId('shop-menu-under-garments').click();
  await page.waitForURL('**/under-garments'); await settle();
  check('clicking Shop > Under Garments opens /under-garments', new URL(page.url()).pathname === '/under-garments');
  check('page heading is Under Garments', (await page.locator('h1').innerText()).trim().toLowerCase() === 'under garments');
  check('admin-managed description is shown', /Everyday essentials/.test(await page.locator('body').innerText()));
  const crumbs = (await page.getByRole('navigation', { name: 'Breadcrumb' }).innerText()).replace(/\s+/g, ' ');
  check('breadcrumb is Home > Shop > Under Garments', /Home\s*chevron_right\s*Shop\s*chevron_right\s*Under Garments|Home.*Shop.*Under Garments/.test(crumbs), crumbs);
  check('Shop stays highlighted as active', await page.getByRole('navigation', { name: 'Primary' }).locator('a[aria-current], a[href="/shop"]').first().isVisible());
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Shop', exact: true }).hover();
  check('Under Garments item is marked current in the menu', (await page.getByTestId('shop-menu-under-garments').getAttribute('aria-current')) === 'page');
  await page.mouse.move(5, 400);

  // ---------- 3. Page content / dynamic sub-categories ----------
  const ugStart = sentProducts.length;
  n = await cardNames();
  check('page lists products of ACTIVE sub-categories only', JSON.stringify(n.sort()) === JSON.stringify(['Cotton Boxer', 'Kids Vest', 'Lace Bralette', 'Trunk Pack']), JSON.stringify(n));
  check('all section requests used section=true', sentProducts.slice(ugStart).filter((q) => q.category === 'under-garments' || q.category?.includes('underwear')).every((q) => q.section === 'true'));
  const subs = (await page.getByTestId('sub-nav').innerText()).replace(/\s+/g, ' ');
  check('sub-category nav is loaded from the backend (inactive Socks absent)', /all under garments/i.test(subs) && /men's underwear/i.test(subs) && /women's underwear/i.test(subs) && /kids' underwear/i.test(subs) && !/socks/i.test(subs), subs);
  // admin adds a sub-category and activates Socks: no code change
  cats.push({ id: 'c-t', name: 'Thermals', slug: 'thermals', parentId: 'c-ug', active: true });
  cats.find((c) => c.slug === 'socks').active = true;
  products.push(P(7, 'Wool Thermal', 'thermals', 1900, ['M', 'L'], [{ name: 'Grey', hexCode: '#888' }]));
  await page.goto(`${BASE}/under-garments`); await settle();
  const subs2 = (await page.getByTestId('sub-nav').innerText()).replace(/\s+/g, ' ');
  check('a new sub-category and a re-activated one appear without a deploy', /thermals/i.test(subs2) && /socks/i.test(subs2), subs2);
  cats.find((c) => c.slug === 'socks').active = false; cats.find((c) => c.slug === 'thermals').active = false;
  await page.goto(`${BASE}/under-garments`); await settle();
  check('deactivating them removes them again', !/thermals|socks/i.test(await page.getByTestId('sub-nav').innerText()));

  // ---------- 4. Sub-category navigation (no reload) ----------
  await page.evaluate(() => { window.__noReload = true; });
  await page.getByTestId('sub-mens-underwear').click(); await settle();
  n = await cardNames();
  check("Men's Underwear shows only its products", JSON.stringify(n.sort()) === JSON.stringify(['Cotton Boxer', 'Trunk Pack']), JSON.stringify(n));
  check('URL carries ?sub= and the page did not reload', page.url().includes('sub=mens-underwear') && (await page.evaluate(() => window.__noReload === true)));
  check('heading follows the sub-category', (await page.locator('h1').innerText()).trim().toLowerCase().includes("men's underwear"));

  // ---------- 5. Filters ----------
  check('size filter shows only sizes that exist here (32, 34)', (await page.getByTestId('filter-size').locator('button').allInnerTexts()).join() === '32,34');
  await page.getByTestId('filter-size').getByRole('button', { name: '32', exact: true }).click(); await settle();
  check('size 32 -> only Cotton Boxer; request carried size', JSON.stringify(await cardNames()) === JSON.stringify(['Cotton Boxer']) && sentProducts.some((q) => q.size === '32'));
  await page.getByRole('button', { name: /Reset/ }).click(); await settle();
  await page.getByTestId('filter-color').getByRole('button', { name: 'Navy' }).click(); await settle();
  check('colour filter works', JSON.stringify(await cardNames()) === JSON.stringify(['Trunk Pack']));
  await page.getByRole('button', { name: /Reset/ }).click(); await settle();
  await page.locator('#ug-min').fill('1000'); await page.getByTestId('filter-price').getByRole('button', { name: 'Apply' }).click(); await settle();
  check('price range works', JSON.stringify(await cardNames()) === JSON.stringify(['Trunk Pack']));
  await page.getByRole('button', { name: /Reset/ }).click(); await settle();
  check('availability filter hidden when everything in this view is in stock', (await page.getByTestId('filter-stock').count()) === 0);
  await page.getByTestId('sub-kids-underwear').click(); await settle();
  check('Kids Underwear: single price/colour/size => no price range filter, availability hidden (all out of stock)', (await page.getByTestId('filter-price').count()) === 0);
  await page.getByTestId('sub-all').click(); await settle();
  check('availability filter appears when some products are out of stock', (await page.getByTestId('filter-stock').count()) === 1);
  await page.getByTestId('filter-stock').getByRole('checkbox').click(); await settle();
  check('in-stock choice is kept in the URL', page.url().includes('stock=1'));
  check('in-stock only hides the sold-out Kids Vest', !(await cardNames()).includes('Kids Vest'));
  await page.getByRole('button', { name: /Reset/ }).click(); await settle();
  await page.locator('#ug-sort').selectOption('price_desc'); await settle();
  n = await cardNames();
  check('sorting price high to low', n[0] === 'Lace Bralette' && n[n.length - 1] === 'Kids Vest', JSON.stringify(n));
  check('cards show available sizes', (await page.getByTestId('card-sizes').first().innerText()).startsWith('Sizes:'));
  // empty + search
  await page.locator('#ug-search').fill('zzz'); await page.locator('#ug-search').press('Enter'); await settle();
  check('empty state with a reset action', /No products match/.test(await page.locator('body').innerText()) && (await page.getByRole('button', { name: 'Reset filters' }).count()) === 1);
  await page.getByRole('button', { name: 'Reset filters' }).click(); await settle();
  check('reset restores the list', (await cardNames()).length >= 3);

  // ---------- 6. Keyboard ----------
  await page.goto(`${BASE}/`); await settle();
  await page.getByTestId('shop-menu-toggle').focus();
  await page.keyboard.press('Enter');
  check('Enter on the Shop caret opens the menu (aria-expanded)', (await page.getByTestId('shop-menu-toggle').getAttribute('aria-expanded')) === 'true');
  await page.keyboard.press('Tab');
  check('Tab moves focus into the menu links', await page.evaluate(() => !!document.activeElement.closest('#shop-menu')));
  await page.keyboard.press('Escape');
  check('Escape closes the menu', (await page.getByTestId('shop-menu').count()) === 0);

  // ---------- 7. Mobile + tablet ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`); await settle();
  await page.locator('#mobile-menu-btn').click();
  const mobile = (await page.getByTestId('mobile-shop-menu').innerText()).replace(/\s+/g, ' ');
  check('mobile drawer lists Under Garments under Shop', /Under Garments/.test(mobile) && /Men/.test(mobile) && /New Arrivals/.test(mobile), mobile);
  await page.getByTestId('mobile-shop-menu').getByRole('link', { name: 'Under Garments' }).click();
  await page.waitForURL('**/under-garments'); await settle();
  check('mobile: navigates to the page and closes the drawer', (await page.locator('#mobile-nav-drawer').getAttribute('aria-hidden')) === 'true');
  check('mobile: filters collapsed behind a Filters button', await page.getByRole('button', { name: /Filters/ }).isVisible() && !(await page.getByTestId('filter-size').isVisible()));
  await page.getByRole('button', { name: /Filters/ }).click();
  check('mobile: Filters button reveals the filters', await page.getByTestId('filter-size').isVisible());
  check('mobile: 2-column grid, no horizontal overflow', (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)) && (await page.getByTestId('ug-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)) === 2);
  await page.setViewportSize({ width: 768, height: 1024 }); await settle();
  check('tablet: no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: '/tmp/ug-tablet.png' });
  await page.setViewportSize({ width: 1280, height: 900 }); await settle();
  await page.screenshot({ path: '/tmp/ug-desktop.png' });

  // ---------- 8. Section unpublished ----------
  cats.find((c) => c.slug === 'under-garments').active = false;
  await page.goto(`${BASE}/under-garments`); await settle();
  check("deactivated section shows a friendly 'not available' state, no products", /isn't available/i.test(await page.locator('body').innerText()) && (await cardNames()).length === 0);
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Shop', exact: true }).hover();
  check('and the Shop menu no longer links to it', !(await page.getByTestId('shop-menu').innerText()).includes('Under Garments'));

  check('no console/page errors', errs.length === 0, errs.join(' | '));
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  await browser.close(); process.exit(results.every(Boolean) ? 0 : 1);
})();
