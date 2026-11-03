/* Admin: marking an order Shipped from the order drawer, against a stateful mock that applies the SAME rules as the backend
 * (deliveryPolicy.assessShipment): Karachi -> rider name + phone; elsewhere -> courier + waybill. */
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3997';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
const owner = { id: 'u1', name: 'Owner', email: 'owner@pehanly.pk', phone: '03001234567', role: 'admin', permissions: [] };
const id = (n) => String(n).padStart(24, '0');
const mkOrder = (n, city, province) => ({ _id: id(n), orderNumber: `PL-${n}`, orderType: 'retail', orderStatus: 'processing', paymentStatus: 'paid', paymentMethod: 'cod', currency: 'PKR', placedAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z', createdAt: '2026-10-20T10:00:00Z',
  customer: { name: 'Ayesha', email: 'a@x.pk', phone: '03001234567' }, shippingAddress: { fullName: 'Ayesha Khan', addressLine1: '1 Main Rd', city, province, country: 'Pakistan', phone: '03001234567', postalCode: '74000' },
  items: [{ _id: id(900 + n), productName: 'Tee', colorName: 'Black', size: 'M', quantity: 1, unitPrice: 2800, lineTotal: 2800 }], pricing: { subtotal: 2800, shipping: 200, discount: 0, total: 3000 }, statusHistory: [{ status: 'processing', changedAt: '2026-10-20T10:00:00Z' }], shipment: undefined });
const RIDER_PHONE = /^[+0-9][0-9 ()-]{6,19}$/;
const isKarachi = (a) => /^karachi( |$)/i.test((a.city || '').trim()) && (!a.province || /^sind(h)?$/i.test(a.province.trim()));
function assess(order) {
  const sh = order.shipment || {}; const khi = isKarachi(order.shippingAddress); const method = sh.deliveryMethod || (khi ? 'local_rider' : 'courier'); const missing = [];
  if (method === 'local_rider' && !khi) return { code: 'LOCAL_RIDER_KARACHI_ONLY', missing };
  if (method === 'local_rider') { if (!(sh.riderName || '').trim()) missing.push('rider name'); if (!RIDER_PHONE.test((sh.riderPhone || '').trim())) missing.push('rider phone number'); }
  else { if (!(sh.courierName || '').trim()) missing.push('logistics partner'); if (!(sh.trackingNumber || '').trim()) missing.push('tracking waybill / consignment number'); }
  return { method, missing };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const orders = { [id(1)]: mkOrder(1, 'Karachi', 'Sindh'), [id(2)]: mkOrder(2, 'Lahore', 'Punjab'), [id(3)]: mkOrder(3, 'Karachi', 'Sindh') };
  const calls = { shipment: [], status: [] };
  await page.route(/https:\/\/fonts\./, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/api/v1/**', async (r) => {
    const req = r.request(); const u = new URL(req.url()); const p = u.pathname.replace('/api/v1', ''); const m = req.method();
    const j = (d, status = 200, extra = {}) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status < 400, message: 'ok', data: d, ...extra }) });
    const err = (status, message, code) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false, message, code }) });
    if (p === '/auth/me') return j({ user: owner });
    if (p === '/admin/orders/summary') return j({ total: 3, pending: 0, confirmed: 0, processing: 3, shipped: 0, delivered: 0, cancelled: 0 });
    if (p === '/admin/orders' && m === 'GET') return j(Object.values(orders), 200, { meta: { page: 1, limit: 20, total: 3, totalPages: 1 } });
    if (p === '/admin/cancellations') return j([], 200, { meta: { page: 1, limit: 20, total: 0, totalPages: 1 } });
    let mm;
    if ((mm = p.match(/^\/admin\/orders\/(\w+)$/)) && m === 'GET') return orders[mm[1]] ? j(orders[mm[1]]) : err(404, 'Order not found', 'ORDER_NOT_FOUND');
    if ((mm = p.match(/^\/admin\/orders\/(\w+)\/shipment$/)) && m === 'PATCH') {
      const o = orders[mm[1]]; const body = JSON.parse(req.postData() || '{}'); calls.shipment.push(body);
      if (body.riderPhone && !RIDER_PHONE.test(body.riderPhone)) return err(422, 'Enter a valid rider phone number', 'VALIDATION_ERROR');
      const merged = { ...(o.shipment || {}), ...body }; o.shipment = merged;
      const a = assess(o); if (a.code) return err(400, 'Local rider delivery is only available for Karachi orders. Use a courier shipment.', a.code);
      o.shipment.deliveryMethod = a.method;
      if (a.method === 'local_rider') { delete o.shipment.courierName; delete o.shipment.trackingNumber; delete o.shipment.trackingUrl; } else { delete o.shipment.riderName; delete o.shipment.riderPhone; }
      o.updatedAt = new Date().toISOString(); return j(o);
    }
    if ((mm = p.match(/^\/admin\/orders\/(\w+)\/status$/)) && m === 'PATCH') {
      const o = orders[mm[1]]; const body = JSON.parse(req.postData() || '{}'); calls.status.push(body);
      await new Promise((res) => setTimeout(res, 300));
      if (body.status === 'shipped') {
        const a = assess(o);
        if (a.code) return err(409, 'Local rider delivery is only available for Karachi orders. Use a courier shipment.', a.code);
        if (a.missing.length) return err(409, `Add ${a.missing.join(' and ')} before marking the order as shipped`, 'SHIPMENT_REQUIRED');
        o.shipment = { ...(o.shipment || {}), deliveryMethod: a.method, shippedAt: new Date().toISOString() };
      }
      o.orderStatus = body.status; o.updatedAt = new Date().toISOString(); o.statusHistory.push({ status: body.status, changedAt: o.updatedAt });
      return j(o);
    }
    return j([], 200, { meta: { page: 1, limit: 20, total: 0, totalPages: 1 } });
  });
  const open = async (n) => { await page.goto(`${BASE}/orders/${id(n)}`, { waitUntil: 'networkidle' }); await page.getByText('Delivery & Tracking').waitFor(); };
  const field = (label) => page.locator(`xpath=//label[starts-with(normalize-space(.), "${label}")]/ancestor::div[contains(@class,"flex-col")][1]//input`).first();
  const apply = () => page.getByRole('button', { name: /^Apply$/ }).click();
  const toasts = async () => (await page.locator('[role=status], [role=alert], [class*=toast]').allInnerTexts()).join(' | ');

  // 1. Karachi: rider details typed, then ONE click on Apply (Shipped)
  await open(1);
  await field('Rider Name').fill('Muhammad Junaid');
  await field('Rider Phone').fill('0300 1234567');
  await apply(); await page.waitForTimeout(1500);
  check('1. Karachi: typed rider details + Apply -> order is Shipped', orders[id(1)].orderStatus === 'shipped', `status=${orders[id(1)].orderStatus} ui="${(await toasts()).slice(0, 160)}"`);
  check('1b. rider details were saved before the status change', calls.shipment.length >= 1 && calls.shipment[0].riderName === 'Muhammad Junaid' && calls.shipment[0].riderPhone === '0300 1234567');
  check('1c. no courier waybill/tracking was demanded or sent for Karachi', calls.shipment.every((b) => !b.courierName && !b.trackingNumber && !b.trackingUrl));
  await page.reload({ waitUntil: 'networkidle' }); await page.getByText('Delivery & Tracking').waitFor();
  check('3. after reload the saved rider details are still shown', (await field('Rider Name').inputValue()) === 'Muhammad Junaid' && (await field('Rider Phone').inputValue()) === '0300 1234567');

  // 2. Karachi without rider details
  calls.shipment.length = 0; calls.status.length = 0;
  await open(3);
  await apply(); await page.waitForTimeout(1000);
  const msg2 = await page.locator('body').innerText();
  check('2. missing rider details -> clear validation error, order NOT shipped', orders[id(3)].orderStatus === 'processing' && /rider name/i.test(msg2) && /rider phone/i.test(msg2));
  // only phone missing
  await field('Rider Name').fill('Bilal');
  await apply(); await page.waitForTimeout(900);
  check('2b. only the missing field (phone) is reported', orders[id(3)].orderStatus === 'processing' && /rider phone/i.test(await page.locator('body').innerText()));
  // invalid phone
  await field('Rider Phone').fill('call me');
  await apply(); await page.waitForTimeout(900);
  check('2c. an invalid phone number is rejected', orders[id(3)].orderStatus === 'processing');

  // 5. repeated submissions
  calls.shipment.length = 0; calls.status.length = 0;
  await field('Rider Phone').fill('03211234567');
  const btn = page.getByRole('button', { name: /^Apply$/ });
  await btn.dblclick(); await page.waitForTimeout(100); await btn.click({ force: true, timeout: 500 }).catch(() => {}); await page.waitForTimeout(1800);
  const shippedCalls = calls.status.filter((b) => b.status === 'shipped').length;
  check('5. rapid repeated clicks send exactly one shipment save and one Shipped transition', orders[id(3)].orderStatus === 'shipped' && shippedCalls === 1 && calls.shipment.length === 1, `shipped calls=${shippedCalls}, shipment calls=${calls.shipment.length}, all status calls=${JSON.stringify(calls.status.map((b) => b.status))}`);

  // 4. outside Karachi still needs courier + waybill
  calls.shipment.length = 0; calls.status.length = 0;
  await open(2);
  await apply(); await page.waitForTimeout(900);
  const msg4 = await page.locator('body').innerText();
  check('4. Lahore without courier details -> courier requirements reported, not shipped', orders[id(2)].orderStatus === 'processing' && /(logistics partner|courier)/i.test(msg4) && /(waybill|tracking)/i.test(msg4) && !/rider name/i.test(msg4.replace(/Rider/g, 'x')));
  await field('Logistics Partner').fill('TCS');
  await field('Tracking Waybill').fill('CN123456');
  await apply(); await page.waitForTimeout(1500);
  check('4b. Lahore with courier + waybill ships (tracking URL stays optional)', orders[id(2)].orderStatus === 'shipped' && orders[id(2)].shipment.courierName === 'TCS');

  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
