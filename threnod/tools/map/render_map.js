// Renders the generated map HTML to a PNG with the pre-installed Playwright Chromium.
// Usage: node render_map.js <in.html> <out.png>
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const [inFile, outFile] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto('file://' + path.resolve(inFile));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.locator('svg').screenshot({ path: outFile });
  await browser.close();
  console.log('rendered', outFile);
})();
