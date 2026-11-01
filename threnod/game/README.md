# THRENOD – Spielcode

Three.js + TypeScript + Vite. Läuft im Browser auf iPad (Safari) und PC.

## Befehle
| Befehl | Zweck |
|---|---|
| `npm install` | Abhängigkeiten installieren |
| `npm run dev` | Entwicklungsserver (auch im lokalen Netzwerk erreichbar) |
| `npm test` | Unit-Tests (Dialoge, Bewegung, Speichern, Welt, Palette) |
| `npm run build` | Typprüfung + Produktions-Build nach `dist/` |
| `npm run smoke` | Browser-Test in Chromium (Desktop + simuliertes iPad-Touch), Screenshots in `e2e/out/`. Vorher `npm run build`. |
| `npm run artifact` | Baut die private Testseite nach `artifact/` |

## Struktur
```
src/
  main.ts                 Start, WebGL-Prüfung, Fehleranzeige
  core/Game.ts            Spielschleife, Modi (Titel, Spielen, Dialog, Pause), Speichern
  render/Renderer.ts      WebGL, Bloom, Farbabstimmung, Qualitätsstufen
  render/textures.ts      Prozedurale Texturen (Erde, Stein, Holz, Schindeln …) mit Bump-Maps
  world/terrain.ts        Gelände von Hollowmere Vale (Höhenfunktion, Seen, Wege), in Kacheln
  world/props.ts          Prozedurale Objekte mit eingebackener Umgebungsverdeckung
  world/World.ts          Aufbau der Welt, Siedlungen, Kollisionen, Licht-Pool (6 echte Lichter)
  world/Population.ts     Bewohner: Namen, Tätigkeiten, Wege, Sätze
  world/Creatures.ts      Tiere (eine Instanz-Gruppe pro Art, Beine im Vertex-Shader)
  character/sculpt.ts     Figuren aus weichen Grundformen → Mesh (läuft im Web Worker)
  character/SculptService.ts  Hintergrund-Bau der Figuren, Cache, Ersatz ohne Worker
  world/Sky.ts            Tageszeit, „Long Vesper“-Himmel, Sterne, Hesper
  player/                 Spielfigur, Bewegung (reine Logik in movement.ts)
  camera/                 Third-Person-Kamera
  input/                  Tastatur/Maus, Touch (virtueller Stick), Controller
  interaction/            Ziel-Auswahl („E · Read“), Ortsnamen
  dialogue/Dialogue.ts    Datengetriebene Dialoge mit Entscheidungen und Flags
  data/dialogues.json     Alle Dialogtexte (englisch)
  save/Save.ts            Spielstand + Einstellungen (localStorage, fehlertolerant)
  ui/                     Titel, HUD, Dialogbox, Pause, Einstellungen
tests/                    Vitest-Unit-Tests
e2e/smoke.mjs             Automatischer Browser-Test
```

## Steuerung
- **iPad:** linke Hälfte = Bewegungs-Stick · rechte Hälfte wischen = Kamera drehen und neigen · zwei Finger rechts auseinander/zusammen = Zoom · „View“ = Kamera-Voreinstellung (Schulter / Klassisch / Von oben) · „Jump“ = springen · runder Knopf = Interagieren · ❙❙ = Pause
- **PC:** WASD/Pfeile, Shift = rennen, Leertaste = springen, Maus ziehen = Kamera, Mausrad = Zoom, V = Ansicht wechseln, E/Enter = Interagieren, 1–4 = Antwort wählen, Esc = Pause, T = eine Stunde vorspulen (Test)
- **Controller:** linker Stick bewegen, rechter Stick Kamera, Trigger = Zoom, A = Interagieren, B = springen, Y = Ansicht, Start = Pause
- **Kamera-Leiste (rechts, alle Geräte):** + / − zoomen · ⟲ ⟳ drehen · ▲ ▼ neigen (gedrückt halten) · „Free“ = freie Kamera: der Stick bzw. WASD bewegt die Kamera über die ganze Karte, die Figur bleibt stehen · „Back“ = zurück zur Figur
- **Kamera per Tastatur:** Z/X zoomen, Q/R drehen, Bild↑/Bild↓ neigen, C = freie Kamera an/aus, F = zurück zur Figur

## Leistung (Build 12)
Gemessen im Headless-Chromium (Software-Rendering, also nur Vergleichswerte, keine iPad-Zahlen):
- Dreiecke pro Bild am Start: 1,44 Mio → 0,68 Mio (Figuren mit Detailstufen, Gelände und Objekte in Kacheln)
- Punktlichter: 25 → 9 (Licht-Pool: nur die 6 nächsten Lampen/Feuer leuchten wirklich)
- Figuren werden im Hintergrund (Web Worker) gebaut; Start bis Titelbild ≈ 2,5–4,5 s im Test
- `node e2e/perf.mjs medium` gibt die Werte für mehrere Orte aus
