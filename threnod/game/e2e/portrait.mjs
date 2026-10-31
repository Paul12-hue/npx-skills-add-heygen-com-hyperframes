// Close-up screenshots of the characters. Usage: npm run build && node e2e/portrait.mjs
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
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
await page.addInitScript(() => localStorage.setItem('threnod.settings', JSON.stringify({ quality: 'high' })));
page.on('pageerror', (e) => console.log('pageerror', e.message));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.__threnod, null, { timeout: 30000 });
console.log('boot ms', Date.now() - t0);
await page.getByRole('button', { name: 'New Game' }).click();
const shots = [
  ['unsung-face', [56, 6, 0.4], [1.3, 0.05, Math.PI], 21],
  ['unsung-34', [56, 6, 0.4], [2.2, 0.15, Math.PI * 0.75], 21],
  ['unsung-full', [56, 6, 0.4], [3.8, 0.1, Math.PI * 0.85], 21],
  ['tilde-face', [-46.9 - 1.6, -35.3 - 1.4, Math.atan2(1.6, 1.4) + Math.PI], [3.2, 0.1, Math.PI + 0.45], 21],
];
for (const [name, tp, cam, hour] of shots) {
  await page.evaluate(([tp, cam, hour]) => {
    window.__threnod.teleport(tp[0], tp[1], tp[2]);
    window.__threnod.setHour(hour);
    window.__threnod.setCamera(cam[0], cam[1], cam[2]);
  }, [tp, cam, hour]);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${OUT}/char-${name}.png` });
  console.log('shot', name);
}
await browser.close();
server.close();
