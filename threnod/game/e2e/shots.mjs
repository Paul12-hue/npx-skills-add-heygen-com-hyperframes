// Takes screenshots from fixed viewpoints for visual review.
// Usage: npm run build && node e2e/shots.mjs [quality]
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DIST = resolve('dist');
const OUT = resolve('e2e/out');
await mkdir(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const path = join(DIST, decodeURIComponent((req.url || '/').split('?')[0]).replace(/\/$/, '/index.html'));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0);
const quality = process.argv[2] || 'medium';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
await page.addInitScript((q) => localStorage.setItem('threnod.settings', JSON.stringify({ quality: q })), quality);
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.__threnod, null, { timeout: 20000 });
await page.getByRole('button', { name: 'New Game' }).click();
const views = [
  ['spawn', null, 21],
  ['village', [46, 6, -Math.PI * 0.7], 21.5],
  ['bridge', [6, -32, -Math.PI * 0.62], 21],
  ['farm', [100, 34, -Math.PI * 0.8], 20.5],
  ['stones', [-104, -58, Math.PI * 0.3], 22],
  ['ruin', [-16, -128, Math.PI * 0.95], 21],
  ['camp', [126, -24, -Math.PI * 0.7], 22],
];
for (const [name, tp, hour] of views) {
  await page.evaluate(([tp, hour]) => {
    if (tp) window.__threnod.teleport(tp[0], tp[1], tp[2]);
    window.__threnod.setHour(hour);
  }, [tp, hour]);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${OUT}/view-${name}.png`, timeout: 120000 });
  console.log('shot', name);
}
await browser.close();
server.close();
