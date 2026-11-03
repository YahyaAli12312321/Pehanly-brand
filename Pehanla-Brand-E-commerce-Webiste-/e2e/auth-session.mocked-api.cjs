/* Customer sign-in / session restoration against a mocked API that behaves like the real cookie session:
 * a login sets a (simulated) HttpOnly cookie, /auth/me and every protected route answer 401 without it. */
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3998';
const results = []; const check = (n, ok, x = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); };
const user = { _id: 'u1', id: 'u1', name: 'Ayesha Khan', email: 'a@x.pk', phone: '03001234567', role: 'customer' };

async function scenario(name, { meDelayMs = 0, cookieStores = true, meFirstFails = 0 }, body) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const state = { cookie: false, meCalls: 0, calls: [] };
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '.material-symbols-outlined{display:inline-block;width:1em;overflow:hidden;white-space:nowrap;vertical-align:middle;font-style:normal}'; document.head.appendChild(st); }); });
  await page.route(/https:\/\/(img\.test|fonts\.|lh3\.)/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route('**/api/v1/**', async (r) => {
    const u = new URL(r.request().url()); const p = u.pathname.replace('/api/v1', ''); const m = r.request().method();
    state.calls.push(`${m} ${p}`);
    const j = (d, extra = {}, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status < 400, message: 'ok', data: d, ...extra }) });
    const err = (status, message, code) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false, message, code }) });
    if (p === '/auth/me') {
      state.meCalls++;
      if (meDelayMs && state.meCalls === 1) await new Promise((res) => setTimeout(res, meDelayMs));
      if (state.meCalls <= meFirstFails) return err(503, 'Service unavailable', 'HTTP_503');
      return state.cookie ? j({ user }) : err(401, 'Authentication required', 'UNAUTHORIZED');
    }
    if (p === '/auth/login') {
      const b = JSON.parse(r.request().postData() || '{}');
      if (b.password !== 'correct-password') return err(401, 'Invalid email/phone or password', 'INVALID_CREDENTIALS');
      if (cookieStores) state.cookie = true;
      return j({ user });
    }
    if (p === '/auth/logout') { state.cookie = false; return j({}); }
    if (['/account', '/account/addresses', '/orders/my'].includes(p) || p.startsWith('/account') || p.startsWith('/orders/my')) {
      if (!state.cookie) return err(401, 'Authentication required', 'UNAUTHORIZED');
      if (p === '/account') return j({ user });
      return j([], { meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
    }
    if (p === '/settings/public') return j({});
    return j([], { meta: { page: 1, limit: 12, total: 0, totalPages: 1 } });
  });
  console.log(`\n--- ${name}`);
  try { await body(page, state, ctx); } catch (e) { check(`${name}: no exception`, false, e.message.split('\n')[0]); }
  await browser.close();
}
const login = async (page, pw = 'correct-password') => {
  await page.getByLabel('Email or phone').fill('a@x.pk');
  await page.getByLabel('Password', { exact: true }).fill(pw);
  await page.getByRole('button', { name: /^Sign in$/i }).click();
};
const onAccountDashboard = (page) => page.getByText(/Ayesha/).first().isVisible().catch(() => false);

(async () => {
  await scenario('A. normal login, cookie stored', {}, async (page, st, ctx) => {
    await page.goto(`${BASE}/account`); await page.getByLabel('Email or phone').waitFor();
    await login(page); await page.waitForTimeout(1500);
    check('A1 reaches account dashboard and stays', await onAccountDashboard(page));
    check('A2 /auth/me authenticated', st.cookie);
    await page.reload(); await page.waitForTimeout(1200);
    check('A3 refresh keeps the session', await onAccountDashboard(page));
    const p2 = await ctx.newPage(); await p2.goto(`${BASE}/account`); await p2.waitForTimeout(1200);
    check('A4 second tab restores the session', await p2.getByText(/Ayesha/).first().isVisible().catch(() => false));
  });
  await scenario('B. invalid credentials', {}, async (page) => {
    await page.goto(`${BASE}/account`); await page.getByLabel('Email or phone').waitFor();
    await login(page, 'wrong'); await page.waitForTimeout(800);
    check('B1 error shown and still on sign-in', (await page.getByText(/Invalid email\/phone or password/).count()) > 0);
  });
  await scenario('C. slow initial /auth/me (cold start) answers 401 AFTER the user signed in', { meDelayMs: 4000 }, async (page) => {
    await page.goto(`${BASE}/account`); await page.getByLabel('Email or phone').waitFor({ timeout: 8000 }).catch(() => {});
    // the form is only usable once the bootstrap finished loading in some builds; wait for it
    await page.getByLabel('Email or phone').waitFor();
    await login(page); await page.waitForTimeout(6000);
    check('C1 the late 401 from the initial restore does not sign the customer out', await onAccountDashboard(page));
  });
  await scenario('D. login 200 but the browser did not keep the cookie', { cookieStores: false }, async (page) => {
    await page.goto(`${BASE}/account`); await page.getByLabel('Email or phone').waitFor();
    await login(page); await page.waitForTimeout(2000);
    const msg = await page.locator('[role=alert]').allInnerTexts();
    check('D1 customer sees a clear explanation instead of a silent bounce', msg.some((t) => /cookie|session|browser/i.test(t)), JSON.stringify(msg));
    check('D2 not shown as signed in', !(await onAccountDashboard(page)));
  });
  await scenario('E. /auth/me fails twice with 503 (backend waking up), session cookie is valid', { meFirstFails: 2 }, async (page, st) => {
    st.cookie = true;
    await page.goto(`${BASE}/account`); await page.waitForTimeout(9000);
    check('E1 session is restored after transient failures (no false sign-out)', await onAccountDashboard(page), `meCalls=${st.meCalls}`);
  });
  await scenario('F. logout clears the session', {}, async (page, st) => {
    await page.goto(`${BASE}/account`); await page.getByLabel('Email or phone').waitFor();
    await login(page); await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /sign out|log out/i }).first().click(); await page.waitForTimeout(1200);
    check('F1 back to sign-in and cookie cleared', !st.cookie && (await page.getByLabel('Email or phone').count()) > 0);
    await page.goto(`${BASE}/account`); await page.waitForTimeout(800);
    check('F2 protected page requires sign-in again', (await page.getByLabel('Email or phone').count()) > 0);
  });
  await scenario('G. return to the originally requested page', {}, async (page) => {
    await page.goto(`${BASE}/account?next=%2Fwishlist`); await page.getByLabel('Email or phone').waitFor();
    await login(page); await page.waitForURL('**/wishlist', { timeout: 5000 }).catch(() => {});
    check('G1 lands on /wishlist after signing in', new URL(page.url()).pathname === '/wishlist', page.url());
  });
  await scenario('H. a hostile ?next= is ignored', {}, async (page) => {
    await page.goto(`${BASE}/account?next=https%3A%2F%2Fevil.example%2Fx`); await page.getByLabel('Email or phone').waitFor();
    await login(page); await page.waitForTimeout(1500);
    check('H1 stays on this site, on the account dashboard', new URL(page.url()).origin === BASE && await onAccountDashboard(page), page.url());
  });
  process.exit(results.every(Boolean) ? 0 : 1);
})();
