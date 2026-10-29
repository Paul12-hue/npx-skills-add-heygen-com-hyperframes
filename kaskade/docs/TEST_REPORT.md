# KASKADE – Testbericht (Stand 29.10.2026)

## Übersicht: implementiert, getestet, verifiziert

| Bereich | Implementiert | Automatisch getestet | Auf Gerät/Simulator verifiziert |
|---|---|---|---|
| Regeln (Wurf, Sieg, Remis, Kristalle, Energie) | ja | ja, 74 Unit-Tests auf Linux (lokal und GitHub Actions) | – |
| Fähigkeiten Anker, Geysir, Spalt inkl. Sonderfälle | ja | ja | – |
| KI (4 Stufen) | ja | ja (Legalität, Gewinn- und Abwehrzüge, Zeitbudget, Stärkeordnung) | – |
| Rücknahme, Neustart, Speichern/Laden, beschädigte Stände | ja | ja (Kernlogik) | – |
| Rätsel (5) und Tutorial (7 Schritte) | ja | ja (Solver beweist jede Lösung) | – |
| Fortschritt, XP, Erfolge, Freischaltungen | ja | ja | – |
| SwiftUI-App (alle Bildschirme, Animationen, Sound) | ja | **nein: nicht kompiliert** | **nein** |
| UI-Tests im iPad-Simulator (8 Abläufe) | geschrieben | **nicht ausgeführt** | **nein** |

**Wichtige Einschränkung:** Die Entwicklungsumgebung war ein Linux-Container ohne Xcode. SwiftUI-Code
lässt sich dort nicht übersetzen. Der vorbereitete GitHub-Actions-Job auf macOS hat in diesem
GitHub-Konto nie einen Runner zugeteilt bekommen (`runner_id: 0`, nach 15 Minuten in der
Warteschlange abgebrochen). Der Linux-Job desselben Workflows lief dagegen sofort. Die App-Schicht ist
deshalb sorgfältig gegengelesen, aber **noch nicht vom Compiler geprüft und nicht im Simulator gelaufen**.
Beim ersten Build in Xcode können noch Kompilierfehler auftreten.

## Unit-Tests (KaskadeCore)

`swift test`: **74 Tests, 0 Fehler**. Geprüft lokal (Swift 6.0.3, Ubuntu 24.04) und im GitHub-Actions-Job
`core-linux`.

| Suite | Tests | Inhalt |
|---|---|---|
| RulesTests | 15 | Arenen gültig, Schwerkraft, volle Spalte, alle Siegrichtungen, kein Umbruch über Spalten, Remis, Kristalle, Energiegrenze, Hindernisse, 8×7-Brett |
| AbilityTests | 18 | Energiekosten, Folgewurf-Pflicht, neutrale Steine, Geysir hebt Spalte, Geysir schenkt Gegner die Reihe (Niederlage), beide Reihen (Ziehender gewinnt), Kristall durch Anheben, Spalt, volles Brett |
| AITests | 7 | Nimmt Sofortgewinn, blockt Sofortverlust, nutzt Fähigkeiten zum Sieg, nur legale Züge in allen Arenen, Zeitbudget, Determinismus, höhere Stufe schlägt niedrigere |
| MatchTests | 12 | Rücknahme (Duell, gegen KI, mitten im Zug), Snapshot über JSON, beschädigte Stände abgelehnt, Neustart, Stein-IDs bei allen Zugarten |
| PuzzleTests | 4 | Jedes Rätsel hat einen erzwungenen Gewinn in N Zügen (nicht schneller), Fähigkeitsrätsel brauchen Fähigkeiten |
| ProgressionTests | 13 | Levelkurve, XP, Serien, Erfolge, Rücknahme halbiert XP, Freischaltungen, tolerantes Laden alter Dateien |
| TutorialTests | 4 | Jeder Skriptschritt ist legal, Gewinnschritte gewinnen, falsche Züge werden abgelehnt |
| FuzzTests | 1 | 1 500 Zufallspartien über alle Arenen, Invarianten nach jeder Aktion (keine Überlappung, Schwerkraft, Energie im Bereich, Partie endet) |

## KI-Stärke (Selbstspiel, `KaskadeSim`, echte Zeitbudgets, Seiten getauscht)

| Paarung | Partien | Gewinnrate der stärkeren Stufe |
|---|---|---|
| Stratege gegen Lehrling | 40 | 90 % |
| Meister gegen Stratege | 32 | 86 % (dazu 1 Remis) |
| Großmeister gegen Meister | 32 | 69 % |

Rechenzeit pro Zug auf einem x86-Kern: Lehrling und Stratege unter 0,05 s, Meister höchstens 0,12 s,
Großmeister ausgeschöpftes Budget von 2,0 s. Auf aktuellen iPads mit Apple-Silicon-Chip dürfte das
schneller sein, ist aber nicht gemessen.

## Balancing

Siehe Tabelle in `GAME_DESIGN.md` §4. Die gewählte Konfiguration (Sonne 0, Mond 1 Startenergie,
Anker 2) erreichte über 120 Meister-gegen-Meister-Partien **50 % : 50 %**.

## Offen

1. App in Xcode bauen und Kompilierfehler beheben (siehe Einschränkung oben).
2. UI-Tests ausführen: `xcodebuild … test` oder in Xcode ⌘U.
3. Auf einem echten iPad prüfen: Touch-Präzision, Animationen, Ton, Hoch- und Querformat, Split View.
