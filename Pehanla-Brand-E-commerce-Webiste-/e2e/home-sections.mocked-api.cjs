/* Homepage New Arrivals + Shop By Category against a mocked API that applies the SAME rules as the backend
 * (isNewArrival === true; parentOnly => parentId null). A "leaky" switch makes the mock ignore both filters to prove the
 * storefront also defends itself. Admin toggle is simulated by flipping the flag in the mock and reloading. */
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3998';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
const prod = (id, name, isNewArrival) => ({ id: String(id).padStart(24, '0'), name, slug: name.toLowerCase().replace(/\W+/g, '-'), isNewArrival, category: { name: 'Tops', slug: 'tops' }, image: null, priceMin: 650, priceMax: 650, priceMinUSD: 3, priceMaxUSD: 3, currencies: ['PKR'], inStock: true, colors: [] });
const state = { leaky: false, products: [prod(1, 'Flagged Tee', true), prod(2, 'Unflagged Tee', false), prod(3, 'Missing Flag Tee', undefined), prod(4, 'Flagged Coat', true)] };
const CATS = [
  { id: 'c1', name: 'Men', slug: 'men', parentId: null }, { id: 'c2', name: 'Mens Tees', slug: 'mens-tees', parentId: 'c1' },
  { id: 'c3', name: 'Women', slug: 'women', parentId: null }, { id: 'c4', name: 'Dresses', slug: 'dresses', parentId: 'c3' },
];
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const sent = { products: [], categories: [] };
  await page.route(/https:\/\/(fonts\.|lh3\.)/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/api/v1/**', async (r) => {
    const u = new URL(r.request().url()); const p = u.pathname.replace('/api/v1', '');
    const j = (data, extra = {}) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'ok', data, ...extra }) });
    if (p === '/catalog/products') {
      sent.products.push(Object.fromEntries(u.searchParams));
      let items = state.products;
      if (u.searchParams.get('newArrival') === 'true' && !state.leaky) items = items.filter((x) => x.isNewArrival === true);
      return j(items, { meta: { page: 1, limit: 12, total: items.length, totalPages: 1, pages: 1 } });
    }
    if (p === '/catalog/categories') {
      sent.categories.push(Object.fromEntries(u.searchParams));
      return j(u.searchParams.get('parentOnly') === 'true' && !state.leaky ? CATS.filter((c) => !c.parentId) : CATS);
    }
    if (p === '/auth/me') return r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'UNAUTHORIZED', message: 'x' }) });
    if (p === '/settings/public') return j({});
    return j([], { meta: { page: 1, limit: 12, total: 0, totalPages: 1 } });
  });
  const newNames = async () => (await page.locator('section[aria-labelledby="new-h"] h3').allInnerTexts()).map((t) => t.trim());
  const catNames = async () => (await page.locator('section[aria-labelledby="cat-h"] h3').allInnerTexts()).map((t) => t.trim());

  await page.goto(`${BASE}/`); await page.locator('#new-h').waitFor();
  let n = await newNames();
  check('New Arrivals shows only flagged products', n.length === 2 && n.includes('Flagged Tee') && n.includes('Flagged Coat'), JSON.stringify(n));
  check('unset/false flags are not shown', !n.includes('Unflagged Tee') && !n.includes('Missing Flag Tee'));
  check('request carried newArrival=true', sent.products.some((q) => q.newArrival === 'true'), JSON.stringify(sent.products));
  let c = await catNames();
  check('Shop By Category shows parent categories only', c.length === 2 && c.includes('MEN') && c.includes('WOMEN'), JSON.stringify(c));
  check('request carried parentOnly=true', sent.categories.some((q) => q.parentOnly === 'true'));
  check('parent card links to its category page', (await page.locator('section[aria-labelledby="cat-h"] a', { hasText: 'Men' }).first().getAttribute('href')) === '/shop/men');

  // admin turns the flag off -> after refetch the product is gone
  state.products[0].isNewArrival = false;
  await page.reload(); await page.locator('#new-h').waitFor();
  n = await newNames();
  check('disabling the flag removes the product', n.length === 1 && n[0] === 'Flagged Coat', JSON.stringify(n));
  // all flags off -> whole section hidden
  state.products.forEach((p) => { p.isNewArrival = false; });
  await page.reload(); await page.waitForTimeout(800);
  check('no flagged products => section hidden', (await page.locator('#new-h').count()) === 0);

  // defence in depth: even if the API leaked everything, the page filters
  state.leaky = true; state.products[1].isNewArrival = true;
  await page.reload(); await page.locator('#new-h').waitFor();
  n = await newNames();
  check('leaky API: unflagged still hidden client-side', n.length === 1 && n[0] === 'Unflagged Tee', JSON.stringify(n));
  c = await catNames();
  check('leaky API: children still hidden client-side', c.length === 2 && !c.includes('Dresses') && !c.includes('Mens Tees'), JSON.stringify(c));

  // subcategories are still reachable: the shop page lists them (not hidden globally)
  state.leaky = false;
  await page.goto(`${BASE}/shop?newArrival=true`); await page.waitForTimeout(800);
  check('shop?newArrival=true heading + chip', (await page.locator('h1').first().innerText()).trim().toLowerCase() === 'new arrivals' && await page.getByLabel('Remove new arrivals filter').isVisible());
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
