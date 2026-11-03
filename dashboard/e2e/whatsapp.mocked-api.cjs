// WhatsApp panel on the existing Notifications page (mocked API). Run: npm run build && npx vite preview --port 3996 --strictPort, then node e2e/whatsapp.mocked-api.cjs
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = 'http://localhost:3996';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const msgs = [
    { _id: 'm1', event: 'customer_order_shipped', recipientType: 'customer', recipientName: 'Ali', phone: '+923001234567', reference: 'PH-000007', provider: 'mock', simulated: true, status: 'sent', attempts: 1, maxAttempts: 3, body: 'Your order PH-000007 has shipped. Rider: Bilal', createdAt: new Date().toISOString() },
    { _id: 'm2', event: 'admin_low_stock', recipientType: 'admin', recipientName: 'Owner', phone: '+923009999999', reference: 'SKU-1', provider: 'mock', simulated: true, status: 'failed', attempts: 1, maxAttempts: 3, error: { code: 'MOCK_TEMPORARY_FAILURE', message: 'Simulated', retryable: true }, body: 'Low stock', createdAt: new Date().toISOString() },
  ];
  const calls = { list: [], retry: 0, test: null };
  await page.route(/https:\/\/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**/api/v1/**', async (r) => {
    const req = r.request(); const p = new URL(req.url()).pathname.replace('/api/v1', ''); const m = req.method();
    const j = (d, s = 200, x = {}) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify({ success: s < 400, message: 'ok', data: d, ...x }) });
    if (p === '/auth/me') return j({ user: { _id: 'u1', name: 'Owner', role: 'admin', permissions: ['*'] } });
    if (p === '/admin/notifications/whatsapp/config') return j({ provider: 'mock', simulated: true, enabled: true, maxAttempts: 3, events: ['admin_low_stock', 'customer_order_shipped'], statuses: [] });
    if (p === '/admin/notifications/whatsapp/m2/retry' && m === 'POST') { calls.retry++; msgs[1] = { ...msgs[1], status: 'sent', error: undefined, attempts: 2 }; return j(msgs[1]); }
    if (p === '/admin/notifications/whatsapp/test' && m === 'POST') { calls.test = JSON.parse(req.postData()); return j({ _id: 'm3', status: 'failed', simulated: true }); }
    if (p === '/admin/notifications/whatsapp') { const q = new URL(req.url()).searchParams; calls.list.push(q.toString()); const items = q.get('status') ? msgs.filter((x) => x.status === q.get('status')) : msgs; return j({ items, meta: { page: 1, limit: 20, total: items.length, pages: 1 }, config: { provider: 'mock', simulated: true, enabled: true, events: ['admin_low_stock', 'customer_order_shipped'] } }); }
    return j([], 200, { meta: { page: 1, limit: 20, total: 0, totalPages: 1 } });
  });
  await page.goto(BASE + '/notifications', { waitUntil: 'networkidle' });
  await page.getByTestId('section-whatsapp').click();
  await page.getByTestId('whatsapp-table').waitFor();
  check('mock banner says no real message is sent', /no real WhatsApp message is sent/i.test(await page.getByTestId('whatsapp-mode').innerText()));
  check('mock sent shows "Sent (simulated)"', (await page.getByText('Sent (simulated)').count()) >= 1);
  check('no row claims Delivered', (await page.getByTestId('whatsapp-table').getByText(/^Delivered$/).count()) === 0);
  check('retry only on the failed row', (await page.getByRole('button', { name: /Retry/ }).count()) === 1);
  await page.getByRole('button', { name: 'Show message' }).nth(1).click();
  check('error details visible when expanded', await page.getByText('MOCK_TEMPORARY_FAILURE').isVisible());
  await page.getByLabel('Filter by status').selectOption('failed'); await page.waitForTimeout(500);
  check('status filter is sent to the API', calls.list.some((q) => q.includes('status=failed')));
  await page.getByLabel('Filter by status').selectOption('all'); await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Retry/ }).click(); await page.waitForTimeout(600);
  check('retry POSTs once and the retry button disappears', calls.retry === 1 && (await page.getByRole('button', { name: /Retry/ }).count()) === 0);
  await page.getByLabel('Test phone number').fill('0300 1234567');
  await page.getByLabel('Simulated outcome').selectOption('failure');
  await page.getByRole('button', { name: /Send test/ }).click(); await page.waitForTimeout(500);
  check('test sends phone + simulated outcome', calls.test && calls.test.simulate === 'failure' && calls.test.to === '0300 1234567', JSON.stringify(calls.test));
  await page.getByTestId('section-inapp').click();
  check('in-app alerts still reachable', await page.getByText('All Alerts').isVisible());
  check('no page errors', errors.length === 0, errors.join('|'));
  await b.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
