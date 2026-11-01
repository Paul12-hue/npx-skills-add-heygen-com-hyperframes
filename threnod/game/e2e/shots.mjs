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
  // skip the opening text
  for (let i = 0; i < 4; i++) {
    if (await page.locator('.prologue:not(.hidden)').count()) await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 300));
  }

const views = [
  ['water-lake', [-8, -24, Math.PI + 0.3], 21],
  ['water-river', [8, -32, -Math.PI * 0.62], 21],
  ['water-marsh', [-205, 190, Math.PI * 0.2], 21],
  ['ground', [30, -14, -Math.PI / 2], 21],
];
for (const [name, tp, hour] of views) {
  await page.evaluate(([tp, hour]) => {
    if (tp) window.__threnod.teleport(tp[0], tp[1], tp[2]);
    window.__threnod.setCamera(10, 0.6, Math.PI);
    window.__threnod.setHour(hour);
  }, [tp, hour]);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${OUT}/view-${name}.png`, timeout: 120000 });
  console.log('shot', name);
}
await browser.close();
server.close();
