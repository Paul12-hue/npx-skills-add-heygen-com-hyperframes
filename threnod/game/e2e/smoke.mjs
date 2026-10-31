// Automated browser smoke test for THRENOD.
// Builds must exist in dist/ (npm run build). Usage: node e2e/smoke.mjs
// Uses the pre-installed Playwright Chromium (software WebGL in headless mode).
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(join(process.env.NODE_PATH || '/usr/local/lib/node_modules', 'playwright')));
}

const DIST = resolve('dist');
const OUT = resolve('e2e/out');
await mkdir(OUT, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const path = join(DIST, decodeURIComponent((req.url || '/').split('?')[0]).replace(/\/$/, '/index.html'));
    if (!path.startsWith(DIST)) throw new Error('outside');
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// ------------------------------------------------------------ desktop run
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.__threnod, null, { timeout: 15000 });
  await sleep(1500);
  const st = () => page.evaluate(() => window.__threnod.state());
  check('boots to title screen', (await st()).mode === 'title');
  await page.screenshot({ path: `${OUT}/01-title.png` });

  await page.getByRole('button', { name: 'New Game' }).click();
  await sleep(600);
  const s0 = await st();
  check('new game starts playing', s0.mode === 'playing', `internal ${s0.internal.join('x')}`);
  await page.screenshot({ path: `${OUT}/02-spawn.png` });

  await page.keyboard.down('w');
  await sleep(1500);
  await page.keyboard.up('w');
  const s1 = await st();
  const moved = Math.hypot(s1.player.x - s0.player.x, s1.player.z - s0.player.z);
  check('W moves the player', moved > 1.5, `moved ${moved.toFixed(2)} m`);
  check('player stays on the ground', Math.abs(s1.player.y) < 40 && Number.isFinite(s1.player.y));

  // walk up to Tilde and talk
  await page.evaluate(() => window.__threnod.teleport(-41.4 - 5.5 + 1.4, -38.5 + 3.2, Math.PI / 2));
  await sleep(300);
  const s2 = await st();
  check('Tilde is targetable', s2.target === 'tilde', `target=${s2.target}`);
  await page.keyboard.press('e');
  await sleep(300);
  const s3 = await st();
  check('E opens a dialogue', s3.mode === 'dialogue' && !!s3.dialogue, s3.dialogue?.text?.slice(0, 40));
  await page.keyboard.press('e'); // finish typing
  await page.keyboard.press('e'); // next node
  await sleep(1800);
  await page.keyboard.press('e'); // reveal choices
  await sleep(200);
  const s4 = await st();
  check('dialogue offers choices', s4.dialogue?.choices === 3, `choices=${s4.dialogue?.choices}`);
  await page.screenshot({ path: `${OUT}/03-dialogue.png` });
  await page.keyboard.press('3');
  await sleep(200);
  check('choice sets a flag', (await st()).flags.tilde_quiet_ghost === true);
  for (let i = 0; i < 6 && (await st()).mode === 'dialogue'; i++) {
    await page.keyboard.press('e');
    await sleep(120);
    await page.keyboard.press('e');
    await sleep(120);
  }
  check('dialogue closes', (await st()).mode === 'playing');

  // night & the village
  await page.evaluate(() => {
    window.__threnod.setHour(22.5);
    window.__threnod.teleport(40, 6, -Math.PI / 2);
  });
  await sleep(800);
  await page.screenshot({ path: `${OUT}/04-candlewick-night.png` });
  await page.evaluate(() => {
    window.__threnod.setHour(13);
    window.__threnod.teleport(-10, -26, Math.PI);
  });
  await sleep(800);
  await page.screenshot({ path: `${OUT}/05-lake-day.png` });

  await page.keyboard.press('Escape');
  await sleep(200);
  check('Escape pauses', (await st()).mode === 'paused');
  const saved = await page.evaluate(() => localStorage.getItem('threnod.save'));
  check('pausing saves the game', !!saved && JSON.parse(saved).version === 1);
  await page.getByRole('button', { name: 'Quit to Title' }).click();
  await sleep(200);
  await page.getByRole('button', { name: 'Continue' }).click();
  await sleep(300);
  const s5 = await st();
  check('Continue restores position', Math.hypot(s5.player.x + 10, s5.player.z + 26) < 1.5, `at ${s5.player.x.toFixed(1)}, ${s5.player.z.toFixed(1)}`);

  const fps = (await st()).fps;
  check('no JavaScript errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`info  headless software-rendered fps: ${fps.toFixed(1)} (not representative of an iPad)`);
  await page.close();
}

// ------------------------------------------------------------ iPad-like touch run
{
  const ctx = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__threnod, null, { timeout: 15000 });
  await page.evaluate(() => localStorage.clear());
  await page.getByRole('button', { name: 'New Game' }).tap();
  await sleep(500);
  const st = () => page.evaluate(() => window.__threnod.state());
  const s0 = await st();

  const touch = (type, x, y, id = 1) =>
    page.evaluate(
      ([type, x, y, id]) => {
        const target = document.getElementById('view');
        const t = new Touch({ identifier: id, target, clientX: x, clientY: y });
        const list = type === 'touchend' ? [] : [t];
        target.dispatchEvent(new TouchEvent(type, { touches: list, targetTouches: list, changedTouches: [t], bubbles: true, cancelable: true }));
      },
      [type, x, y, id],
    );
  await touch('touchstart', 200, 600);
  await touch('touchmove', 200, 545);
  await sleep(1200);
  await page.screenshot({ path: `${OUT}/06-ipad-stick.png` });
  await touch('touchend', 200, 545);
  const s1 = await st();
  const moved = Math.hypot(s1.player.x - s0.player.x, s1.player.z - s0.player.z);
  check('touch stick moves the player', moved > 1.5, `moved ${moved.toFixed(2)} m`);

  const yaw0 = await page.evaluate(() => window.__threnod.state().player.yaw);
  await touch('touchstart', 900, 400, 2);
  await touch('touchmove', 1000, 400, 2);
  await touch('touchend', 1000, 400, 2);
  await touch('touchstart', 200, 600);
  await touch('touchmove', 200, 545);
  await sleep(700);
  await touch('touchend', 200, 545);
  const yaw1 = await page.evaluate(() => window.__threnod.state().player.yaw);
  check('right-side drag turns the camera', Math.abs(yaw1 - yaw0) > 0.2, `yaw ${yaw0.toFixed(2)} → ${yaw1.toFixed(2)}`);

  await page.evaluate(() => window.__threnod.teleport(-41.4 - 5.5 + 1.4, -38.5 + 3.2, Math.PI / 2));
  await sleep(300);
  const btn = page.locator('.action-btn');
  check('touch action button appears', await btn.isVisible(), await btn.textContent());
  await btn.tap();
  await sleep(300);
  check('tapping the action button talks', (await st()).mode === 'dialogue');
  await page.screenshot({ path: `${OUT}/07-ipad-dialogue.png` });
  check('no JavaScript errors (touch)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: e2e/out/`);
process.exit(failed ? 1 : 0);
