// Draw-call / triangle / light report for a few places (medium quality). Usage: node e2e/perf.mjs [quality]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const DIST = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const p = join(DIST, (req.url || '/').split('?')[0].replace(/\/$/, '/index.html'));
    const b = await readFile(p);
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const quality = process.argv[2] || 'medium';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
await page.addInitScript((q) => localStorage.setItem('threnod.settings', JSON.stringify({ quality: q })), quality);
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${server.address().port}/`, { timeout: 120000 });
await page.waitForFunction(() => window.__threnod, null, { timeout: 120000 });
console.log('boot ms', Date.now() - t0);
await page.getByRole('button', { name: 'New Game' }).click();
for (let i = 0; i < 4; i++) { if (await page.locator('.prologue:not(.hidden)').count()) await page.keyboard.press('Enter'); await page.waitForTimeout(300); }
const sleep = (ms) => page.waitForTimeout(ms);
const places = (process.env.PLACES || 'spawn:-40,-30;village:40,6;forest:200,-190;marsh:-215,190').split(';');
for (const pl of places) {
  const [name, xy] = pl.split(':');
  const [x, z] = xy.split(',').map(Number);
  await page.evaluate(([x, z]) => { window.__threnod.teleport(x, z, 0); window.__threnod.setCamera(15, 0.62, Math.PI); }, [x, z]);
  await sleep(2500);
  const s = await page.evaluate(() => ({ ...window.__threnod.stats(), fps: window.__threnod.state().fps }));
  console.log(name.padEnd(8), JSON.stringify(s));
}
if (process.env.HEAVY) console.log((await page.evaluate(() => window.__threnod.heavy())).map((r) => r.join('  ')).join('\n'));
await browser.close();
server.close();
