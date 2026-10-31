// Renders the map in two VGA-resolution (640x480) layers for the retro look:
//   <outDir>/art.png    – the map without any text
//   <outDir>/labels.png – only the text, set in pixel fonts, transparent background
// Then run retro_compose.py to dither, outline and upscale.
// Usage: node render_retro.js <map.html> <outDir>
const { chromium } = require('playwright');
const path = require('path');

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Jacquarda+Bastarda+9&family=Pixelify+Sans:wght@400;600&display=block" rel="stylesheet">';

const ART_CSS = `svg text { visibility: hidden; }`;
const LABEL_CSS = `
  html, body { background: transparent !important; }
  svg * { visibility: hidden; }
  svg text, svg text * { visibility: visible; }
  svg text { stroke: none !important; fill: #2a160b !important; letter-spacing: 0 !important; }
  .region { font-family: 'Jacquarda Bastarda 9' !important; font-size: 45px !important; }
  .title  { font-family: 'Jacquarda Bastarda 9' !important; font-size: 67.5px !important; }
  .legend text { font-size: 25px !important; }
  .sub, .place, .small { font-family: 'Pixelify Sans' !important; font-style: normal !important; font-size: 27.5px !important; }
  .sub { fill: #5a2a14 !important; }
`;

(async () => {
  const [inFile, outDir] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(inFile));
  await page.evaluate((f) => document.head.insertAdjacentHTML('beforeend', f), FONTS);

  const style = await page.addStyleTag({ content: ART_CSS });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.locator('svg').screenshot({ path: path.join(outDir, 'art.png') });

  await style.evaluate((el) => el.remove());
  await page.addStyleTag({ content: LABEL_CSS });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.locator('svg').screenshot({ path: path.join(outDir, 'labels.png'), omitBackground: true });

  await browser.close();
  console.log('rendered layers to', outDir);
})();
