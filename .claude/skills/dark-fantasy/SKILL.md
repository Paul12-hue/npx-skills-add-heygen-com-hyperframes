---
name: dark-fantasy
description: Creates a vertical (9:16) dark-fantasy TikTok video for this creator in the look of 1990s pre-rendered CGI fantasy games (CD-ROM era — glossy bump-mapped textures, saturated purple/green/orange, surreal dark fairy-tale), like the creator's reference videos. Keyframes are generated with Canva AI, animated in a WebGL shader (slow camera moves, glowing eyes/crystals/lanterns, fog, fireflies, sparks, fire flicker, lightning) and scored with a synthesised dark ambient bed. No text in the video. Use whenever the user asks for a new dark-fantasy / fantasy-world / medieval video or changes to one in fantasy/.
---

# Dark-fantasy videos in 90s-CGI look (TikTok, 9:16)

A short, wordless glimpse into a strange dark fairy-tale world that looks like a pre-rendered still from a
1990s CD-ROM fantasy game. Working example: `fantasy/01-schaedelberg/` (skull mountain → lich → swamp troll → dragon).

**Decided with the user (do not drift back):**
- No text in the video, ever (no title, captions, logo, handle).
- Not low-poly Three.js (that is the `was-waere-wenn` series) and not soft "AI oil painting": the user rejected
  both as too AI-looking. The target is the **90s-CGI render look** of the second reference video.

## Non-negotiables

- 1080×1920, 30 fps, 15–30 s (default 22 s), 4 shots of ~5–6 s.
- Frame 0 is the thumbnail and the hook: no fade-in, start on the strongest image (a face, glowing eyes, a creature).
- Calm camera: slow push-ins, tilts, drifts. Shots dissolve in ~0.5 s; no shake, no fast zooms.
- Original motifs. The references set the style only: never rebuild their scenes or characters (sun with a face,
  gnome on a mushroom, cauldron goblin, crowned demon, castle with a spiral sky…). No artist or game names in prompts.
- Sound: own synthesis only (`tools/music/dark_ambient.py`).

## Look

1990s pre-rendered CGI (Bryce/POV-Ray era): glossy, slightly plastic surfaces, bump-mapped procedural stone,
scales and bark, ray-traced reflections, chrome, glowing windows and lanterns, swirling skies, surreal scale
(skull mountains, giant mushrooms, dragons wrapped around towers). Palette: deep purple, electric blue/cyan,
toxic green, fiery orange, gold — saturated but in a dark night setting. Mood: eerie, whimsical, dark fairy-tale.
Every shot needs **light sources** (eyes, lanterns, crystals, runes, fire, lava) — the shader animates them.

## Workflow

1. **Concept** (if the user names none): 4 original shots — a big face/creature as hook → a character with magic
   → an atmospheric place with movement (water, fireflies) → an epic finale (dragon, giant, storm). Check
   `fantasy/*/SHOTS.md` to avoid repeats. Tell the user in 2 sentences and start.
2. **Keyframes with Canva AI** (`mcp__Canva__generate-image`, `aspectRatio: PORTRAIT_9_16`), all 4 started in parallel:
   > Vertical 9:16 still frame from a 1990s pre-rendered CGI fantasy adventure game (CD-ROM era), early 3D render,
   > glossy bump-mapped procedural textures, ray-traced lighting. `<scene: subject, setting, light sources, water/fog>`.
   > Saturated `<3–4 colours>`. Surreal dark fairy-tale, `<mood>`, no text, no watermark.

   Poll with `get-generate-image-job` and look at each one. **Quota:** usually only ~3 generations go through at
   once (`quota_exceeded`); retry the failed one a minute later, tell the user if it stays blocked.
3. **Full-resolution download** (results come as 112 px previews; asset URLs are signed, Canva renders ~944×1680):
   reuse the helper design `DAHZlVhTjBY` ("Four-page TikTok video canvas", 4 pages 1080×1920) —
   `read-design` with `open_transaction` → `edit-design` `update_fill` on each page (locator = page id) →
   `commit` → `export-design` `{type: png, width: 1080, height: 1920, export_quality: pro}` → `curl` →
   `ffmpeg -q:v 2` to `assets/img/s1..s4.jpg`. (If it is gone, create one with `create-design`, format "TikTok Video".)
4. **Project:** copy `fantasy/01-schaedelberg/` to `fantasy/NN-<slug>/` (without `renders/`, `assets/img`,
   `assets/bgm`), set names in `meta.json`/`package.json` and the `<audio src>`. Only edit the `SHOTS` array:
   - `t0/t1` (neighbours overlap ~0.5 s), camera `z0→z1`, `c0→c1` (image coords, y down), `r0→r1`.
     **Edge rule:** for every endpoint `c ± 0.5/z` must stay inside 0..1, otherwise the border smears.
   - `fog`, `fog2` `[yTop, yBottom, density, drift]` + `fogCol`; `shimmer` `[xFrom, yTop, yBottom, strength]` for water;
   - `flick` (warm lights: fire, candles), `glow` (pulse of saturated emissive pixels: eyes, crystals, runes);
   - `parts` `[type, amount, spores]` — 0 snow, 1 rising sparks/embers, 2 dust in light shafts, 3 fireflies/wisps —
     and `pcol` (particle colour); `flash` lightning times.
5. **Music:** `python3 tools/music/dark_ambient.py assets/bgm/<slug>.wav <dur> --cuts <dissolve mids> --bells <s>
   [--thunder <s>]` (needs `pip install scipy numpy`). Check `ffmpeg -i x.wav -af ebur128=peak=true -f null -`
   (≈ −16/−17 LUFS, peak < −1 dBFS); say it was measured, not heard.
6. **Look:** `python3 -m http.server 8765` in the project (start it with `nohup … &` on its own line; never `pkill -f`
   a pattern that also appears in your own command — it kills your shell), then
   `node tools/snap.cjs http://localhost:8765/index.html <scratch>/snap 0,3,5.85,8,11.15,14,16.35,18,20,21.5`
   (~1.5 s per frame) and tile with ffmpeg `xstack`. Check: image upright, no smeared borders, glow/flicker only on
   light sources, particles small, dissolves short.
7. **Render** (background): `tools/render-frames.cjs` in 4 parallel segments, concat, mux audio:
   `ffmpeg -i video.mp4 -i assets/bgm/<slug>.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart out.mp4`.
8. **Check + deliver:** sample 6 frames of the MP4, look, send with `SendUserFile` (`display: render`).
   Commit + push (without `renders/`).

## Technical framework (`fantasy/01-schaedelberg/index.html`)

- `#root` `data-composition-id="main"`; `#stage` clip with one WebGL canvas 1080×1920; `<audio id="bgm" class="clip">`.
- Paused GSAP timeline only carries time; `hf-seek` → `window.__renderAt(t)`, a pure function of t
  (hash noise, grain seeded by frame number; no `Math.random`/`Date.now`).
- Textures are uploaded without `UNPACK_FLIP_Y`, so sample with image coords (y down) directly.
- `SHOTS` is a global from the first script — do not redeclare it with `const` in the renderer script.
- One fragment shader per shot: camera transform + mild depth parallax, unsharp mask (keyframes are upscaled),
  emissive glow pulse, warm flicker, water shimmer, two fbm fog bands, lightning, screen-space particles,
  light saturation/contrast boost, vignette, grain. Dissolves: additive `(1−k)^1.6` / `k^1.6`.
