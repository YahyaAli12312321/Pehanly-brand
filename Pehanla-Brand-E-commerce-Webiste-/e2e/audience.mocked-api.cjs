/* Storefront Men / Women / Unisex browsing against a mocked API that applies the SAME rule as the backend:
 * audience=men -> men + unisex; audience=women -> women + unisex; men-only never appears under women. */
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:3998';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
const mk = (id, name, audience, imgName) => ({ id: String(id).padStart(24, '0'), name, slug: name.toLowerCase().replace(/\W+/g, '-'), audience, category: { name: 'Tops', slug: 'tops' }, image: { url: `https://img.test/${imgName}.png` }, priceMin: 2800, priceMax: 2800, priceMinUSD: 14.5, priceMaxUSD: 14.5, currencies: ['PKR', 'USD'], inStock: true, colors: [{ name: 'Black', hexCode: '#111' }] });
const ALL = [mk(1, 'Mens Jacket', 'men', 'portrait'), mk(2, 'Womens Dress', 'women', 'portrait'), mk(3, 'Unisex Hoodie', 'unisex', 'square'), mk(4, 'Mens Cargo', 'men', 'landscape'), mk(5, 'Womens Kurta', 'women', 'portrait')];
const visible = (aud) => (aud === 'men' ? ALL.filter((p) => ['men', 'unisex'].includes(p.audience)) : aud === 'women' ? ALL.filter((p) => ['women', 'unisex'].includes(p.audience)) : ALL);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const sent = [];
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.material-symbols-outlined{display:inline-block;width:1em;overflow:hidden;white-space:nowrap;vertical-align:middle;font-style:normal}'; document.head.appendChild(st); }); });
  await page.route(/https:\/\/(fonts\.|lh3\.)/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/https:\/\/img\.test\/(\w+)\.png/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(__dirname, `img-${r.request().url().match(/img\.test\/(\w+)\.png/)[1]}.png`)) }));
  await page.route('**/api/v1/**', async (r) => {
    const u = new URL(r.request().url()); const p = u.pathname.replace('/api/v1', '');
    const j = (data, extra = {}) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'ok', data, ...extra }) });
    if (p === '/catalog/products') {
      sent.push(Object.fromEntries(u.searchParams));
      let items = visible(u.searchParams.get('audience'));
      const s = (u.searchParams.get('search') || '').toLowerCase();
      if (s) items = items.filter((x) => x.name.toLowerCase().includes(s));
      return j(items, { meta: { page: 1, limit: 12, total: items.length, totalPages: 1, pages: 1 } });
    }
    if (p === '/catalog/categories') return j([{ id: 'c1', name: 'Tops', slug: 'tops' }]);
    if (p === '/settings/public') return j({});
    return j([], { meta: { page: 1, limit: 12, total: 0, totalPages: 1 } });
  });
  const names = async () => (await page.locator('article h2, article h3').allInnerTexts()).map((t) => t.trim()).filter(Boolean);

  await page.goto(`${BASE}/shop`); await page.getByTestId('audience-filter').waitFor();
  let n = await names();
  check('All shows everything (5)', n.length === 5, JSON.stringify(n));

  await page.getByTestId('audience-filter').getByRole('button', { name: 'Men', exact: true }).click();
  await page.waitForFunction(() => location.search.includes('audience=men'));
  await page.waitForTimeout(400);
  n = await names();
  check('Men => men + unisex only', n.length === 3 && n.includes('Mens Jacket') && n.includes('Mens Cargo') && n.includes('Unisex Hoodie') && !n.some((x) => /Womens/.test(x)), JSON.stringify(n));
  check('API request carried audience=men', sent.some((q) => q.audience === 'men'));

  await page.getByTestId('audience-filter').getByRole('button', { name: 'Women', exact: true }).click();
  await page.waitForFunction(() => location.search.includes('audience=women'));
  await page.waitForTimeout(400);
  n = await names();
  check('Women => women + unisex only', n.length === 3 && n.includes('Womens Dress') && n.includes('Womens Kurta') && n.includes('Unisex Hoodie') && !n.some((x) => /Mens/.test(x)), JSON.stringify(n));

  // search + audience together, category link keeps audience
  await page.goto(`${BASE}/shop?audience=women&q=hoodie`);
  await page.waitForTimeout(500);
  n = await names();
  check('search + audience: Unisex hoodie found under Women', n.length === 1 && n[0] === 'Unisex Hoodie', JSON.stringify(n));
  await page.goto(`${BASE}/shop?audience=men&q=dress`);
  await page.waitForTimeout(500);
  check('search + audience: women-only dress not found under Men', (await names()).length === 0);
  await page.goto(`${BASE}/shop?audience=men`);
  await page.waitForTimeout(400);
  const href = await page.locator('aside a', { hasText: 'Tops' }).first().getAttribute('href');
  check('category link keeps the audience', /audience=men/.test(href || ''), href);
  check('heading reflects audience', (await page.locator('h1').first().innerText()).trim().toLowerCase() === 'men');
  check('filter chip present and removable', await page.getByLabel('Remove audience filter').isVisible());
  await page.getByLabel('Remove audience filter').click();
  await page.waitForTimeout(400);
  check('removing it restores All', (await names()).length === 5);

  // card image fitting: square image is shown whole (contain), portrait fills (cover)
  await page.goto(`${BASE}/shop`); await page.waitForTimeout(800);
  const fits = await page.evaluate(() => [...document.querySelectorAll('article')].map((a) => { const im = [...a.querySelectorAll('img')].find((i) => i.getAttribute('aria-hidden') !== 'true'); return im ? [im.getAttribute('alt'), getComputedStyle(im).objectFit] : null; }).filter(Boolean));
  const fit = (nm) => (fits.find(([a]) => a === nm) || [])[1];
  check('square image on a card is shown whole (contain)', fit('Unisex Hoodie') === 'contain', JSON.stringify(fits));
  check('landscape image on a card is shown whole (contain)', fit('Mens Cargo') === 'contain');
  check('portrait image fills the card (cover)', fit('Mens Jacket') === 'cover');

  // mobile drawer links
  await page.setViewportSize({ width: 390, height: 800 }); await page.goto(`${BASE}/`);
  await page.getByLabel('Open Navigation Menu').click();
  await page.getByRole('link', { name: 'Shop Women' }).click();
  await page.waitForFunction(() => location.search.includes('audience=women'));
  check('mobile drawer "Shop Women" opens the Women view', true);
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
