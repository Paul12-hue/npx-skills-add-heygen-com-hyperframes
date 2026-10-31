# THRENOD · Phase 5: Technische Grundlage

**Status:** 📝 Wartet auf Spieltest auf dem iPad
**Code:** `threnod/game/` (siehe `game/README.md`)

## Was gebaut wurde
| Bereich | Stand |
|---|---|
| Projekt | Three.js 0.180, TypeScript (strict), Vite 6, Vitest |
| Retro-Renderer | Interne Auflösung 270–720p (Standard 360p), 32-Farben-Palette + 4×4-Bayer-Dithering im Shader, Pixel-Hochskalierung |
| Welt | Testausschnitt Hollowmere Vale: Gelände mit Facetten, See mit „Lantern Under the Lake“, Candlewick (6 Häuser, Brunnen, Namenskerzen-Schrein mit 9. unentzündeter Kerze, Glockenturm ohne Seil, Laternen), Friedhof Saint Ebba's mit offenem Grab und Kapelle, Wegweiser, Eingang der Old Silver Mine, ~350 Kiefern (Instancing) |
| Tageszeit | 24 Echtzeit-Minuten pro Tag, Long-Vesper-Himmel, Sterne, Hesper, Fensterlicht + Laternen nachts |
| Spielfigur | Low-Poly-Platzhalter mit Lauf-/Atem-Animation, Blob-Schatten, Geländehaftung, Kollisionen, kein Tiefwasser, Talgrenze |
| Kamera | Third Person, Orbit, weicht Gelände aus |
| Steuerung | Touch (Stick + Kamerawischen + Aktionsknopf), Tastatur/Maus, Gamepad |
| Interaktion | 8 interaktive Orte + NPC Tilde |
| Dialoge | JSON-basiert, Entscheidungen, Flags, Bedingungen, alternative Starts, Schreibmaschinen-Effekt |
| UI | Titel, Ortsnamen-Einblendung, Prompt, Dialogbox, Pause, Einstellungen (Auflösung, Palette, Dithering, Kamera invertieren, Kameratempo, FPS) |
| Speichern | Autosave alle 30 s, beim Pausieren und beim Verlassen; „Continue“; fehlertolerant |

## Tests (selbst ausgeführt)
- 20 Unit-Tests: bestanden
- 18 Browser-Checks in Chromium (Desktop + simuliertes iPad mit Touch): bestanden
- **Nicht getestet:** echtes iPad/Safari, echte Bildrate, echter Controller, Darstellung innerhalb der claude.ai-Testseite

## Bewusst noch nicht enthalten
Audio/Musik, Kampf, Inventar, Quests, Mine von innen, Höhle, Händler – das ist Phase 6.
