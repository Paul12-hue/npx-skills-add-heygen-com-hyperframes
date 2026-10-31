// Quick look: renders given seconds and writes a contact sheet.
// Usage: node snap.cjs <url> <outDir> <t1,t2,...>
const { chromium } = require("playwright");
const [url, outDir, times] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("[page]", m.text()); });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => !!(window.__renderAt && window.__timelines && window.__timelines.main), null, { timeout: 180000, polling: 500 });
  await page.evaluate(async () => { await document.fonts.ready; const r = window.__hf && window.__hf.buildReady; if (r) await Promise.all(Object.values(r)); });
  for (const s of times.split(",").map(Number)) {
    const t0 = Date.now();
    await page.evaluate((time) => {
      document.querySelectorAll("[data-start][data-duration]").forEach((el) => {
        if (el.id === "root") return;
        const s = parseFloat(el.dataset.start), d = parseFloat(el.dataset.duration);
        el.style.visibility = time >= s && time < s + d ? "visible" : "hidden";
      });
      window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time } }));
    }, s);
    await page.screenshot({ path: `${outDir}/t${String(s).padStart(5, "0")}.jpg`, type: "jpeg", quality: 90 });
    console.log("t", s, (Date.now() - t0) + "ms");
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
