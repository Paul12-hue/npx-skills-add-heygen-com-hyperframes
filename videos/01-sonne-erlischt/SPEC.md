# SPEC – Was wäre, wenn die Sonne einfach ausgeht?

GOAL:    Viewers feel the eerie 8:20 delay, watch Berlin freeze step by step and end on the twist: life survives at the bottom of the sea.
OUTPUT:  HyperFrames, 1080 x 1920, 30 fps. Three.js canvas at 0.75 scale, DOM text at full resolution.
TIME:    72 s x 30 = 2160 frames. No voiceover; TikTok sound is added in the app.
LOOK:    Low-poly 3D (flat shading, faceted trees, box buildings) as in STYLE_GUIDE.md.
         Day: sky #6fa6d8 -> horizon #d4e3ec, sun #fff4d6. Night: sky #02040a, warm city glow on the horizon #2a1c12.
         Frost: ground #dfe7ef. Deep sea: #01141a with fog, vent #ff7a2a.
         Type: EB Garamond 64 px hook, 76 px counter, 46 px italic captions; Inter 600 22 px labels, tracking 0.22em.
         Accent: "Sonne" in #F2C46B, only in the hook and the outro.
OBJECTS: TV tower (shaft, steel sphere, red-and-white antenna), Spree with quay walls, park with picnic blankets,
         people, street lamps, apartment blocks with windows, sun disc, moon disc, stars, snow, Earth as an ice ball,
         seafloor vent with tube worms.
MOTION:  Camera on sine.inOut, slow push (2 m per 10 s); darkness 0.4 s; captions in 0.4 s, out 0.4 s.
SHOTS:
  0.0–6.0    Sunny park, hook + countdown "SONNE ERLISCHT IN"
  6.0–13.3   Nothing happens (8:20 delay), clock races to 00:08:20
  13.3       Sun goes out within 0.4 s -> night, stars, bright moon
  16.0       Moon goes dark
  20–45      Hour 1 -> year 1: city lights, frost, snow, trees die, the Spree freezes, lights go out
  44.6–49.5  Camera rises: frozen city all the way to the horizon
  50.5–55.6  Earth as a dark ice ball in space, −240 °C
  55.6–66    Under the ice down to a hydrothermal vent with tube worms
  66–72      Outro: dark grey card with the question and a summary line
BANNED:  Floating particles as decoration (snow and marine snow are story), HUD as decoration (it carries the story),
         logo, glowing rings.
QA:      Frames 2, 10, 14, 15, 22, 30, 38, 42, 48, 53, 62, 69 s.
