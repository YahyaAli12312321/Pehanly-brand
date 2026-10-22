'use strict';

/*
 * node scripts/generate-postman.js
 *
 * Writes (from the LIVE router + Zod schemas, nothing hand-copied):
 *   postman/PEHANLY.postman_collection.json   Postman v2.1 collection
 *   postman/PEHANLY.local.postman_environment.json
 *   docs/API_REQUESTS.md                      copy-paste method / URL / headers / JSON body
 *
 * Every generated body/query is validated against the real schema; routes whose
 * example does not validate are listed in the Markdown file instead of being hidden.
 */

const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'route-listing-only-route-listing-only-1234';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/generator_main';
process.env.MONGODB_TEST_URI = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/generator_test';
// The generator must not pick up the developer's real Cloudinary/JazzCash settings.
for (const key of Object.keys(process.env)) {
  if (/^(CLOUDINARY_|JAZZCASH_)/.test(key)) delete process.env[key];
}

const { createApp, API_PREFIX } = require('../src/app');
const { collectRoutes, describeAccess, expectedSuccess } = require('./postman/introspect');
const { buildExample, describeFields } = require('./postman/sample');
const { MEDIA_PURPOSE_NAMES } = require('../src/constants/Media');

const ROOT = path.join(__dirname, '..');

/* ------------------------------------------------------------------ folders */

const FOLDERS = [
  ['Authentication & User Accounts', /^\/auth\//],
  ['Customer Account (Self-Service)', /^\/account/],
  ['Customers Management', /^\/admin\/customers/],
  ['Admin Dashboard', /^\/admin\/dashboard/],
  ['Categories', /^\/(admin\/categories|catalog\/categories)/],
  ['Product Variants & SKUs', /^\/admin\/products\/:id\/variants/],
  ['Products', /^\/(admin\/products|catalog\/products)/],
  ['Inventory & Stock', /^\/admin\/inventory/],
  ['Cancellations, Returns & Refunds', /^(\/admin\/(cancellations|returns)|\/returns|\/orders\/my\/:id\/cancellation)/],
  ['Retail Orders & Checkout', /^\/(admin\/)?orders/],
  ['Wholesale', /^\/(admin\/)?wholesale/],
  ['Manufacturing', /^\/(admin\/)?manufacturing/],
  ['Printing & Branding', /^\/(admin\/)?printing/],
  ['Quotes', /^\/(admin\/)?quotes/],
  ['Payments (COD & JazzCash)', /^\/(admin\/)?payments/],
  ['Coupons', /^\/(admin\/)?coupons/],
  ['Banners', /^\/(admin\/)?banners/],
  ['Reviews & Ratings', /^\/(admin\/)?reviews/],
  ['Analytics', /^\/admin\/analytics/],
  ['Notifications & Devices', /^\/admin\/(notifications|devices)/],
  ['Roles & Permissions', /^\/admin\/staff\/permissions/],
  ['Staff Management', /^\/admin\/staff/],
  ['Audit Logs', /^\/admin\/audit-logs/],
  ['Settings', /^\/(admin\/)?settings/],
  ['Shipping & Delivery', /^\/(admin\/shipping-rules|shipping)/],
  ['Media (Cloudinary)', /^\/(admin\/)?media/],
  ['Health', /^\/health/],
];

function folderFor(relPath) {
  for (const [name, pattern] of FOLDERS) {
    if (pattern.test(relPath)) return name;
  }

  return null;
}

/* --------------------------------------------------------- path parameters */

const PARAM_VARIABLES = [
  [/\/orders\/my\/:id/, { id: 'orderId' }],
  [/\/returns\/orders\/:id/, { id: 'orderId' }],
  [/\/returns(\/my)?\/:id/, { id: 'returnId' }],
  [/\/orders\/:id/, { id: 'orderId' }],
  [/\/products\/:id\/variants/, { id: 'productId', variantId: 'variantId' }],
  [/\/products\/:id/, { id: 'productId' }],
  [/\/categories\/:id/, { id: 'categoryId' }],
  [/\/customers\/:id/, { id: 'customerId' }],
  [/\/coupons\/:id/, { id: 'couponId' }],
  [/\/banners\/:id/, { id: 'bannerId' }],
  [/\/payments\/:id/, { id: 'paymentId' }],
  [/\/quotes\/(my\/)?:id/, { id: 'quoteId' }],
  [/\/cancellations\/:id/, { id: 'cancellationId' }],
  [/\/reviews\/:id/, { id: 'reviewId' }],
  [/\/staff\/:id/, { id: 'staffId' }],
  [/\/shipping-rules\/:id/, { id: 'shippingRuleId' }],
  [/\/wholesale\/packs\/:id/, { id: 'packId' }],
  [/\/wholesale\/(requests|my)\/:id/, { id: 'wholesaleRequestId' }],
  [/\/manufacturing\/(requests|my)\/:id/, { id: 'manufacturingRequestId' }],
  [/\/manufacturing\/(categories|styles|variants)\/:id/, { id: 'manufacturingCatalogId' }],
  [/\/manufacturing\/catalog\/:type\/:id/, { id: 'manufacturingCatalogId' }],
  [/\/printing\/(requests|my)\/:id/, { id: 'printingRequestId' }],
  [/\/printing\/services\/:id/, { id: 'printingServiceId' }],
  [/\/media\/:id/, { id: 'mediaId' }],
];

const NAMED_PARAMS = {
  orderId: 'orderId',
  productId: 'productId',
  categoryId: 'manufacturingCategoryId',
  styleId: 'manufacturingStyleId',
  variantId: 'variantId',
  deviceId: 'deviceId',
  notificationId: 'notificationId',
  sku: 'skuCode',
  slug: 'slug',
  type: 'manufacturingCatalogType',
};

function paramVariable(relPath, name) {
  if (name === 'slug') {
    if (/catalog\/products|wholesale\/packs/.test(relPath)) return /wholesale/.test(relPath) ? 'packSlug' : 'productSlug';
    if (/manufacturing\/categories/.test(relPath)) return 'manufacturingCategorySlug';
    if (/manufacturing\/styles/.test(relPath)) return 'manufacturingStyleSlug';
  }

  for (const [pattern, map] of PARAM_VARIABLES) {
    if (pattern.test(relPath) && map[name]) return map[name];
  }

  return NAMED_PARAMS[name] || `${name}`;
}

/* ------------------------------------------------------------- build routes */

const app = createApp();
const routes = collectRoutes(app).map((route) => ({
  ...route,
  rel: route.path.replace(API_PREFIX, '').replace(/\/$/, '') || '/',
}));

const entries = [];
const problems = [];
const unmapped = [];

function overrideBody(route, example) {
  // Auth: use environment variables so one set of credentials works everywhere.
  if (route.rel === '/auth/login') {
    return { identifier: '{{customerEmail}}', password: '{{customerPassword}}' };
  }

  if (route.rel === '/auth/register') {
    return { ...example, email: '{{customerEmail}}', password: '{{customerPassword}}', phone: '{{customerPhone}}' };
  }

  if (route.rel === '/auth/forgot-password') return { identifier: '{{customerEmail}}' };

  if (route.rel === '/admin/staff' && route.method === 'POST') {
    return { ...example, email: '{{staffEmail}}', phone: '{{staffPhone}}', password: '{{staffPassword}}' };
  }

  return example;
}

/*
 * Hand-written examples for the few bodies with cross-field rules the sampler cannot guess
 * (here: new password must differ from the current one). `concrete` is still validated against
 * the real schema; `display` is what Postman users see.
 */
const PRESETS = {
  'POST /account/change-password': {
    concrete: { currentPassword: 'Old#Pass12345', newPassword: 'New#Pass12345' },
    display: { currentPassword: '{{customerPassword}}', newPassword: 'New#Pass12345' },
  },
};

for (const route of routes) {
  const folder = folderFor(route.rel);

  if (!folder) {
    unmapped.push(`${route.method} ${route.rel}`);
    continue;
  }

  const access = describeAccess(route);
  const success = expectedSuccess(route);
  const pathParams = [...route.path.matchAll(/:([A-Za-z]+)/g)].map((m) => m[1]);

  const bodySchema = route.schemas.body;
  const querySchema = route.schemas.query;

  let body = null;
  let bodyFields = [];

  if (bodySchema) {
    const preset = PRESETS[`${route.method} ${route.rel}`];
    const built = preset
      ? { ...preset, valid: bodySchema.safeParse(preset.concrete).success, issues: ['preset does not match the validator'] }
      : buildExample(bodySchema);

    bodyFields = describeFields(bodySchema);

    if (!built.valid) problems.push({ route: `${route.method} ${route.rel}`, part: 'body', issues: built.issues });

    body = { display: overrideBody(route, built.display), valid: built.valid };
  }

  let query = [];

  if (querySchema) {
    const built = buildExample(querySchema, {}, true);
    const fields = describeFields(querySchema);

    if (!built.valid) problems.push({ route: `${route.method} ${route.rel}`, part: 'query', issues: built.issues });

    query = fields
      .filter((field) => built.display && built.display[field.name] !== undefined)
      .map((field) => ({
        key: field.name,
        value: String(built.display[field.name]),
        disabled: !(field.required || ['page', 'limit'].includes(field.name)),
        description: `${field.required ? 'required' : 'optional'} - ${field.type}`,
      }));
  }

  entries.push({
    route,
    folder,
    access,
    success,
    pathParams,
    body,
    bodyFields,
    query,
    storefront: !route.rel.startsWith('/admin'),
  });
}

/* ------------------------------------------- special cases: multipart & hash */

function applySpecials(entry) {
  const { route } = entry;

  if (route.rel === '/media' && route.method === 'POST') {
    entry.multipart = [
      { key: 'file', type: 'file', description: 'JPEG / PNG / WebP (PDF for document purposes). Pick a file in Postman.' },
      { key: 'purpose', type: 'text', value: 'product_image', description: `One of: ${MEDIA_PURPOSE_NAMES.join(', ')}` },
    ];
    entry.body = null;
  }

  if (route.rel === '/payments/jazzcash/return') {
    entry.urlencoded = [
      ['pp_ResponseCode', '000'],
      ['pp_ResponseMessage', 'Thank you for Using JazzCash, Your transaction was successful.'],
      ['pp_TxnRefNo', '{{jazzcashTxnRef}}'],
      ['pp_Amount', '{{jazzcashAmountPaisa}}'],
      ['pp_MerchantID', '{{jazzcashMerchantId}}'],
      ['pp_TxnCurrency', 'PKR'],
      ['pp_SecureHash', '{{jazzcashSecureHash}}'],
    ];
    entry.jazzPreRequest = true;
    entry.body = null;
  }
}

entries.forEach(applySpecials);

/* ---------------------------------------------------------------- helpers */

const METHOD_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function displayPath(entry) {
  return entry.route.rel;
}

function urlFor(entry) {
  return `{{baseUrl}}{{apiPrefix}}${entry.route.rel}`;
}

function resolvedPathWithVars(entry) {
  let out = entry.route.rel;

  for (const name of entry.pathParams) {
    out = out.replace(`:${name}`, `{{${paramVariable(entry.route.rel, name)}}}`);
  }

  return out;
}

function curlUrl(entry) {
  const q = entry.query.filter((item) => !item.disabled).map((item) => `${item.key}=${item.value}`).join('&');

  return `{{baseUrl}}{{apiPrefix}}${resolvedPathWithVars(entry)}${q ? `?${q}` : ''}`;
}

function expectedErrors(entry) {
  const list = [];

  if (entry.route.schemas.body || entry.route.schemas.query || entry.route.schemas.params) {
    list.push('422 VALIDATION_ERROR (body/query/params rejected; `errors[]` lists each field)');
  }

  if (entry.access.kind !== 'public' && entry.access.kind !== 'optional') list.push('401 UNAUTHORIZED / SESSION_EXPIRED');
  if (['staff', 'owner'].includes(entry.access.kind)) list.push('403 FORBIDDEN / PERMISSION_DENIED');
  if (entry.pathParams.length) list.push('404 not found');
  if (entry.route.method !== 'GET') list.push('409 conflict (a business rule or a duplicate, e.g. insufficient stock)');

  return list;
}

/* --------------------------------------------------------------- markdown */

function renderMarkdown() {
  const lines = [];
  const byFolder = new Map(FOLDERS.map(([name]) => [name, []]));

  entries.forEach((entry) => byFolder.get(entry.folder).push(entry));

  lines.push('# PEHANLY - copy-paste API requests');
  lines.push('');
  lines.push('Generated by `node scripts/generate-postman.js` from the live router and the Zod validators.');
  lines.push(`**${entries.length} routes.** Every JSON body below was checked against its real validator.`);
  lines.push('');
  lines.push('## How to use');
  lines.push('');
  lines.push('1. Base URL `http://localhost:5000`, prefix `/api/v1`. In Postman create the variables listed in the table at the bottom (or import `postman/PEHANLY.local.postman_environment.json`).');
  lines.push('2. Authentication is a **session cookie** (`pl_session`, HttpOnly). There is no bearer token. Postman keeps the cookie automatically after a successful login.');
  lines.push('3. Headers for every JSON request: `Content-Type: application/json`. No `Origin` header is needed from Postman.');
  lines.push('4. Only one login is active per Postman cookie jar at a time. Logging in as another user replaces the cookie.');
  lines.push('5. `{{something}}` values are Postman variables. Replace them with real ids returned by earlier requests (the collection does this automatically through test scripts).');
  lines.push('6. Examples are structurally valid. Business rules still apply (a product must exist before it can be ordered, etc.).');
  lines.push('');

  for (const [name, items] of byFolder) {
    if (!items.length) continue;

    lines.push(`## ${name}`);
    lines.push('');

    for (const entry of items) {
      const { route } = entry;
      const hasBody = entry.body || entry.multipart || entry.urlencoded;

      lines.push(`### ${route.method} ${displayPath(entry)}`);
      lines.push('');
      lines.push(`- **URL:** \`${curlUrl(entry)}\``);
      lines.push(`- **Access:** ${entry.access.label}`);

      const headers = [];

      if (entry.multipart) headers.push('`Content-Type: multipart/form-data` (Postman sets the boundary)');
      else if (entry.urlencoded) headers.push('`Content-Type: application/x-www-form-urlencoded`');
      else if (hasBody) headers.push('`Content-Type: application/json`');

      lines.push(`- **Headers:** ${headers.length ? headers.join(', ') : 'none required'}`);
      lines.push(`- **Success:** ${entry.success}`);

      const errors = expectedErrors(entry);

      if (errors.length) lines.push(`- **Possible errors:** ${errors.join('; ')}`);

      if (entry.query.length) {
        lines.push('- **Query params:**');
        entry.query.forEach((q) => lines.push(`  - \`${q.key}\` = \`${q.value}\` (${q.description}${q.disabled ? ', optional' : ''})`));
      }

      if (entry.multipart) {
        lines.push('- **Form-data fields:**');
        entry.multipart.forEach((f) => lines.push(`  - \`${f.key}\` (${f.type}) ${f.value ? `= \`${f.value}\`` : ''} - ${f.description}`));
      } else if (entry.urlencoded) {
        lines.push('- **Form fields** (sent by JazzCash, signed with the integrity salt):');
        entry.urlencoded.forEach(([k, v]) => lines.push(`  - \`${k}\` = \`${v}\``));
        lines.push('  - `pp_SecureHash` = HMAC-SHA256 (key = integrity salt) of `salt&` + values of all non-empty `pp*` fields sorted by field name, joined with `&`, upper-case hex. The Postman collection computes it in a pre-request script.');
      } else if (entry.body) {
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(entry.body.display, null, 2));
        lines.push('```');

        if (!entry.body.valid) lines.push('> Example could not be fully validated automatically - see "Needs manual attention" below.');

        const optional = entry.bodyFields.filter((f) => !f.required).map((f) => f.name);

        if (optional.length) lines.push(`Optional fields: ${optional.map((n) => `\`${n}\``).join(', ')}`);
      }

      lines.push('');
    }
  }

  lines.push('## Variables');
  lines.push('');
  lines.push(variableTable());
  lines.push('');

  if (problems.length) {
    lines.push('## Needs manual attention');
    lines.push('');
    lines.push('The generator could not build a body that passes the validator for these routes:');
    lines.push('');
    problems.forEach((p) => lines.push(`- \`${p.route}\` (${p.part}): ${p.issues.slice(0, 3).join('; ')}`));
    lines.push('');
  }

  lines.push('## Not available in this backend');
  lines.push('');
  lines.push('No such routes exist, so none are listed: shopping cart, customer profile / avatar update, wishlist, public product search outside `/catalog/products`, email sending, separate role CRUD (roles are fixed: customer, staff, admin; staff permissions are set through `/admin/staff`).');

  return lines.join('\n');
}

/* --------------------------------------------------------------- variables */

function collectVariables() {
  const text = JSON.stringify([entries.map((e) => [e.body && e.body.display, e.query, e.pathParams.map((n) => paramVariable(e.route.rel, n))])]);
  const names = new Set([...text.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map((m) => m[1]));

  entries.forEach((entry) => entry.pathParams.forEach((n) => names.add(paramVariable(entry.route.rel, n))));
  ['baseUrl', 'apiPrefix', 'adminIdentifier', 'adminPassword', 'staffEmail', 'staffPhone', 'staffPassword', 'customerEmail', 'customerPhone', 'customerPassword', 'mediaUrl',
    'jazzcashTxnRef', 'jazzcashAmountPaisa', 'jazzcashMerchantId', 'jazzcashIntegritySalt', 'jazzcashSecureHash'].forEach((n) => names.add(n));

  return [...names].sort();
}

const VARIABLE_DEFAULTS = {
  baseUrl: 'http://localhost:5000',
  apiPrefix: '/api/v1',
  customerEmail: 'postman.customer@example.com',
  customerPhone: '03001234567',
  customerPassword: 'Postman#Test12345',
  staffEmail: 'postman.staff@example.com',
  staffPhone: '03007654321',
  staffPassword: 'Postman#Staff12345',
};

const SECRET_VARIABLES = new Set(['adminPassword', 'staffPassword', 'customerPassword', 'jazzcashIntegritySalt', 'jazzcashSecureHash']);

const VARIABLE_NOTES = {
  adminIdentifier: 'Your owner account email or phone (create it with `npm run create-admin`).',
  staffEmail: 'Email of the staff account created by POST /admin/staff (then used by "Login as Staff").',
  publicId: 'Cloudinary public id returned by POST /media (data.publicId). Saved automatically after an upload.',
  mediaUrl: 'A Cloudinary URL returned by POST /media (must be https://res.cloudinary.com/<your cloud>/...).',
  skuCode: 'The SKU code string of a variant SKU (used by /admin/inventory/:sku/...).',
  resourceId: 'Any Mongo ObjectId; set it to the id the request needs.',
  jazzcashIntegritySalt: 'JazzCash sandbox integrity salt (only for the return-callback simulation). Never commit it.',
};

function variableTable() {
  const rows = ['| Variable | Default | Note |', '| --- | --- | --- |'];

  collectVariables().forEach((name) => {
    rows.push(`| \`${name}\` | ${SECRET_VARIABLES.has(name) && !VARIABLE_DEFAULTS[name] ? '(empty)' : `\`${VARIABLE_DEFAULTS[name] || ''}\``} | ${VARIABLE_NOTES[name] || ''} |`);
  });

  return rows.join('\n');
}

/* ------------------------------------------------------ postman collection */

const CAPTURE_ID = `
const __json = (() => { try { return pm.response.json(); } catch (e) { return null; } })();
function __pickId(data) {
  if (!data || typeof data !== 'object') return null;
  if (data._id || data.id) return data._id || data.id;
  const keys = Object.keys(data);
  for (const k of keys) {
    const v = data[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && (v._id || v.id)) return v._id || v.id;
  }
  return null;
}`;

function captureVariableFor(entry) {
  if (entry.route.method !== 'POST' || entry.success !== 201) return null;

  const rel = entry.route.rel;
  const map = [
    [/^\/auth\/register/, 'customerId'],
    [/^\/admin\/categories$/, 'categoryId'],
    [/^\/admin\/products$/, 'productId'],
    [/^\/admin\/coupons$/, 'couponId'],
    [/^\/admin\/banners$/, 'bannerId'],
    [/^\/admin\/staff$/, 'staffId'],
    [/^\/admin\/shipping-rules$/, 'shippingRuleId'],
    [/^\/admin\/wholesale\/packs$/, 'packId'],
    [/^\/admin\/printing\/services$/, 'printingServiceId'],
    [/^\/orders$/, 'orderId'],
    [/^\/wholesale\/(requests\/custom|packs\/:id\/request)/, 'wholesaleRequestId'],
    [/^\/manufacturing\/requests$/, 'manufacturingRequestId'],
    [/^\/printing\/requests$/, 'printingRequestId'],
    [/^\/admin\/quotes\/(wholesale|manufacturing|printing)$/, 'quoteId'],
    [/^\/media$/, 'mediaId'],
  ];

  for (const [pattern, variable] of map) if (pattern.test(rel)) return variable;

  return null;
}

function testScript(entry) {
  const method = entry.route.method;
  const publicRoute = ['public', 'optional'].includes(entry.access.kind);
  const lines = [CAPTURE_ID.trim()];
  const redirect = entry.success === 303;

  lines.push(`pm.test('No server error (not 5xx)', () => pm.expect(pm.response.code).to.be.below(500));`);

  if (redirect) {
    lines.push(`pm.test('Gateway callback answers with a redirect (303)', () => pm.expect(pm.response.code).to.equal(303));`);
    return lines.join('\n');
  }

  lines.push(`if (pm.response.code !== 204) {
  pm.test('Response is JSON with the standard envelope', () => {
    pm.expect(__json, 'JSON body').to.be.an('object');
    pm.expect(__json.success, 'success flag').to.be.a('boolean');
    pm.expect(__json.message, 'message').to.be.a('string');
  });
}`);

  lines.push(`if (pm.response.code === ${entry.success}) {
  pm.test('Success response: success=true', () => pm.expect(__json.success).to.equal(true));
  ${method === 'GET' ? `if (__json && Array.isArray(__json.data) && __json.meta) {
    pm.test('List response has pagination meta', () => {
      pm.expect(__json.meta).to.be.an('object');
      pm.expect(__json.meta.page === undefined || typeof __json.meta.page === 'number').to.equal(true);
    });
  }` : ''}
} else if (pm.response.code >= 400) {
  pm.test('Error response has success=false and a code', () => {
    pm.expect(__json.success).to.equal(false);
    pm.expect(__json.code, 'error code').to.be.a('string');
  });
  if (pm.response.code === 422) {
    pm.test('Validation error lists the failing fields', () => pm.expect(Array.isArray(__json.errors)).to.equal(true));
  }
  ${publicRoute ? '' : `if (pm.response.code === 401) {
    pm.test('Not signed in: run one of the Login requests first', () => pm.expect(__json.code).to.be.oneOf(['UNAUTHORIZED', 'SESSION_EXPIRED']));
  }`}
}`);

  const variable = captureVariableFor(entry);

  if (variable) {
    lines.push(`if (pm.response.code === 201) {
  const __id = __pickId(__json && __json.data);
  if (__id) { pm.environment.set('${variable}', __id); }
}`);
  }

  if (entry.route.rel === '/account/addresses' && entry.route.method === 'POST') {
    lines.push(`if (pm.response.code === 201 && __json && Array.isArray(__json.data) && __json.data.length) {
  const __last = __json.data[__json.data.length - 1];
  pm.environment.set('addressId', __last._id || __last.id);
}`);
  }

  if (entry.route.rel === '/media' && entry.route.method === 'POST') {
    lines.push(`if (pm.response.code === 201 && __json && __json.data) {
  pm.environment.set('mediaId', __json.data.id);
  pm.environment.set('mediaUrl', __json.data.url);
  pm.environment.set('publicId', __json.data.publicId);
}`);
  }

  if (entry.route.rel === '/auth/login') {
    lines.push(`if (pm.response.code === 200) {
  const __user = __json && __json.data && (__json.data.user || __json.data);
  const __uid = __user && (__user._id || __user.id);
  if (__uid) pm.environment.set('customerId', __uid);
}`);
  }

  return lines.join('\n');
}

function jazzPreRequest() {
  return `// Simulates the JazzCash return POST. Needs jazzcashIntegritySalt (sandbox) in the environment.
const salt = pm.environment.get('jazzcashIntegritySalt');
if (!salt) { throw new Error('Set jazzcashIntegritySalt in the environment first'); }
const fields = {};
(pm.request.body.urlencoded || []).each((item) => { if (!item.disabled) fields[item.key] = pm.variables.replaceIn(item.value || ''); });
delete fields.pp_SecureHash;
const keys = Object.keys(fields).filter((k) => k.indexOf('pp') === 0 && String(fields[k]) !== '').sort();
const message = [salt].concat(keys.map((k) => String(fields[k]))).join('&');
const hash = CryptoJS.HmacSHA256(message, salt).toString().toUpperCase();
pm.environment.set('jazzcashSecureHash', hash);`;
}

function descriptionFor(entry) {
  const parts = [`**Access:** ${entry.access.label}`, `**Success status:** ${entry.success}`];
  const errors = expectedErrors(entry);

  if (errors.length) parts.push(`**Possible errors:** ${errors.join('; ')}`);
  if (entry.bodyFields.length) {
    parts.push(
      '**Body fields:**\n' + entry.bodyFields.map((f) => `- \`${f.name}\` (${f.required ? 'required' : 'optional'}, ${f.type})`).join('\n'),
    );
  }

  if (entry.route.rel === '/auth/login') parts.push('Sets the `pl_session` cookie. Postman stores it automatically. For admin/staff use the requests in "00 - Login".');
  if (entry.route.rel === '/payments/jazzcash/return') {
    parts.push('Content type is `application/x-www-form-urlencoded`. The pre-request script computes `pp_SecureHash` from `jazzcashIntegritySalt`. The backend answers with a 303 redirect to `${CLIENT_URL}/payment/result` (it never returns JSON). This only simulates a gateway callback; it is not proof the real gateway works.');
  }

  return parts.join('\n\n');
}

function postmanRequest(entry) {
  const { route } = entry;
  const rawPath = route.rel.split('/').filter(Boolean);
  const request = {
    method: route.method,
    header: [],
    url: {
      raw: `{{baseUrl}}{{apiPrefix}}${route.rel}${entry.query.length ? `?${entry.query.filter((q) => !q.disabled).map((q) => `${q.key}=${q.value}`).join('&')}` : ''}`,
      host: ['{{baseUrl}}'],
      path: ['{{apiPrefix}}'.replace(/^\//, ''), ...rawPath],
      query: entry.query.map((q) => ({ key: q.key, value: q.value, disabled: q.disabled, description: q.description })),
      variable: entry.pathParams.map((name) => ({ key: name, value: `{{${paramVariable(route.rel, name)}}}` })),
    },
    description: descriptionFor(entry),
  };

  // {{apiPrefix}} already contains slashes; keep the path simple and explicit.
  request.url.path = ['api', 'v1', ...rawPath];
  request.url.host = ['{{baseUrl}}'];
  request.url.raw = `{{baseUrl}}/api/v1${route.rel}${entry.query.some((q) => !q.disabled) ? `?${entry.query.filter((q) => !q.disabled).map((q) => `${q.key}=${q.value}`).join('&')}` : ''}`;

  if (entry.multipart) {
    request.body = { mode: 'formdata', formdata: entry.multipart.map((f) => (f.type === 'file' ? { key: f.key, type: 'file', description: f.description } : { key: f.key, type: 'text', value: f.value, description: f.description })) };
  } else if (entry.urlencoded) {
    request.header.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' });
    request.body = { mode: 'urlencoded', urlencoded: entry.urlencoded.map(([key, value]) => ({ key, value, type: 'text' })) };
  } else if (entry.body) {
    request.header.push({ key: 'Content-Type', value: 'application/json' });
    request.body = { mode: 'raw', raw: JSON.stringify(entry.body.display, null, 2), options: { raw: { language: 'json' } } };
  }

  const events = [{ listen: 'test', script: { type: 'text/javascript', exec: testScript(entry).split('\n') } }];

  if (entry.jazzPreRequest) events.unshift({ listen: 'prerequest', script: { type: 'text/javascript', exec: jazzPreRequest().split('\n') } });

  return { name: `${route.method} ${route.rel}`, request, event: events, response: [] };
}

function loginRequest(label, identifierVar, passwordVar) {
  return {
    name: label,
    event: [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            "pm.test('Login succeeded (200)', () => pm.response.to.have.status(200));",
            "pm.test('Session cookie was stored', () => pm.expect(pm.cookies.has('pl_session')).to.equal(true));",
          ],
        },
      },
    ],
    request: {
      method: 'POST',
      header: [{ key: 'Content-Type', value: 'application/json' }],
      url: { raw: '{{baseUrl}}/api/v1/auth/login', host: ['{{baseUrl}}'], path: ['api', 'v1', 'auth', 'login'] },
      body: { mode: 'raw', raw: JSON.stringify({ identifier: `{{${identifierVar}}}`, password: `{{${passwordVar}}}` }, null, 2), options: { raw: { language: 'json' } } },
      description: 'Logs in and stores the `pl_session` cookie in the Postman cookie jar. Logging in as another user replaces it.',
    },
    response: [],
  };
}

function buildCollection() {
  const byFolder = new Map(FOLDERS.map(([name]) => [name, []]));

  entries.forEach((entry) => byFolder.get(entry.folder).push(entry));

  const items = [
    {
      name: '00 - Login (run first)',
      description: 'The backend uses an HttpOnly session cookie (`pl_session`). Postman keeps it in its cookie jar. Only one login is active at a time: run the login for the role you want to test.',
      item: [
        loginRequest('Login as Owner (admin)', 'adminIdentifier', 'adminPassword'),
        loginRequest('Login as Staff', 'staffEmail', 'staffPassword'),
        loginRequest('Login as Customer', 'customerEmail', 'customerPassword'),
      ],
    },
  ];

  for (const [name, list] of byFolder) {
    if (!list.length) continue;

    const storefront = list.filter((e) => e.storefront).map(postmanRequest);
    const admin = list.filter((e) => !e.storefront).map(postmanRequest);
    const children = [];

    if (storefront.length && admin.length) {
      children.push({ name: 'Storefront / Customer', item: storefront });
      children.push({ name: 'Admin / Staff', item: admin });
    } else {
      children.push(...storefront, ...admin);
    }

    items.push({ name, item: children });
  }

  return {
    info: {
      name: 'PEHANLY Backend API',
      description: `Generated from the live router and Zod validators by scripts/generate-postman.js (${entries.length} routes). Session-cookie auth: run a request from "00 - Login" first. No credentials are stored in this file.`,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: items,
  };
}

function buildEnvironment() {
  return {
    id: 'pehanly-local-environment',
    name: 'PEHANLY Local',
    values: collectVariables().map((key) => ({
      key,
      value: VARIABLE_DEFAULTS[key] || '',
      type: SECRET_VARIABLES.has(key) ? 'secret' : 'default',
      enabled: true,
    })),
    _postman_variable_scope: 'environment',
  };
}

/* ------------------------------------------------------------------ output */

if (unmapped.length) {
  console.error('Routes without a folder:\n' + unmapped.join('\n'));
  process.exit(1);
}

fs.mkdirSync(path.join(ROOT, 'postman'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'postman', 'PEHANLY.postman_collection.json'), JSON.stringify(buildCollection(), null, 2));
fs.writeFileSync(path.join(ROOT, 'postman', 'PEHANLY.local.postman_environment.json'), JSON.stringify(buildEnvironment(), null, 2));
fs.writeFileSync(path.join(ROOT, 'docs', 'API_REQUESTS.md'), renderMarkdown());

console.log(`routes: ${routes.length}, requests written: ${entries.length}, validation problems: ${problems.length}`);
problems.forEach((p) => console.log(`  - ${p.route} (${p.part}): ${p.issues.slice(0, 3).join('; ')}`));
process.exit(0);
