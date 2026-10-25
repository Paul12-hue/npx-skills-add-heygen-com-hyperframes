---
name: was-waere-wenn
description: Creates a vertical TikTok video "Was wäre, wenn …?" for this creator — German on-screen text, low-poly 3D scene in Three.js, HUD counter and italic captions, built entirely in code with HyperFrames and rendered to MP4. Use whenever the user asks for a new video, a new topic, a "what if" scenario or changes to an existing video in this repo.
---

# Was-wäre-wenn videos (TikTok, German)

The creator makes "What if…?" videos in the style of @man_ia_c, @then.what.animation and @ifinity3d.
Every video is **German**, built **entirely in code** with HyperFrames + Three.js, and must look like the
references. Exact look: `references/style-guide.md`. Working template: `videos/01-sonne-erlischt/index.html`.

## Non-negotiables

- **Language:** all on-screen text in German (hook, HUD, captions, outro). Correct umlauts (ä ö ü ß), German number
  format (`1.000.000`, `−17 °C` with a real minus sign U+2212, a space before °C), German time units
  (Stunde, Tag, Woche, Monat, Jahr).
- **No voiceover, no music in the render.** The creator adds the TikTok sound in the app. Text carries the story.
- **Format:** 1080×1920, 30 fps, 60–80 s.
- **Facts:** every number in a caption must hold up physically and scientifically. If unsure, phrase it more
  cautiously ("im Schnitt", "nach Schätzungen") instead of inventing a number.
- **No logos, watermarks or creator handles** in the video; TikTok adds its own.

## Workflow

1. **Topic.** If the user names none: pick a "Was wäre, wenn …?" with a strong first second, an exponential
   escalation, a twist and an ending. Present it to the user in 2–3 sentences (no long survey) and start building.
   Already done: `videos/*/` (check them, no repeats).
2. **Story beat by beat** (see "Structure" below), write it as `SPEC.md` in the project folder:
   every caption with second and HUD value.
3. **Project:** copy `videos/01-sonne-erlischt/` to `videos/NN-<slug>/` (with `assets/fonts/`, without `.hyperframes/`
   and `renders/`), adjust `meta.json`/`package.json` names. Rewrite the scene in `index.html`, but keep the
   framework intact (see "Technical framework").
4. **Check:** `cd videos/NN-<slug> && npx hyperframes check --json` → 0 errors. Expected warnings, ignore them:
   `film_silent`, `text_below_floor` (HUD labels are deliberately small), `dead_stretch` on 3D-only motion,
   `composition_file_too_large`, `timeline_track_too_dense`, `nested_structure_needs_subcomposition`.
5. **Look:** `npx hyperframes snapshot --at <8–10 key seconds>` and look at the contact sheet. Check:
   is the 3D scene readable at night/in the dark (never pure black), does the HUD value match the caption,
   do text and objects not collide, are particles not giant squares in front of the camera.
   Fix and look again until it is right.
6. **Render** with the fast renderer (below), never with `npx hyperframes render` – without a GPU it needs
   ~15 s per frame.
7. **Check the result:** sample 6–8 frames from the MP4 (`ffmpeg … select`), look at them,
   then send it with `SendUserFile` (status `normal`, `display: render`).
8. **Commit + push** (without `renders/`, `.hyperframes/`).

## Structure (always the same)

| Section | Time | Content |
| --- | --- | --- |
| Hook | 0–3.4 s | `Was wäre, wenn <Schlüsselwort in Akzentfarbe> …?` in the upper third over the running scene. Frame 0 is the thumbnail. |
| Setup | 3.5–6 s | Calm everyday scene + place: *"Du bist in Berlin. Mittag, 24 Grad."* HUD counts down to the event. |
| Event | ~6 s | The "what if" happens. Often: first nothing happens (the twist builds suspense). |
| Escalation | 6–50 s | One camera position that slowly transforms. A new caption every 3.5–4.5 s, HUD jumps exponentially. |
| Climax | ~45–55 s | Most extreme image, camera pulls back / cut through black to a big scale (Earth, space). |
| Twist / ending | ~55–66 s | Return, nature takes over, or life survives somewhere. |
| Outro | 66–72 s | `#161616` card, hook question centred, below it a tiny summary line in capitals with `·`. |

Captions: 3–8 words, dry, laconic, present tense, second person ("Du merkst: nichts."), concrete comparisons
("8 Meter: höher als ein Haus."). Each caption holds 3–4.5 s, fades in and out in 0.4 s, and never moves while it is read.

HUD (left, top at 820 px): label in capitals (Inter 700, 24 px, 0.22em) → large value (EB Garamond, 80 px)
→ subline in capitals (Inter 400, 24 px). The label changes at the turning point
("SONNE ERLISCHT IN" → "SONNE AUS SEIT"). The value is a pure function of the video time.

## Look (summary, details in `references/style-guide.md`)

- Low-poly 3D: `flatShading`, box buildings with a window texture, icosahedron trees, simple figures
  (box body + head), faceted landscapes. Soft shadows, fog for depth.
- Mood by changing colour instead of cutting: day blue → night navy with stars → frost blue-white → teal under water.
  A night is dark but readable (hemisphere light ≥ 0.75 in navy blue, never pure black).
- At most 1–2 cuts through black (0.6–0.9 s) for scale jumps.
- Bloom only on light sources (threshold ≥ 0.8); particles (snow, stars, smoke) small and round (`map: glowTex`).
- Type: EB Garamond (hook 66 px, captions 48 px italic, outro 64 px), Inter for labels. Text white with a soft
  shadow. Accent colour only on the hook keyword (matching the topic: warm `#F2C46B`, cold `#8DB8E8`).
- Text zones (TikTok UI): nothing important above 168 px or below 1330 px, nothing on the right edge under the action bar.

## Technical framework (do not change)

From `videos/01-sonne-erlischt/index.html`:

- Root `#root` with `data-composition-id="main"`, `data-duration`, 1080×1920. Every text block is an element with
  `class="clip"`, `data-start`, `data-duration` written in the HTML (Studio-editable).
- Fonts via `@font-face` from `assets/fonts/` (EB Garamond 400 normal/italic, Inter 400/700).
- A classic script builds the paused GSAP timeline (caption fades, scene changes via `#fade`), registers
  `window.__timelines["main"]` and listens to `hf-seek` → `tl.totalTime(t, true)` + `window.__renderAt(t)`.
- A module script (Three.js 0.181.2 via importmap from jsdelivr, EffectComposer + UnrealBloomPass + OutputPass)
  builds every scene once and sets `window.__renderAt(t)`: **a pure function of t**. No `Math.random()`
  (only `mulberry32(seed)`), no `Date.now()`, no `requestAnimationFrame`, no state carried between frames
  (particles: position = f(start value, t) with modulo).
- Several scenes = several `THREE.Scene`s; `renderAt` picks one by t and sets `renderPass.scene`.
- WebGL canvas at `SCALE = 0.75` and stretched by CSS to 1080×1920 (text stays sharp as DOM).
- `window.__hf.buildReady["main"]` waits for fonts and warms up shaders.
- Helpers in the template: `keys(t, [[t,v],…])` for piecewise interpolation, `smooth`, `ramp`, `mixCol`,
  `canvasTex` for procedural textures, `makeStars`, `glowTex`.

## Rendering (fast, without a GPU)

```bash
cd videos/NN-<slug> && (python3 -m http.server 8765 >/dev/null 2>&1 &)
S=<scratchpad>/seg && mkdir -p $S && cd ../../tools   # tools/node_modules -> /opt/node22/lib/node_modules (symlink, for playwright)
F=$((DURATION*30)); Q=$((F/4))
for i in 0 1 2 3; do node render-frames.cjs http://localhost:8765/index.html $S/s$i.mp4 $((i*Q)) $(( i==3 ? F : (i+1)*Q )) > $S/log$i.txt 2>&1 & done; wait
printf "file 's0.mp4'\nfile 's1.mp4'\nfile 's2.mp4'\nfile 's3.mp4'\n" > $S/list.txt
ffmpeg -y -f concat -safe 0 -i $S/list.txt -c copy -movflags +faststart ../videos/NN-<slug>/renders/NN-<slug>.mp4
```

`tools/render-frames.cjs` sets clip visibility the way the HyperFrames runtime does, dispatches `hf-seek` per frame,
takes screenshots as JPEG and pipes them into ffmpeg (x264, CRF 17). Start the server on a different port if 8765 is taken.
Run the render in the background (`run_in_background`) and tell the user it is running.
