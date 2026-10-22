const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = 'http://localhost:3998';
const img = 'https://img.test/p.jpg';
const sku = (id, size, over = {}) => ({ id, sku: `TEE-${size}`, size, price: 2800, compareAtPrice: 3200, priceUSD: size === 'L' ? null : 14.5, compareAtPriceUSD: size === 'L' ? null : 18, inStock: true, maxQuantity: 5, ...over });
const product = {
  id: 'p1', name: 'Heavy Tee', slug: 'heavy-tee', shortDescription: 'A tee', description: 'Heavyweight cotton tee.',
  category: { name: 'T-Shirts', slug: 't-shirts' }, image: { url: img, alt: 'Tee' }, images: [{ url: img, alt: 'Tee' }],
  isNewArrival: true, isBestSeller: false, priceMin: 2800, priceMax: 2800, priceMinUSD: 14.5, priceMaxUSD: 14.5, currencies: ['PKR', 'USD'], inStock: true,
  variants: [{ id: 'v1', color: { name: 'Black', hexCode: '#111' }, images: [{ url: img }], sizes: [sku('a'.repeat(24), 'M'), sku('b'.repeat(24), 'L'), sku('c'.repeat(24), 'XL', { inStock: false, maxQuantity: 0 })] }],
};
const card = { id: 'p1', name: product.name, slug: product.slug, category: product.category, image: product.image, priceMin: 2800, priceMax: 2800, priceMinUSD: 14.5, priceMaxUSD: 14.5, currencies: ['PKR', 'USD'], inStock: true, isNewArrival: true, colors: [{ name: 'Black', hexCode: '#111' }] };
const cats = [{ id: 'c1', name: 'T-Shirts', slug: 't-shirts' }, { id: 'c2', name: 'Hoodies', slug: 'hoodies' }];
let registered = false; let lastOrderBody = null; let couponCalls = 0;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const ctx = await b.newContext({ timezoneId: 'Asia/Karachi', locale: 'en-PK' });
  const page = await ctx.newPage();
  let errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  await page.route(/https:\/\/(img\.test|fonts\.|lh3\.)/, (r) => r.fulfill({ status: 200, contentType: r.request().url().includes('fonts') ? 'text/css' : 'image/gif', body: r.request().url().includes('fonts') ? '' : Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') }));
  await page.route('**/api/v1/**', async (r) => {
    const req = r.request(); const u = new URL(req.url()); const p = u.pathname.replace('/api/v1', '').replace(/^\/catalog/, ''); const m = req.method();
    const j = (d, extra = {}, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status < 400, message: 'ok', data: d, ...extra }) });
    const err = (status, message, code, errors) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false, message, code, errors }) });
    const meta = { page: 1, limit: 12, total: 1, totalPages: 1 };
    if (p === '/auth/me') return registered ? j({ user: { id: 'u1', name: 'Ayesha Khan', email: 'a@x.pk', phone: '03001234567', role: 'customer' } }) : err(401, 'Unauthorized', 'UNAUTHORIZED');
    if (p === '/auth/login' && m === 'POST') { registered = true; return j({ user: { id: 'u1', name: 'Ayesha Khan', email: 'a@x.pk', phone: '03001234567', role: 'customer' } }); }
    if (p === '/categories') return j(cats);
    if (p === '/products') return j([card], { meta });
    if (p === '/products/heavy-tee') return j(product);
    if (p.startsWith('/products/') && m === 'GET') return err(404, 'Product not found', 'PRODUCT_NOT_FOUND');
    if (p.includes('/reviews/summary') || p.endsWith('/summary')) return j({ averageRating: 0, reviewCount: 0, distribution: {} });
    if (p.includes('/reviews')) return j([], { meta: { page: 1, limit: 6, total: 0, totalPages: 1 } });
    if (p === '/banners') return j([]);
    if (p === '/settings/public') return j({ checkout: { codEnabled: true }, returns: { enabled: true, windowDays: 7 }, store: { name: 'PEHAN LY' }, contact: {}, currencies: { base: 'PKR', supported: ['PKR', 'USD'], paymentMethods: { PKR: ['cod'], USD: [] } } });
    if (p === '/shipping/free-shipping' && u.searchParams.get('currency') === 'USD') return j({ available: true, country: null, currency: 'USD', minimumOrderAmount: 75, ruleName: 'Free over $75' });
    if (p === '/shipping/free-shipping') return j({ available: true, country: 'Pakistan', minimumOrderAmount: 5000, ruleName: 'Free over 5000' });
    if (p === '/shipping/quote' || p.startsWith('/shipping')) return j({ amount: Number(u.searchParams.get('subtotal')) >= 5000 ? 0 : 250 });
    if (p === '/coupons/validate') { couponCalls++; return j({ code: 'SAVE10', discountAmount: 280, discountType: 'percentage', discountValue: 10 }); }
    if (p === '/orders' && m === 'POST') { lastOrderBody = JSON.parse(req.postData()); return j({ orderNumber: 'PHN-0001', pricing: { subtotal: 2800, discount: 0, shipping: 250, total: 3050 }, items: [{ productName: 'Heavy Tee', colorName: 'Black', size: 'M', quantity: 1, lineTotal: 2800 }] }, {}, 201); }
    if (p === '/wholesale/packs') return j([], { meta });
    if (p.startsWith('/manufacturing') || p.startsWith('/printing')) return j([]);
    return j([], { meta });
  });
  const open = async (path) => { errs = []; await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(250); };
  const info = async () => page.evaluate(() => ({
    title: document.title, h1: document.querySelectorAll('h1').length, mains: document.querySelectorAll('main').length,
    robots: document.querySelector('meta[name=robots]')?.content || '', canonical: document.querySelector('link[rel=canonical]')?.href || '',
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)['@type']),
  }));
  const fails = [];
  const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) fails.push(name); };

  for (const rt of ['/', '/shop', '/shop/t-shirts', '/product/heavy-tee', '/cart', '/checkout', '/track-order', '/account', '/wishlist', '/about', '/wholesale', '/custom-manufacturing', '/printing-branding', '/nope', '/product/missing']) {
    await open(rt); const i = await info();
    console.log(rt.padEnd(24), JSON.stringify(i), errs.length ? 'ERR ' + errs.join(' ;; ') : '');
    check(`no console errors ${rt}`, errs.length === 0, errs.join(';'));
    check(`exactly one main ${rt}`, i.mains === 1, `mains=${i.mains}`);
    if (!['/nope', '/product/missing'].includes(rt)) check(`one h1 ${rt}`, i.h1 === 1, `h1=${i.h1}`);
  }

  // SEO assertions
  await open('/product/heavy-tee'); let i = await info();
  check('PDP has Product + BreadcrumbList JSON-LD', i.ld.includes('Product') && i.ld.includes('BreadcrumbList'), JSON.stringify(i.ld));
  check('PDP no aggregateRating (no reviews)', !(await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].some((s) => s.textContent.includes('aggregateRating')))));
  await open('/cart'); i = await info(); check('cart is noindex', /noindex/.test(i.robots), i.robots);
  await open('/shop?q=tee'); i = await info(); check('search results noindex', /noindex/.test(i.robots), i.robots);
  await open('/shop?sort=price_asc'); i = await info(); check('sorted shop noindex + clean canonical', /noindex/.test(i.robots) && !/sort=/.test(i.canonical), i.canonical);
  await open('/nope'); i = await info(); check('404 noindex', /noindex/.test(i.robots));
  await open('/'); i = await info(); check('home has Organization+WebSite schema', i.ld.includes('Organization') && i.ld.includes('WebSite'), JSON.stringify(i.ld));

  // Guest purchase flow
  await open('/product/heavy-tee');
  await page.getByRole('button', { name: 'Add To Cart' }).click();
  check('size required message', await page.getByText('Please select a size.').isVisible());
  await page.getByRole('radio', { name: 'Size XL (sold out)' }).click({ force: true });
  check('sold-out size not selectable', await page.getByText('Please select a size.').isVisible());
  await page.getByRole('radio', { name: 'Size M' }).click();
  await page.getByRole('button', { name: 'Add To Cart' }).click();
  await page.goto(BASE + '/cart', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(300);
  check('cart persisted across reload shows item', await page.getByText('Heavy Tee').first().isVisible());
  check('free-shipping progress is from backend rule', await page.getByText(/more to unlock free shipping/).isVisible());
  check('guest sees coupon sign-in prompt (no input)', (await page.getByLabel('Coupon code').count()) === 0 && await page.getByText(/Coupons are a member benefit/).isVisible());
  await page.getByRole('button', { name: /Proceed to Checkout/ }).click();
  await page.waitForURL('**/checkout');
  await page.getByRole('button', { name: 'Place order' }).click();
  check('checkout validates empty form', await page.getByText('Enter your full name.').isVisible());
  await page.getByLabel('Full name').fill('Guest Buyer');
  await page.getByLabel('Email').fill('guest@x.pk');
  await page.getByLabel('Phone').fill('03001234567');
  await page.getByLabel('Street address').fill('House 1, Street 2');
  await page.getByLabel('City').fill('Lahore');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.waitForURL('**/order-confirmation');
  await page.getByText('PHN-0001').first().waitFor({ timeout: 5000 }).catch(() => {});
  check('order confirmation shows backend order number', await page.getByText('PHN-0001').first().isVisible());
  check('order body has only sku+quantity items, no prices/totals', lastOrderBody && Object.keys(lastOrderBody.items[0]).sort().join() === 'quantity,sku' && !('total' in lastOrderBody) && !('pricing' in lastOrderBody) && !('couponCode' in lastOrderBody), JSON.stringify(lastOrderBody));
  check('payment method is cod', lastOrderBody?.paymentMethod === 'cod');
  await page.goto(BASE + '/cart', { waitUntil: 'networkidle' });
  check('cart cleared after order', await page.getByText('Your Bag is Empty').isVisible());
  await open('/order-confirmation'); check('confirmation without state redirects to tracking', page.url().endsWith('/track-order'));

  // Registered flow with coupon
  await open('/account');
  await page.getByLabel('Email or phone').fill('a@x.pk'); await page.getByLabel('Password').fill('secret123');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.getByText('Welcome back, Ayesha').waitFor();
  check('login shows dashboard', true);
  await open('/product/heavy-tee'); await page.getByRole('radio', { name: 'Size L' }).click(); await page.getByRole('button', { name: 'Add To Cart' }).click();
  await page.goto(BASE + '/cart', { waitUntil: 'networkidle' });
  await page.getByLabel('Coupon code').fill('save10'); await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByText('SAVE10 applied').waitFor();
  check('registered user can apply coupon (validated by backend)', couponCalls > 0);
  await page.getByRole('button', { name: /Proceed to Checkout/ }).click(); await page.waitForURL('**/checkout');
  check('checkout prefilled from profile', (await page.getByLabel('Email').inputValue()) === 'a@x.pk');
  await page.getByLabel('Street address').fill('House 9, Street 3'); await page.getByLabel('City').fill('Karachi'); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Place order' }).click(); await page.waitForURL('**/order-confirmation');
  check('coupon code sent to backend for registered customer only', lastOrderBody?.couponCode === 'SAVE10', JSON.stringify(lastOrderBody?.couponCode));


  // ---- Multi-currency ----
  const urls = []; page.on('request', (rq) => { if (/\/api\/v1\//.test(rq.url())) urls.push(rq.url()); });
  await open('/');
  const sel = page.getByLabel('Currency').first();
  check('default currency is PKR for a Pakistan visitor', (await sel.inputValue()) === 'PKR');
  check('header shows PKR free-shipping threshold', await page.getByText(/Rs\. 5,000/).first().isVisible());
  await sel.selectOption('USD');
  await page.waitForTimeout(400);
  check('switch to USD shows backend USD threshold', await page.getByText(/\$75/).first().isVisible());
  check('currency never put in the URL', !/currency/.test(page.url()));
  await open('/product/heavy-tee');
  check('PDP shows USD price', await page.getByText('$14.50').first().isVisible());
  check('manual choice persisted across reload', (await page.getByLabel('Currency').first().inputValue()) === 'USD');
  check('only currency+source stored, no auth/token', await page.evaluate(() => { const v = localStorage.getItem('pehanly-currency-v1') || ''; return /manual/.test(v) && !/token|jwt|bearer/i.test(v + JSON.stringify(Object.keys(localStorage))); }));
  check('size without USD price is disabled in USD', await page.getByRole('radio', { name: /Size L/ }).isDisabled());
  await page.getByRole('radio', { name: 'Size M' }).click(); await page.getByRole('button', { name: 'Add To Cart' }).click();
  await page.goto(BASE + '/cart', { waitUntil: 'networkidle' });
  check('cart shows USD subtotal', await page.getByText('$14.50').first().isVisible());
  check('USD checkout is blocked, not faked', await page.getByText(/not (yet )?available/i).first().isVisible() && await page.getByRole('button', { name: /Proceed to Checkout/ }).isDisabled());
  check('no order was posted in USD', !lastOrderBodyUSD());
  function lastOrderBodyUSD() { return lastOrderBody?.currency === 'USD'; }
  await page.getByRole('button', { name: /Switch to PKR/ }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  check('switching back to PKR re-enables checkout', await page.getByRole('button', { name: /Proceed to Checkout/ }).isEnabled());
  await open('/shop');
  check('shop card shows PKR after switching back', await page.getByText('Rs. 2,800').first().isVisible());
  check('canonical stays clean after currency change', !/currency/.test((await info()).canonical));
  check('PDP JSON-LD offers both real currencies regardless of selection', await (async () => { await open('/product/heavy-tee'); return page.evaluate(() => { const t = [...document.querySelectorAll('script[type="application/ld+json"]')].map((x) => x.textContent).join(''); return t.includes('"PKR"') && t.includes('"USD"') && !t.includes('aggregateRating'); }); })());
  // International visitor: initial USD from detection, bots stay PKR
  const intl = await b.newContext({ timezoneId: 'America/New_York', locale: 'en-US', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
  const p2 = await intl.newPage();
  // Automation sets navigator.webdriver (detection treats that as a bot -> PKR); emulate a real browser here.
  await p2.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await p2.route(/https:\/\/(img\.test|fonts\.|lh3\.)/, (rt) => rt.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await p2.route('**/api/v1/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], meta: { page: 1, limit: 12, total: 0, totalPages: 1 } }) }));
  await p2.goto(BASE + '/', { waitUntil: 'networkidle' });
  check('international visitor defaults to USD', (await p2.getByLabel('Currency').first().inputValue()) === 'USD');
  await p2.setViewportSize({ width: 390, height: 800 });
  await p2.getByRole('button', { name: /menu/i }).first().click().catch(() => {});
  check('mobile drawer has a visible currency selector', await p2.getByLabel('Currency').last().isVisible().catch(() => false));
  const bot = await b.newContext({ timezoneId: 'America/New_York', locale: 'en-US' });
  const p3 = await bot.newPage();
  await p3.route('**/api/v1/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], meta: { page: 1, limit: 12, total: 0, totalPages: 1 } }) }));
  await p3.goto(BASE + '/', { waitUntil: 'networkidle' });
  check('automation/bot traffic stays PKR (indexed storefront)', (await p3.getByLabel('Currency').first().inputValue()) === 'PKR');
  await bot.close();
  await intl.close();

  // a11y smoke: skip link + search dialog
  await open('/');
  await page.keyboard.press('Tab');
  check('skip link is first focusable', /skip/i.test(await page.evaluate(() => document.activeElement?.textContent || '')));
  console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(' | ')}` : '\nALL CHECKS PASSED');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
