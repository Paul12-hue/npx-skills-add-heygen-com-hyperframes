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
  render/RetroRenderer.ts Niedrige Auflösung + 32-Farben-Palette + Bayer-Dithering (Shader)
  render/palette.ts       Die Twilight-Retro-Palette (identisch mit der Weltkarte)
  world/terrain.ts        Gelände von Hollowmere Vale (Höhenfunktion, Seen, Wege)
  world/props.ts          Prozedurale Low-Poly-Objekte (Häuser, Gräber, Bäume …)
  world/World.ts          Aufbau der Testwelt, Kollisionen, interaktive Orte, Licht
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
- **iPad:** linke Bildschirmhälfte = Bewegungs-Stick, rechte Hälfte wischen = Kamera, runder Knopf = Interagieren, ❙❙ = Pause
- **PC:** WASD/Pfeile, Shift = rennen, Maus ziehen = Kamera, E/Enter = Interagieren, 1–4 = Antwort wählen, Esc = Pause, T = eine Stunde vorspulen (Test)
- **Controller:** linker Stick bewegen, rechter Stick Kamera, A = Interagieren, Start = Pause
