// OPTIONAL static prerender (Playwright). Run after `npm run build` and with the API reachable.
//   npx playwright install chromium   # one-time (devDependency not bundled to keep installs light)
//   SITE_ORIGIN=http://localhost:4173 PRERENDER_PATHS=/,/shop,/about npm run prerender
// Starts `vite preview`, renders each path in headless Chromium and writes the final HTML
// (title, meta, JSON-LD and content) to dist/<path>/index.html so crawlers get real HTML.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { chromium } = await import('playwright');
const origin = process.env.SITE_ORIGIN || 'http://localhost:4173';
const paths = (process.env.PRERENDER_PATHS || '/,/shop,/about,/wholesale,/custom-manufacturing,/printing-branding').split(',');

const server = spawn('npx', ['vite', 'preview', '--port', new URL(origin).port || '4173', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
try {
  for (const p of paths) {
    const page = await browser.newPage();
    await page.goto(origin + p, { waitUntil: 'networkidle' });
    await page.waitForSelector('main#main-content *', { timeout: 15000 });
    const html = '<!doctype html>\n' + (await page.evaluate(() => document.documentElement.outerHTML));
    const dir = resolve('dist', '.' + p);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'index.html'), html);
    console.log('prerendered', p);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
