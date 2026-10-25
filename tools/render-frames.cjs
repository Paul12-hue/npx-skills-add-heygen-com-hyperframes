// Fast software-GL renderer for HyperFrames projects whose 3D runs on window.__renderAt.
// Seeks the page frame by frame, screenshots it and pipes JPEGs into ffmpeg.
// Usage: node render-frames.cjs <url> <out.mp4> <startFrame> <endFrame> [fps]
const { chromium } = require("playwright");
const { spawn } = require("child_process");

const [url, out, startArg, endArg, fpsArg] = process.argv.slice(2);
const start = parseInt(startArg, 10);
const end = parseInt(endArg, 10);
const fps = parseInt(fpsArg || "30", 10);

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => !!(window.__renderAt && window.__timelines && window.__timelines.main), null, { timeout: 180000, polling: 500 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const ready = window.__hf && window.__hf.buildReady;
    if (ready) await Promise.all(Object.values(ready));
  });

  const ff = spawn("ffmpeg", [
    "-y", "-v", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(fps), out,
  ], { stdio: ["pipe", "inherit", "inherit"] });

  const t0 = Date.now();
  for (let f = start; f < end; f++) {
    const t = f / fps;
    await page.evaluate((time) => {
      // clip visibility, as the HyperFrames runtime does it
      document.querySelectorAll("[data-start][data-duration]").forEach((el) => {
        if (el.id === "root") return;
        const s = parseFloat(el.dataset.start), d = parseFloat(el.dataset.duration);
        el.style.visibility = time >= s && time < s + d ? "visible" : "hidden";
      });
      window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time } }));
    }, t);
    const buf = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if ((f - start) % 60 === 0) {
      const done = f - start + 1;
      console.log(`[${start}-${end}] frame ${f} (${done}/${end - start}) ${((Date.now() - t0) / done / 1000).toFixed(2)} s/frame`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await browser.close();
  console.log(`[${start}-${end}] done`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
