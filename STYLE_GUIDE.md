# Style Guide – "What if…?" Videos

Analysed from 3 reference videos (576×1024, 30 fps, 64–96 s):
- Electrons vanish for 5 s (Central Park)
- It rains for 1000 years (NYC avenue)
- Every jump twice as high (city → space → Moon)

## Format
- 9:16 vertical, 1080×1920 export, 30 fps
- 60–95 s total
- No voiceover: the story is told entirely through on-screen text + music/ambient sound

## Structure
1. **Hook (0–3 s):** question in a large serif font in the upper third, over the already running scene.
   `What if <keyword in light blue> …?` – stays for about 3 s, then fades out softly.
2. **Setup (3–7 s):** normal, peaceful everyday scene (park, street). Location caption: *"You're in Central Park, New York."*
3. **Escalation (main part):** one fixed camera position or slow camera move; the scenario gets worse step by step.
   Every 3–5 s: a new caption + the HUD counter moves on. Time or scale grows exponentially
   (Hour 1 → Day 7 → Month 3 → Year 1,040 / 3 m → 420 km → 379,194 km).
4. **Climax:** most extreme image (Earth turns into a star, city deep underwater, Moon).
5. **Resolution/twist:** state returns or nature takes over (*"What is left belongs to the forest."*).
6. **Outro (~4 s):** dark grey screen (#161616), hook question centred again + a tiny spaced-out summary line
   (`1,000 YEARS OF RAIN · 300 YEARS TO DRAIN · ONE AVENUE`).
7. TikTok end card (added automatically by TikTok, not part of the render).

## HUD (left, at ~45 % of the height)
```
RAINING                          ← tiny, sans-serif, uppercase, wide letter spacing, ~60 % white
Day 7                            ← large serif (EB Garamond / Cormorant), white
WATER 0.9 M ABOVE THE STREET     ← tiny, sans-serif, uppercase, letter-spaced
[● NEXT JUMP ×2]                 ← optional: small dark pill with a red dot
```
- Counter values change every frame (millisecond timer `0:04.913`) or in steps (Hour/Day/Year)
- The label changes at the turning point (`ELECTRONS DISAPPEAR IN` → `ELECTRONS RETURN IN` → `ELECTRONS BACK`;
  `RAINING` → `RAIN STOPPED`)

## Captions (narrative)
- Centred, at ~65 % of the height, serif **italic**, white, small (~28 px at 1080 width), soft shadow
- 1 short sentence, 4–8 words, laconic and dry: *"Sorry about the car."*, *"New Yorkers adapt. They always do."*
- Fade in/out (~0.4 s), each line stays 3–5 s
- Concrete comparisons for scale: *"8 metres: higher than a house."*, *"Past the Space Station."*

## Visual style
- 3D **low-poly** / stylised (simple box buildings, faceted trees, figures without detail)
- Soft global lighting, atmospheric depth (fog), muted colours
- Scene shifts in colour mood instead of cuts: rain = grey-green, underwater = teal, X-ray/charge = white-blue wireframe on black,
  space = black with stars
- Few cuts – mostly one continuous shot that morphs
- Effects: particles (rain, stars, sparks), bloom/glow, light shake on impacts, motion blur on fast moves

## Typography
- Serif: EB Garamond (or Cormorant Garamond) – hook, counter, captions
- Sans: Inter / Helvetica – tiny uppercase labels, letter-spacing ~0.2em
- Accent colour for the hook keyword: light blue `#8DB8E8`
