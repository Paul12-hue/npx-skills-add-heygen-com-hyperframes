// Turns the Vite build (dist/) into a private claude.ai test page (artifact/).
// The artifact host wraps the page in its own <html>/<head>/<body>, so we keep
// only the inner content: title, fonts, inlined CSS and the module script.
// Usage: npm run build && node scripts/make-artifact.mjs
import { readFile, writeFile, mkdir, rm, copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const dist = 'dist';
const out = 'artifact';
await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'assets'), { recursive: true });

const html = await readFile(join(dist, 'index.html'), 'utf8');
const cssHref = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"/)?.[1];
const jsSrc = html.match(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/)?.[1];
if (!cssHref || !jsSrc) throw new Error('could not find built css/js in dist/index.html');
const css = await readFile(join(dist, cssHref), 'utf8');

for (const f of await readdir(join(dist, 'assets'))) {
  if (f.endsWith('.js')) await copyFile(join(dist, 'assets', f), join(out, 'assets', f));
}

const page = `<title>THRENOD</title>
<meta name="theme-color" content="#120a05">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jacquarda+Bastarda+9&family=Pixelify+Sans:wght@400;600&display=swap">
<style>
:root { color-scheme: dark; }
${css}
</style>
<canvas id="view"></canvas>
<div id="ui"></div>
<div id="fatal"></div>
<script type="module" src="./${jsSrc}"></script>
`;
await writeFile(join(out, 'index.html'), page);
console.log('artifact page:', join(out, 'index.html'), '+', jsSrc);
