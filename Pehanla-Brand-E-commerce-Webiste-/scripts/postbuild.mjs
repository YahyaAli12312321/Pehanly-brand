// Generates dist/sitemap.xml and dist/robots.txt after `vite build`.
//
// Env (read from process env or .env):
//   VITE_SITE_URL     canonical public origin, e.g. https://www.example.com (required for a useful sitemap)
//   SITEMAP_API_URL   API base used ONLY at build time to list categories/products,
//                     e.g. https://api.example.com/api/v1  (optional; without it only static pages are listed)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const dist = resolve(root, 'dist');
mkdirSync(dist, { recursive: true });

function loadDotEnv() {
  const p = resolve(root, '.env');
  if (!existsSync(p)) return {};
  return Object.fromEntries(
    readFileSync(p, 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
  );
}
const env = { ...loadDotEnv(), ...process.env };
const site = (env.VITE_SITE_URL || '').replace(/\/+$/, '');
const api = (env.SITEMAP_API_URL || '').replace(/\/+$/, '');

const staticPaths = ['/', '/shop', '/wholesale', '/custom-manufacturing', '/printing-branding', '/about'];
const urls = staticPaths.map((p) => ({ loc: p }));

async function getJson(path) {
  const res = await fetch(`${api}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

if (api) {
  try {
    const cats = (await getJson('/categories')).data || [];
    cats.forEach((c) => urls.push({ loc: `/shop/${c.slug}` }));
    for (let page = 1; page <= 200; page += 1) {
      const body = await getJson(`/products?limit=100&page=${page}`);
      (body.data || []).forEach((p) => urls.push({ loc: `/product/${p.slug}`, lastmod: p.updatedAt }));
      if (!body.meta || page >= (body.meta.totalPages || 1)) break;
    }
    const mfg = (await getJson('/manufacturing/categories')).data || [];
    (Array.isArray(mfg) ? mfg : mfg.items || []).forEach((c) => urls.push({ loc: `/custom-manufacturing/${c.slug}` }));
  } catch (err) {
    console.warn(`[sitemap] API listing skipped: ${err.message}`);
  }
} else {
  console.warn('[sitemap] SITEMAP_API_URL not set: sitemap lists static pages only.');
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
if (site) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(site + u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`)
    .join('\n')}\n</urlset>\n`;
  writeFileSync(resolve(dist, 'sitemap.xml'), xml);
} else {
  console.warn('[sitemap] VITE_SITE_URL not set: sitemap.xml not generated.');
}

writeFileSync(
  resolve(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /cart\nDisallow: /checkout\nDisallow: /order-confirmation\nDisallow: /account\nDisallow: /track-order\nDisallow: /wishlist\nDisallow: /*?q=\nDisallow: /*?sort=\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ''}`,
);

// Hosting helpers: SPA fallback for Netlify/Cloudflare Pages style hosts.
writeFileSync(resolve(dist, '_redirects'), '/*    /index.html   200\n');
console.log(`[postbuild] sitemap urls: ${urls.length}`);
