// Creation wizard: exactly one main image (preview, replace, remove), and the edit flow keeps the 25-image gallery.
// Run: npm run build && npx vite preview --port 3997 --strictPort, then node e2e/single-image.mocked-api.cjs
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const BASE = 'http://localhost:3997';
const IMG = (n) => path.join(__dirname, '..', '..', 'web', 'e2e', `img-${n}.png`);
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  let uploads = 0; let created = null;
  await page.route(/https:\/\/(fonts\.|res\.cloudinary)/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: require('fs').readFileSync(IMG('square')) }));
  await page.route('**/api/v1/**', async (r) => {
    const req = r.request(); const p = new URL(req.url()).pathname.replace('/api/v1', ''); const m = req.method();
    const j = (d, s = 200, x = {}) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify({ success: s < 400, message: 'ok', data: d, ...x }) });
    if (p === '/auth/me') return j({ user: { _id: 'u1', name: 'Owner', role: 'admin', permissions: ['*'] } });
    if (p === '/media' && m === 'POST') { uploads += 1; return j({ id: `m${uploads}`, publicId: `pl/p${uploads}`, url: `https://res.cloudinary.com/x/image/upload/p${uploads}.png`, thumbUrl: `https://res.cloudinary.com/x/image/upload/p${uploads}.png`, width: 600, height: 600 }, 201); }
    if (p === '/admin/categories') return j([{ _id: 'c1', name: 'Shoes', slug: 'shoes', isActive: true }], 200, { meta: { page: 1, limit: 100, total: 1, totalPages: 1 } });
    if (p === '/admin/products/summary') return j({ total: 0, active: 0, draft: 0, inactive: 0, lowStockProducts: 0, lowStockSkus: 0, outOfStockProducts: 0, outOfStockSkus: 0 });
    if (p === '/admin/products' && m === 'POST') { created = JSON.parse(req.postData()); return j({ _id: 'p1', status: 'draft', slug: 'x', ...created }, 201); }
    if (p === '/admin/products') return j([], 200, { meta: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    return j([]);
  });
  await page.goto(BASE + '/products', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Add Product/ }).first().click();
  await page.getByPlaceholder('Garment name...').fill('Court Sneaker');
  await page.getByRole('button', { name: /Next Step/ }).click();
  await page.locator('select option[value="c1"]').first().waitFor({ state: 'attached' });
  await page.getByRole('dialog').locator('select:not([data-testid="audience-select"])').selectOption('c1');
  await page.getByRole('button', { name: /Next Step/ }).click();
  const dlg = page.getByRole('dialog');
  check('Images step is titled for ONE main image', await dlg.getByText(/Main product image/i).isVisible());
  const input = dlg.locator('input[type=file]').first();
  check('file input is single-select', (await input.getAttribute('multiple')) === null);

  const pickCropOriginal = async () => { const o = page.getByRole('button', { name: 'Upload', exact: true }); await o.waitFor({ timeout: 5000 }).catch(() => {}); if (await o.count()) await o.click(); };
  // the browser refuses 2 files for this input; force `multiple` to prove the component also guards against it
  await input.evaluate((el) => { el.multiple = true; });
  await input.setInputFiles([IMG('portrait'), IMG('landscape')]);
  await pickCropOriginal(); await page.waitForTimeout(700);
  check('two files chosen => exactly one uploaded', uploads === 1, `uploads=${uploads}`);
  check('extra files are reported as ignored', await dlg.getByText(/Only one image is allowed/i).isVisible());
  check('one preview shown, labelled Main image', (await dlg.getByText('Main image', { exact: true }).count()) === 1);
  const fit = await dlg.locator('img[src*="cloudinary"]').first().evaluate((im) => getComputedStyle(im).objectFit);
  check('preview is not distorted (object-fit contain)', fit === 'contain', fit);

  // replace
  await input.setInputFiles(IMG('square')); await pickCropOriginal(); await page.waitForTimeout(700);
  check('replace uploads the new file and still shows ONE image', uploads === 2 && (await dlg.locator('img[src*="cloudinary"]').count()) === 1);
  check('replacement is the new image (p2)', (await dlg.locator('img[src*="p2.png"]').count()) === 1);

  // remove
  await dlg.getByRole('button', { name: /Remove image/ }).click(); await page.waitForTimeout(200);
  check('remove clears the preview', (await dlg.locator('img[src*="cloudinary"]').count()) === 0);

  // add again, save draft -> POST has exactly one image
  await input.setInputFiles(IMG('portrait')); await pickCropOriginal(); await page.waitForTimeout(700);
  await dlg.getByRole('button', { name: /Save draft/ }).click(); await page.waitForTimeout(800);
  check('create payload carries exactly 1 image', created && created.generalImages.length === 1, JSON.stringify(created && created.generalImages));
  await b.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
