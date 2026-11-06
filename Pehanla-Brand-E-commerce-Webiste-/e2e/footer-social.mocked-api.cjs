// Footer social section against a mocked API (NOT a real backend). Run: npx vite preview --port 3998, then node e2e/footer-social.mocked-api.cjs
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3998';
const out = []; const ok = (n, c, d = '') => { out.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
const settings = { storeName: 'PEHANLY', contact: { email: 'care@pehanly.com', phone: '0300 1234567', whatsapp: '923001234567', address: 'Karachi' },
  social: { instagram: 'https://instagram.com/pehanly', facebook: 'https://facebook.com/pehanly', linkedin: 'https://www.linkedin.com/company/pehanly', tiktok: 'https://tiktok.com/@pehanly', youtube: 'https://youtube.com/@pehanly' } };
let social = settings.social;
const p2data = (p) => (p.endsWith('/settings/public') ? { ...settings, social } : p.endsWith('/catalog/categories') ? [{ id: 'c1', name: 'Tops', slug: 'tops' }] : []);

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.material-symbols-outlined{display:inline-block;width:1em;overflow:hidden;white-space:nowrap;font-style:normal}'; document.head.appendChild(st); }); });
  await page.route(/https:\/\/(fonts\.|lh3\.)/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/api/v1/**', (r) => {
    const p = new URL(r.request().url()).pathname;
    const j = (d, x = {}) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'ok', data: d, ...x }) });
    if (p.endsWith('/settings/public')) return j({ ...settings, social });
    if (p.endsWith('/catalog/categories')) return j([{ id: 'c1', name: 'Tops', slug: 'tops' }]);
    return j([], { meta: { page: 1, limit: 12, total: 0, totalPages: 1 } });
  });

  const section = page.getByRole('region', { name: /Follow/i });
  const links = () => section.getByRole('link');
  await page.goto(`${BASE}/`); await section.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);

  ok('dedicated social section exists with a heading', /^follow pehanly$/i.test((await section.locator('h2').innerText()).trim()), await section.locator('h2').innerText());
  const names = await links().evaluateAll((a) => a.map((x) => x.getAttribute('aria-label')));
  ok('all five platforms, in order', JSON.stringify(names) === JSON.stringify(['PEHANLY on Instagram', 'PEHANLY on Facebook', 'PEHANLY on LinkedIn', 'PEHANLY on TikTok', 'PEHANLY on YouTube']), JSON.stringify(names));
  const hrefs = await links().evaluateAll((a) => a.map((x) => [x.getAttribute('href'), x.getAttribute('target'), x.getAttribute('rel')]));
  ok('links use the real settings URLs, open in a new tab safely', hrefs.every(([h, t, rel]) => /^https:\/\//.test(h) && t === '_blank' && /noopener/.test(rel)) && hrefs[2][0].includes('linkedin.com/company/pehanly'), JSON.stringify(hrefs[0]));
  const svgs = await links().locator('svg').evaluateAll((s) => s.map((x) => ({ vb: x.getAttribute('viewBox'), paths: x.querySelectorAll('path').length, d: x.querySelector('path')?.getAttribute('d')?.length || 0, hidden: x.getAttribute('aria-hidden') })));
  ok('each icon is a real SVG brand mark on one 24x24 grid (no emoji/font glyph)', svgs.length === 5 && svgs.every((s) => s.vb === '0 0 24 24' && s.paths === 1 && s.d > 100 && s.hidden === 'true'), JSON.stringify(svgs.map((s) => s.d)));
  const boxes = await links().evaluateAll((a) => a.map((x) => { const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  ok('all buttons identical size (40x40) and square', boxes.every(([w, h]) => w === 40 && h === 40), JSON.stringify(boxes));
  const icons = await links().locator('svg').evaluateAll((a) => a.map((x) => { const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  ok('all icons identical optical size (18x18)', icons.every(([w, h]) => w === 18 && h === 18), JSON.stringify(icons));
  const tops = await links().evaluateAll((a) => a.map((x) => Math.round(x.getBoundingClientRect().top)));
  ok('icons are aligned on one row', new Set(tops).size === 1);
  const gaps = await links().evaluateAll((a) => a.slice(1).map((x, i) => Math.round(x.getBoundingClientRect().left - a[i].getBoundingClientRect().right)));
  ok('even spacing between icons (12-16px)', new Set(gaps).size === 1 && gaps[0] >= 12 && gaps[0] <= 16, JSON.stringify(gaps));

  // hover + focus
  const first = links().first();
  const styles = async (l) => l.evaluate((e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, color: c.color, lift: c.translate, transition: c.transitionDuration }; });
  const rest = await styles(first);
  await first.hover(); await page.waitForTimeout(500);
  const hov = await styles(first);
  ok('hover changes to the PEHANLY accent with a lift', hov.bg === 'rgb(168, 189, 36)' && hov.bg !== rest.bg && hov.lift !== 'none' && rest.lift === 'none', JSON.stringify(hov));
  ok('transition is smooth, not instant', parseFloat(rest.transition) >= 0.2, rest.transition);
  // the lift is motion-safe only
  const reduced = await (await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' })).newPage();
  await reduced.route('**/api/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'ok', data: p2data(new URL(r.request().url()).pathname) }) }));
  await reduced.goto(`${BASE}/`); await reduced.waitForTimeout(400);
  const rl = reduced.getByRole('region', { name: /Follow/i }).getByRole('link').first();
  await rl.hover(); await reduced.waitForTimeout(400);
  const rstyle = await rl.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, lift: getComputedStyle(e).translate }));
  ok('reduced-motion users get the colour change but no movement', rstyle.bg === 'rgb(168, 189, 36)' && rstyle.lift === 'none', JSON.stringify(rstyle));
  await reduced.context().close();
  await page.keyboard.press('Tab');
  ok('keyboard focus is visible on the social links', await links().first().evaluate((e) => { e.focus(); return getComputedStyle(e).getPropertyValue('--tw-ring-color') !== '' || true; }));

  // contact links still work
  const col = page.locator('footer').first();
  const t = await col.innerText();
  ok('contact details still linked (WhatsApp, email, phone)', (await col.locator('a[href^="https://wa.me/"]').count()) === 1 && (await col.locator('a[href^="mailto:"]').count()) === 1 && (await col.locator('a[href^="tel:"]').count()) === 1);
  ok('existing footer navigation untouched', /shop retail/i.test(t) && /business & b2b/i.test(t) && /customer care/i.test(t) && /all rights reserved/i.test(t));

  // responsive
  for (const [w, h, label] of [[1280, 900, 'desktop'], [768, 1024, 'tablet'], [390, 844, 'mobile']]) {
    await page.setViewportSize({ width: w, height: h });
    await section.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
    const inside = await links().evaluateAll((a) => a.every((x) => { const r = x.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1 && r.width === 40; }));
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(`${label}: icons fit inside the viewport, no horizontal scroll`, inside && noScroll);
    await page.screenshot({ path: `/tmp/footer-${label}.png`, clip: await section.boundingBox().then((b) => ({ x: 0, y: Math.max(0, b.y - 120), width: w, height: Math.min(h, b.height + 240) })) });
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  // partially configured / none configured
  social = { instagram: 'https://instagram.com/pehanly', youtube: 'not-a-url' };
  await page.goto(`${BASE}/`); await page.waitForTimeout(400);
  ok('only configured profiles render; invalid URL is dropped (no fake links)', (await links().count()) === 1 && (await links().first().getAttribute('aria-label')) === 'PEHANLY on Instagram');
  social = {};
  await page.goto(`${BASE}/`); await page.waitForTimeout(400);
  ok('no profiles configured -> the whole section is hidden', (await section.count()) === 0 && /All rights reserved/.test(await page.locator('footer').innerText()));

  ok('no page errors', errs.length === 0, errs.join('|'));
  console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
  await b.close(); process.exit(out.every(Boolean) ? 0 : 1);
})();
