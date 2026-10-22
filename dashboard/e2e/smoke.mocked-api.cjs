const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const BASE = 'http://localhost:3997';
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-claude/6f156639-d479-5c2a-ac32-7624dfedcb70/scratchpad/shots';
const results = []; const ok = (n, c, d = '') => { results.push([n, !!c, d]); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };

const owner = { id: 'u1', name: 'Owner', email: 'owner@pehanly.pk', phone: '03001234567', role: 'admin', permissions: [] };
const customer = { id: 'u2', name: 'Cust', email: 'c@x.pk', role: 'customer' };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  let adminTaken = false; let registerBody = null; let registerCalls = 0; let logoutCalls = 0;
  let errs = []; let loginBody = null; let session = null; let meCalls = 0; let resetBody = null; let forgotBody = null; let forceExpire = false; let expireAdmin = false;
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|401|422|400/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  await page.route(/https:\/\/fonts\./, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/api/v1/**', async (r) => {
    const req = r.request(); const u = new URL(req.url()); const p = u.pathname.replace('/api/v1', ''); const m = req.method();
    const j = (d, status = 200, extra = {}) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status < 400, message: 'ok', data: d, ...extra }) });
    const err = (status, message, code, errors) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: false, message, code, errors }) });
    if (p === '/auth/me') { meCalls++; return session && !forceExpire ? j({ user: session }) : err(401, 'Authentication required', 'UNAUTHORIZED'); }
    if (p === '/auth/login') {
      loginBody = JSON.parse(req.postData());
      if (loginBody.password === 'wrong') return err(401, 'Invalid email/phone or password', 'INVALID_CREDENTIALS');
      if (loginBody.identifier === 'c@x.pk') { session = customer; return j({ user: customer }); }
      session = owner; return j({ user: owner });
    }
    if (p === '/auth/register') {
      registerCalls++; registerBody = JSON.parse(req.postData());
      await new Promise((res) => setTimeout(res, 500));
      if (!['admin', 'customer'].includes(registerBody.role)) return err(422, 'Validation failed', 'VALIDATION_ERROR', [{ path: ['role'], message: 'Unsupported role' }]);
      if (registerBody.email === 'taken@x.pk' || adminTaken) return err(409, 'An admin account already exists. Additional admin registration is not allowed.', 'ADMIN_ALREADY_EXISTS');
      if (registerBody.email === 'dup@x.pk') return err(409, 'An account with this email already exists', 'ACCOUNT_EXISTS');
      if (registerBody.phone === '03111111111') return err(409, 'An account with this phone number already exists', 'ACCOUNT_EXISTS');
      if (registerBody.phone === '0300badbad') return err(422, 'Validation failed', 'VALIDATION_ERROR', [{ path: ['phone'], message: 'Enter a valid phone number' }]);
      adminTaken = true;
      session = { id: 'u9', name: registerBody.name, email: registerBody.email, role: registerBody.role, permissions: [] };
      return j({ user: session }, 201);
    }
    if (p === '/auth/logout') { logoutCalls++; session = null; return j({}); }
    if (p === '/auth/forgot-password') { forgotBody = JSON.parse(req.postData()); return j({}); }
    if (p === '/auth/reset-password') {
      resetBody = JSON.parse(req.postData());
      if (resetBody.token === 'e'.repeat(40)) return err(400, 'This reset link is invalid or has expired', 'INVALID_RESET_TOKEN');
      return j({});
    }
    if (p.startsWith('/admin') && expireAdmin) { session = null; return err(401, 'Authentication required', 'UNAUTHORIZED'); }
    return j([], 200, { meta: { page: 1, limit: 20, total: 0, totalPages: 1 } });
  });
  const open = async (path) => { errs = []; await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(200); };
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // ---- 1. Layout at three breakpoints (screenshots + overflow + content checks)
  await open('/login');
  ok('login: heading + CTA copy', await page.getByRole('heading', { name: 'Welcome back' }).isVisible() && await page.getByRole('button', { name: /Sign In/ }).isVisible());
  ok('login: brand copy present (desktop)', await page.getByText('Crafting Pakistani Apparel with Industrial Precision.').isVisible() && await page.getByText('OMNICHANNEL RETAIL').isVisible() && await page.getByText('B2B MANUFACTURING').isVisible() && await page.getByText('Restricted Portal. Authorized PEHAN LY Staff Only.').isVisible());
  const body = await page.locator('body').innerText();
  ok('login: NO fake status (version/TLS/IP/Systems Normal)', !/v2\.\d|TLS|IP LOGGED|Systems Normal|Operations OS/i.test(body), 'checked body text');
  ok('login: Remember me checked by default', await page.getByLabel('Remember me').isChecked());
  ok('login: inputs labelled', await page.getByLabel('Email or Phone').isVisible() && await page.getByLabel('Password', { exact: true }).isVisible());
  await page.screenshot({ path: `${SHOTS}/admin-login-desktop.png` });
  ok('desktop: no horizontal overflow', (await overflow()) <= 0);
  const split = await page.evaluate(() => { const a = document.querySelector('aside').getBoundingClientRect(); const m = document.querySelector('main').getBoundingClientRect(); return { aLeft: a.left, aW: a.width, mLeft: m.left }; });
  ok('desktop: brand panel LEFT, form RIGHT', split.aLeft === 0 && split.mLeft >= split.aW - 1, JSON.stringify(split));

  await page.setViewportSize({ width: 820, height: 1180 }); await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/admin-login-tablet.png` });
  ok('tablet: no horizontal overflow', (await overflow()) <= 0);
  ok('tablet: reduced brand panel (heading yes, feature cards no)', await page.getByText('Crafting Pakistani Apparel').isVisible() && !(await page.getByText('OMNICHANNEL RETAIL').isVisible()));
  ok('tablet: form visible', await page.getByRole('button', { name: /Sign In/ }).isVisible());

  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/admin-login-mobile.png` });
  ok('mobile: no horizontal overflow', (await overflow()) <= 0);
  ok('mobile: compact branding, form first in view', !(await page.getByText('Crafting Pakistani Apparel').isVisible()) && await page.getByRole('button', { name: /Sign In/ }).isVisible());
  const targets = await page.evaluate(() => [...document.querySelectorAll('button, input[type=text], input[type=password], a[href]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ t: e.tagName + (e.getAttribute('aria-label') || e.textContent || '').slice(0, 20), h: Math.round(e.getBoundingClientRect().height) })));
  const small = targets.filter((t) => t.h < 36 && !/Forgot/.test(t.t));
  ok('mobile: touch targets >= 36px (Forgot link inline text excluded)', small.length === 0, JSON.stringify(small));

  // ---- 2. Show/hide + keyboard
  await page.setViewportSize({ width: 1440, height: 900 });
  await open('/login');
  const pw = page.getByLabel('Password', { exact: true });
  ok('password hidden by default', (await pw.getAttribute('type')) === 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  ok('show password toggles type + aria-pressed', (await pw.getAttribute('type')) === 'text' && (await page.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')) === 'true');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await page.getByLabel('Email or Phone').focus();
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); // forgot link, then password
  const focusId = await page.evaluate(() => document.activeElement.id || document.activeElement.textContent);
  ok('keyboard Tab order reaches password field', /login-password/.test(focusId), focusId);

  // ---- 3. Validation
  await page.getByRole('button', { name: /Sign In/ }).click();
  ok('empty submit shows visible validation + no request', (await page.getByText('Enter your email or phone').isVisible()) && (await page.getByText('Enter your password').isVisible()) && loginBody === null);

  // ---- 4. Invalid credentials
  await page.getByLabel('Email or Phone').fill('owner@pehanly.pk');
  await pw.fill('wrong');
  await page.getByRole('button', { name: /Sign In/ }).click();
  await page.getByRole('alert').waitFor();
  ok('invalid credentials -> backend message shown, stays on /login', /Invalid email\/phone or password/.test(await page.getByRole('alert').innerText()) && page.url().endsWith('/login'));

  // ---- 5. Customer account must not get a dashboard session
  await page.getByLabel('Email or Phone').fill('c@x.pk'); await pw.fill('rightpass1');
  await page.getByRole('button', { name: /Sign In/ }).click();
  await page.getByText("This account doesn't have dashboard access.").waitFor();
  ok('customer account refused + logged out', session === null);

  // ---- 6. Successful login (email) + rememberMe payload + redirect, no storage of auth
  loginBody = null;
  await page.getByLabel('Email or Phone').fill('owner@pehanly.pk'); await pw.fill('rightpass1');
  await page.getByRole('button', { name: /Sign In/ }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 5000 }).catch(() => {});
  ok('login success redirects to dashboard', new URL(page.url()).pathname === '/');
  ok('login payload = identifier/password/rememberMe(true), no token fields', loginBody && loginBody.identifier === 'owner@pehanly.pk' && loginBody.rememberMe === true && Object.keys(loginBody).sort().join() === 'identifier,password,rememberMe', JSON.stringify({ ...loginBody, password: '***' }));
  const store = await page.evaluate(() => ({ ls: JSON.stringify({ ...localStorage }), ss: JSON.stringify({ ...sessionStorage }), cookie: document.cookie }));
  ok('NO token/session in localStorage, sessionStorage or JS-readable cookies', !/token|bearer|jwt|pl_session|pehanly.*user|password/i.test(store.ls + store.ss + store.cookie), JSON.stringify(store));
  errs = []; // the mocked dashboard payload is not the real shape; only login behaviour is under test here
  await page.goto(BASE + '/orders', { waitUntil: 'networkidle' });
  ok('signed-in owner sees the admin shell (sidebar), not the login form', (await page.getByRole('heading', { name: 'Welcome back' }).count()) === 0 && (await page.locator('aside').count()) > 0);

  // ---- 7. Phone login + rememberMe unchecked
  await page.evaluate(() => fetch('/api/v1/auth/logout', { method: 'POST' })); session = null;
  await open('/login');
  await page.getByLabel('Remember me').uncheck();
  await page.getByLabel('Email or Phone').fill('03001234567'); await page.getByLabel('Password', { exact: true }).fill('rightpass1');
  await page.getByRole('button', { name: /Sign In/ }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 5000 }).catch(() => {});
  ok('phone identifier accepted; rememberMe:false sent when unchecked', loginBody.identifier === '03001234567' && loginBody.rememberMe === false);

  // ---- 8. Protected route when signed out + redirect back
  session = null; forceExpire = false;
  await page.evaluate(() => fetch('/api/v1/auth/logout', { method: 'POST' }));
  await open('/orders');
  ok('protected route redirects signed-out user to /login', new URL(page.url()).pathname === '/login');
  loginBody = null;
  await page.getByLabel('Email or Phone').fill('owner@pehanly.pk'); await page.getByLabel('Password', { exact: true }).fill('rightpass1');
  await page.getByRole('button', { name: /Sign In/ }).click();
  await page.waitForURL((u) => u.pathname === '/orders', { timeout: 5000 }).catch(() => {});
  ok('after login returns to the originally requested route', new URL(page.url()).pathname === '/orders', page.url());

  // ---- 9. Session expiry: signed-in, then API says 401
  forceExpire = true;
  await page.goto(BASE + '/orders', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(300);
  ok('expired session (me=401) lands on /login', new URL(page.url()).pathname === '/login');

  // mid-session expiry shows the notice
  forceExpire = false; session = owner;
  await open('/orders');
  await page.waitForTimeout(200);
  expireAdmin = true; // next admin data request 401s while the app still holds the user
  await page.getByRole('link', { name: /customers/i }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const expiredNote = await page.getByText('Your session has expired. Please sign in again.').count();
  ok('mid-session 401 -> back at login with session-expired notice', new URL(page.url()).pathname === '/login' && expiredNote >= 1, page.url() + ' notice=' + expiredNote);
  forceExpire = false; expireAdmin = false; session = null;

  // ---- 10. Forgot password
  await open('/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  ok('forgot link navigates', new URL(page.url()).pathname === '/forgot-password');
  await page.screenshot({ path: `${SHOTS}/admin-forgot-desktop.png` });
  await page.getByRole('button', { name: /Send Reset Instructions/ }).click();
  ok('forgot: invalid/empty email validated', await page.getByText('Enter your email').isVisible() && forgotBody === null);
  await page.getByLabel('Email', { exact: true }).fill('owner@pehanly.pk');
  await page.getByRole('button', { name: /Send Reset Instructions/ }).click();
  await page.getByText(/If an account exists/).waitFor();
  ok('forgot: sends identifier to existing endpoint, generic non-enumerating confirmation', forgotBody.identifier === 'owner@pehanly.pk' && /If an account exists/.test(await page.locator('main').innerText()));
  ok('forgot: Back to Sign In available', await page.getByRole('link', { name: /Back to Sign In/ }).isVisible());

  // ---- 11. Reset password
  await open('/reset-password?token=' + 'a'.repeat(40));
  ok('reset: token stripped from URL after read', new URL(page.url()).search === '', page.url());
  await page.screenshot({ path: `${SHOTS}/admin-reset-desktop.png` });
  ok('reset: heading + both fields + rules', await page.getByLabel('New Password', { exact: true }).isVisible() && await page.getByLabel('Confirm New Password', { exact: true }).isVisible() && await page.getByText('At least 8 characters').isVisible());
  await page.getByLabel('New Password', { exact: true }).fill('abc');
  await page.getByLabel('Confirm New Password', { exact: true }).fill('abd');
  await page.getByRole('button', { name: /Update Password/ }).click();
  ok('reset: validation blocks short/mismatched and sends nothing', resetBody === null && await page.getByText(/Use at least 8/).isVisible() && await page.getByText('Passwords do not match').isVisible());
  await page.getByLabel('New Password', { exact: true }).fill('a-new-password-1');
  await page.getByLabel('Confirm New Password', { exact: true }).fill('a-new-password-1');
  await page.getByRole('button', { name: /Update Password/ }).click();
  await page.getByText('Password updated').first().waitFor();
  ok('reset: POST {token,password} (token from link) then success state', resetBody.token === 'a'.repeat(40) && resetBody.password === 'a-new-password-1' && Object.keys(resetBody).sort().join() === 'password,token');
  ok('reset success links to Sign In', await page.getByRole('link', { name: /Go to Sign In/ }).isVisible());

  await open('/reset-password?token=' + 'e'.repeat(40));
  await page.getByLabel('New Password', { exact: true }).fill('a-new-password-1'); await page.getByLabel('Confirm New Password', { exact: true }).fill('a-new-password-1');
  await page.getByRole('button', { name: /Update Password/ }).click();
  await page.getByRole('alert').waitFor();
  ok('reset: expired token shows backend message + request-new-link', /invalid or has expired/.test(await page.getByRole('alert').innerText()) && await page.getByRole('link', { name: 'Request a new link' }).isVisible());
  await open('/reset-password');
  ok('reset: missing token explained', await page.getByText('Reset link missing').isVisible());

  await page.setViewportSize({ width: 390, height: 844 });
  await open('/reset-password?token=' + 'a'.repeat(40));
  await page.screenshot({ path: `${SHOTS}/admin-reset-mobile.png` });
  ok('reset mobile: no horizontal overflow', (await overflow()) <= 0);
  await open('/forgot-password');
  ok('forgot mobile: no horizontal overflow', (await overflow()) <= 0);

  // ---- Register (same auth card, real contract)
  await page.setViewportSize({ width: 1440, height: 900 });
  await open('/login');
  const urlBefore = page.url();
  await page.getByRole('button', { name: 'Register' }).click();
  ok('register: same page/URL (no navigation)', page.url() === urlBefore);
  ok('register: card switched in place, brand panel kept', await page.getByRole('heading', { name: 'Create your account' }).isVisible() && await page.getByText('Crafting Pakistani Apparel with Industrial Precision.').isVisible());
  ok('register: fields match backend contract', await page.getByLabel('Full Name').isVisible() && await page.getByLabel('Email Address').isVisible() && await page.getByLabel('Phone Number').isVisible() && await page.getByLabel('Password', { exact: true }).isVisible() && await page.getByLabel('Confirm Password').isVisible());
  ok('register: no role/permission field', (await page.locator('input[name=role], select[name=role], [name=permissions]').count()) === 0);
  await page.screenshot({ path: `${SHOTS}/admin-register-desktop.png` });
  await page.getByRole('button', { name: 'Create Account' }).click();
  ok('register: client validation blocks empty submit', registerCalls === 0 && await page.getByText('Enter your full name').isVisible());
  await page.getByLabel('Full Name').fill('Ayesha Khan'); await page.getByLabel('Email Address').fill('new@x.pk'); await page.getByLabel('Phone Number').fill('03001234567');
  await page.getByLabel('Password', { exact: true }).fill('long-enough-1'); await page.getByLabel('Confirm Password').fill('different-1');
  await page.getByRole('button', { name: 'Create Account' }).click();
  ok('register: password mismatch caught client-side', registerCalls === 0 && await page.getByText('Passwords do not match').isVisible());
  await page.getByLabel('Show password').first().click();
  ok('register: show/hide works', (await page.locator('#reg-password').getAttribute('type')) === 'text');
  await page.getByLabel('Confirm Password').fill('long-enough-1');
  // duplicate email
  await page.getByLabel('Email Address').fill('dup@x.pk');
  await page.getByRole('button', { name: 'Create Account' }).dblclick();
  await page.getByText('An account with this email already exists').waitFor();
  ok('register: double-submit sends ONE request', registerCalls === 1, 'calls=' + registerCalls);
  ok('register: duplicate email mapped to email field', await page.locator('#reg-email-error').isVisible());
  ok('register: safe values kept, password cleared after error', (await page.getByLabel('Full Name').inputValue()) === 'Ayesha Khan' && (await page.locator('#reg-password').inputValue()) === '');
  // duplicate phone
  await page.getByLabel('Email Address').fill('new@x.pk'); await page.getByLabel('Phone Number').fill('03111111111');
  await page.getByLabel('Password', { exact: true }).fill('long-enough-1'); await page.getByLabel('Confirm Password').fill('long-enough-1');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.locator('#reg-phone-error').waitFor();
  ok('register: duplicate phone mapped to phone field', /phone number already exists/.test(await page.locator('#reg-phone-error').innerText()));
  // 422 field error
  await page.getByLabel('Phone Number').fill('0300badbad');
  await page.getByLabel('Password', { exact: true }).fill('long-enough-1'); await page.getByLabel('Confirm Password').fill('long-enough-1');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.getByText('Enter a valid phone number').waitFor();
  ok('register: 422 field error shown on its input', await page.locator('#reg-phone-error').isVisible());
  // second admin refused by the backend (one-admin rule): clear message, no navigation, no session
  await page.getByLabel('Email Address').fill('taken@x.pk'); await page.getByLabel('Phone Number').fill('03001234567');
  await page.getByLabel('Password', { exact: true }).fill('long-enough-1'); await page.getByLabel('Confirm Password').fill('long-enough-1');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.getByText('An admin account already exists. Additional admin registration is not allowed.').waitFor();
  ok('register: 409 admin-exists message shown verbatim, stays on the card', await page.getByRole('heading', { name: 'Create your account' }).isVisible() && /login/.test(page.url()) && session === null);
  ok('register: password cleared after the refused attempt', (await page.locator('#reg-password').inputValue()) === '');
  // success (first admin)
  const logoutsBefore = logoutCalls;
  await page.getByLabel('Email Address').fill('first@x.pk');
  await page.getByLabel('Password', { exact: true }).fill('long-enough-1'); await page.getByLabel('Confirm Password').fill('long-enough-1');
  await page.getByRole('button', { name: /Create Account|Creating/ }).click();
  ok('register: loading state shown + button disabled', await page.getByRole('button', { name: /Creating account/ }).isDisabled());
  await page.waitForURL((u) => !/login/.test(u.pathname));
  ok('register: body is exactly name,email,phone,password,role', Object.keys(registerBody).sort().join() === 'email,name,password,phone,role', JSON.stringify(Object.keys(registerBody)));
  ok('register: role "admin" is sent automatically (no role input in the UI)', registerBody.role === 'admin');
  ok('register: first admin lands in the dashboard with a real session', session && session.role === 'admin' && logoutCalls === logoutsBefore);
  await page.goto(BASE + '/orders', { waitUntil: 'networkidle' });
  ok('register: dashboard stays accessible (session persists)', !/\/login/.test(page.url()));
  ok('register: nothing auth-related in storage', await page.evaluate(() => !/token|jwt|session|bearer|password/i.test(JSON.stringify({ ...localStorage, ...sessionStorage }))));
  await page.evaluate(() => fetch('/api/v1/auth/logout', { method: 'POST' })); session = null;
  await open('/login');
  await page.getByRole('button', { name: 'Register' }).click();
  await page.getByRole('button', { name: 'Sign In' }).click();
  ok('register: toggles back to Login', await page.getByRole('heading', { name: 'Welcome back' }).isVisible() && await page.getByLabel('Email or Phone').isVisible());
  await page.getByLabel('Email or Phone').fill('owner@pehanly.pk'); await page.getByLabel('Password', { exact: true }).fill('secret-pass-1');
  await page.getByRole('button', { name: /^Sign In/ }).click();
  await page.waitForURL((u) => !/login/.test(u.pathname));
  ok('login still works after register changes', true);
  await page.evaluate(() => fetch('/api/v1/auth/logout', { method: 'POST' })); session = null;
  await page.setViewportSize({ width: 390, height: 844 });
  await open('/login');
  await page.getByRole('button', { name: 'Register' }).click();
  await page.screenshot({ path: `${SHOTS}/admin-register-mobile.png`, fullPage: true });
  ok('register mobile: no horizontal overflow, all fields reachable', (await overflow()) <= 0 && await page.getByRole('button', { name: 'Create Account' }).isVisible());
  await page.setViewportSize({ width: 820, height: 1100 });
  ok('register tablet: no horizontal overflow', (await overflow()) <= 0);

  ok('no unexpected JS/console errors', errs.length === 0, errs.join(' | '));
  const failed = results.filter((r) => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  await b.close();
  process.exit(failed.length ? 1 : 0);
})();
