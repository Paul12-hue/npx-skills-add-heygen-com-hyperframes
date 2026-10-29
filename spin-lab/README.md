# SPIN LAB — The Science of Impossible Spin

Ein 3D-Tischtennis-Physik-Arcade-Spiel für den Browser. Optimiert für das iPad (Touch, Querformat), spielbar auch mit Maus am Desktop. Kein Server, kein Login, keine externen APIs: alles läuft lokal im Browser.

## Starten

```bash
cd spin-lab
npm install
npm run dev            # Entwicklungsserver (auch im LAN erreichbar, z. B. fürs iPad)
npm run build          # Produktions-Build nach dist/
npm run build:single   # eine einzige, eigenständige HTML-Datei nach dist-single/index.html
npm run preview        # den Build lokal ansehen
npm run solve          # QA: prüft per Brute-Force, dass jedes Level lösbar ist
```

`dist-single/index.html` enthält Code, Schriften und Styles in einer Datei. Die Datei lässt sich auf jeden statischen Webspace legen und auf dem iPad in Safari öffnen.

## Steuerung

| Aktion | Touch / Maus |
| --- | --- |
| Schlagen | Auf dem Spielfeld **nach oben wischen**. Die Länge bestimmt die Kraft, die Richtung den Winkel. |
| Spin | Rechts unten den **Treffpunkt am Ball** wählen: oben = Topspin, unten = Unterschnitt, links/rechts = Kurve. |
| Substanz | In *Chemical Chaos* unten eine Substanz antippen. |
| Pause | Pause-Knopf oder `Esc` |
| Ton | Lautsprecher-Knopf oder `M` |

Ein kurzes Antippen löst keinen Schlag aus, erst ein echter Wisch nach oben.

## Inhalt

- **Intro**: eine kurze Kamerafahrt (ca. 7 s, überspringbar) mit Lichtlinie, Partikeln im Lichtkegel, dem Ball und dem Labor, das sich einschaltet.
- **Hauptmenü**: Experiment starten (Kampagne), Challenges, High Scores, Das Labor (Rundgang + freies Training), Einstellungen.
- **01 The Perfect Spin**: ein wanderndes Zielfeld; perfekte Treffer lösen eine Zeitlupe aus.
- **02 Chemical Chaos**: vier fiktive Substanzen mit eigenen Regeln:
  - *Liquid Nitro*: +50 % Tempo, stärkerer Spin
  - *Magnetic Gel*: zieht den Ball seitlich zum Ziel
  - *Super Bounce*: Restitution 1,4
  - *Quantum Dust*: tunnelt durch Hindernisse und kippt den Seitenspin am Netz

  Jede Probe ist nur mit der passenden Substanz lösbar (per Solver geprüft).
- **03 Gravity Breaker**: Die Gravitation wechselt im Takt (1 g → 0,25 g → 2,6 g → −0,4 g). Die Zeitleiste oben zeigt, was als Nächstes kommt.
- **04 The Impossible Rally**: fünf Prüfungen am Stück mit wachsendem Multiplikator.
- **05 Der unmögliche Schlag**: Das Ziel liegt direkt hinter einem Monolithen. Der Ball muss mit starkem Seitenspin um ihn herumkurven. Nur ein echter Treffer löst die Finalsequenz aus. Nach mehreren Fehlversuchen hilft DR. SPIN mit Tipps und einer längeren Flugbahn-Vorschau.
- **DR. SPIN**: ein sarkastischer Forschungsroboter mit animiertem Display-Gesicht, situationsabhängigen Sprüchen (ohne Wiederholung) und optionaler Sprachausgabe des Geräts.

## Technik

- TypeScript, Vite, Three.js (WebGL). Kein UI-Framework, die Oberfläche ist reines DOM/CSS.
- **Physik** (`src/physics/ballPhysics.ts`): eine eigene, deterministische Simulation mit 480 Schritten pro Sekunde. Sie rechnet Gravitation, quadratischen Luftwiderstand, Magnus-Kraft (ω × v), Spin-Abklingen, Reibungsimpuls beim Aufprall mit Spin-Übertragung (Hohlkugel, I = ⅔ m r²), Netz und Netzkante, Hindernisse (AABB) und den Boden. Jeder Schlag wird beim Abschlag komplett vorausberechnet und dann abgespielt. Deshalb reagieren Zeitlupe und Finalkamera auf das tatsächliche Ergebnis.
- **Grafik**: prozedurale Geometrie und Canvas-Texturen (keine Bilddateien), eigene Shader (Lichtkegel, Zielfelder, Plasmaglas, Schockwellen, Gravitationsraster, Partikel, Ballspur), PBR-Materialien, weiche Schatten, Bloom und Color-Grading. Die Qualität passt sich an: Auf Touch-Geräten startet sie auf „Mittel“ und wird bei niedriger Framerate automatisch reduziert (Pixel-Ratio, Bloom, Schattenauflösung, Partikelbudget).
- **Audio**: vollständig mit der Web Audio API synthetisiert, inklusive prozeduralem Hall. Es gibt keine Audiodateien.
- **Speicher**: Highscores und Einstellungen liegen im `localStorage`. Ist er nicht verfügbar, läuft das Spiel mit einer reinen Sitzungswertung weiter.
- **Assets**: Schriften *Barlow Condensed* und *IBM Plex Mono* (SIL Open Font License) über `@fontsource`. Alles andere ist selbst erstellt.

## Struktur

```
src/
  config.ts              Maße, Farbpalette, Substanzen
  physics/               Ballsimulation, Schlag-Mapping
  game/                  Spielablauf (Game.ts), Level (experiments.ts), Dialoge, Speicher
  render/                Renderer & Post-FX, Labor, Ball, Effekte, DR. SPIN, Kamera
  audio/Sound.ts         Synthesizer
  input/Gesture.ts       Wisch-Eingabe und Spin-Pad
  ui/                    DOM-Helfer und Styles
tools/solve.ts           Level-Solver (QA)
```

Testmodus: Mit `?test` an der URL läuft die Spielschleife nicht automatisch, sondern wird über `window.__spin.step(sekunden)` vorgespult. So lassen sich automatisierte Screenshots machen.
