// Screenshots of dialogue portraits. Usage: npm run build && node e2e/talk.mjs
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
await page.addInitScript(() => localStorage.setItem('threnod.settings', JSON.stringify({ quality: 'low' })));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.__threnod, null, { timeout: 30000 });
await page.getByRole('button', { name: 'New Game' }).click();
await page.evaluate(() => window.__threnod.teleport(-41.4 - 5.5 + 1.4, -38.5 + 3.2, Math.PI / 2));
await new Promise((r) => setTimeout(r, 1200));
await page.keyboard.press('e');
await new Promise((r) => setTimeout(r, 2500));
await page.locator('.dialogue').screenshot({ path: `${OUT}/talk-tilde.png` });
await page.keyboard.press('e');
await page.keyboard.press('e');
await new Promise((r) => setTimeout(r, 2500));
await page.keyboard.press('e');
await new Promise((r) => setTimeout(r, 1500));
await page.locator('.dialogue').screenshot({ path: `${OUT}/talk-choices.png` });
await browser.close();
server.close();
console.log('done');
