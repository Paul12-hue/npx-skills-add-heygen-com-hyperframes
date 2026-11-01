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
  // software rendering in CI is slow; the low preset keeps the frame rate usable
  await page.addInitScript(() => localStorage.setItem('threnod.settings', JSON.stringify({ quality: 'low' })));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.__threnod, null, { timeout: 15000 });
  await sleep(1500);
  const st = () => page.evaluate(() => window.__threnod.state());
  check('boots to title screen', (await st()).mode === 'title');
  await page.screenshot({ path: `${OUT}/01-title.png`, timeout: 120000 });

  await page.getByRole('button', { name: 'New Game' }).click();
  // skip the opening text
  for (let i = 0; i < 4; i++) {
    if (await page.locator('.prologue:not(.hidden)').count()) await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 300));
  }

  await sleep(600);
  const s0 = await st();
  check('new game starts playing', s0.mode === 'playing', `internal ${s0.internal.join('x')}`);
  await page.screenshot({ path: `${OUT}/02-spawn.png`, timeout: 120000 });

  await page.keyboard.down('w');
  await sleep(2500);
  await page.keyboard.up('w');
  const s1 = await st();
  const moved = Math.hypot(s1.player.x - s0.player.x, s1.player.z - s0.player.z);
  check('W moves the player', moved > 1.5, `moved ${moved.toFixed(2)} m`);
  check('player stays on the ground', Math.abs(s1.player.y) < 40 && Number.isFinite(s1.player.y));

  // walk up to Tilde and talk
  await page.evaluate(() => window.__threnod.teleport(-41.4 - 5.5 + 1.4, -38.5 + 3.2, Math.PI / 2));
  await sleep(2500);
  const s2 = await st();
  check('Tilde is targetable', s2.target === 'tilde', `target=${s2.target}`);
  await sleep(4000); // let the portrait warm-up finish in the slow software renderer
  // the software renderer can be very slow – retry the key a few times
  let s3 = await st();
  for (let i = 0; i < 6 && s3.mode !== 'dialogue'; i++) {
    await page.keyboard.press('e');
    for (let j = 0; j < 6 && s3.mode !== 'dialogue'; j++) {
      await sleep(500);
      s3 = await st();
    }
  }
  check('E opens a dialogue', s3.mode === 'dialogue' && !!s3.dialogue, s3.dialogue?.text?.slice(0, 40) ?? ('mode=' + s3.mode + ' target=' + s3.target));
  // advance until the first choice appears (the software renderer in CI is slow)
  for (let i = 0; i < 12; i++) {
    const cur = await st();
    if (cur.dialogue?.choices) break;
    await page.keyboard.press('e');
    await sleep(900);
  }
  await page.keyboard.press('e'); // finish typing so the choices are shown
  await sleep(600);
  const s4 = await st();
  check('dialogue offers choices', s4.dialogue?.choices === 3, `choices=${s4.dialogue?.choices}`);
  await page.screenshot({ path: `${OUT}/03-dialogue.png`, timeout: 120000 });
  await page.keyboard.press('3');
  await sleep(800);
  check('choice sets a flag', (await st()).flags.tilde_quiet_ghost === true);
  for (let i = 0; i < 24 && (await st()).mode === 'dialogue'; i++) {
    await page.keyboard.press('e');
    await sleep(700);
  }
  check('dialogue closes', (await st()).mode === 'playing');

  // camera: zoom button, mouse wheel, free camera
  {
    const c0 = (await st()).cam;
    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    await zoomOut.dispatchEvent('pointerdown');
    await sleep(1500);
    await zoomOut.dispatchEvent('pointerup');
    const c1 = (await st()).cam;
    check('zoom button zooms out', c1.distance > c0.distance + 1, `distance ${c0.distance.toFixed(1)} → ${c1.distance.toFixed(1)}`);
    await page.mouse.move(600, 400);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -300); await sleep(150); }
    await sleep(500);
    const c2 = (await st()).cam;
    check('mouse wheel zooms in', c2.distance < c1.distance - 1, `distance ${c1.distance.toFixed(1)} → ${c2.distance.toFixed(1)}`);
    await page.getByRole('button', { name: 'Free camera' }).click();
    await sleep(500);
    const p0 = (await st()).player;
    const f0 = (await st()).cam;
    await page.keyboard.down('w');
    await sleep(2500);
    await page.keyboard.up('w');
    const f1 = (await st()).cam;
    const p1 = (await st()).player;
    const camMoved = Math.hypot(f1.x - f0.x, f1.z - f0.z);
    const plMoved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    check('free camera moves without the player', f1.free && camMoved > 1.5 && plMoved < 0.5, `camera ${camMoved.toFixed(1)} m, player ${plMoved.toFixed(2)} m`);
    await page.keyboard.press('f');
    let back = false;
    for (let i = 0; i < 10 && !back; i++) {
      await sleep(400);
      back = (await st()).cam.free === false;
    }
    check('F returns the camera to the player', back);
  }

  // night & the village
  await page.evaluate(() => {
    window.__threnod.setHour(22.5);
    window.__threnod.teleport(40, 6, -Math.PI / 2);
  });
  await sleep(800);
  await page.screenshot({ path: `${OUT}/04-candlewick-night.png`, timeout: 120000 });
  await page.evaluate(() => {
    window.__threnod.setHour(13);
    window.__threnod.teleport(-10, -26, Math.PI);
  });
  await sleep(800);
  await page.screenshot({ path: `${OUT}/05-lake-day.png`, timeout: 120000 });

  await page.keyboard.press('Escape');
  await sleep(800);
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
  await page.addInitScript(() => localStorage.setItem('threnod.settings', JSON.stringify({ quality: 'low' })));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__threnod, null, { timeout: 15000 });
  await page.evaluate(() => localStorage.removeItem('threnod.save'));
  await page.getByRole('button', { name: 'New Game' }).tap();
  await new Promise((r) => setTimeout(r, 400));
  for (let i = 0; i < 4; i++) {
    if (await page.locator('.prologue:not(.hidden)').count()) await page.locator('.prologue').tap();
    await new Promise((r) => setTimeout(r, 300));
  }
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
  await page.screenshot({ path: `${OUT}/06-ipad-stick.png`, timeout: 120000 });
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
  await sleep(1000);
  const btn = page.locator('.action-btn');
  check('touch action button appears', await btn.isVisible(), await btn.textContent());
  await sleep(4000);
  await btn.tap();
  await sleep(2500);
  check('tapping the action button talks', (await st()).mode === 'dialogue');
  await page.screenshot({ path: `${OUT}/07-ipad-dialogue.png`, timeout: 120000 });
  check('no JavaScript errors (touch)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots: e2e/out/`);
process.exit(failed ? 1 : 0);
