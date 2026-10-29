# KASKADE – Architektur

```
kaskade/
├── Kaskade.xcodeproj        iPad-App-Projekt (Xcode 16+, synchronisierte Ordner)
├── KaskadeCore/             Swift Package: Regeln, KI, Fortschritt – ohne UI, plattformneutral
│   ├── Sources/KaskadeCore  Bibliothek (wird von der App eingebunden)
│   ├── Sources/KaskadeSim   Kommandozeilen-Selbstspiel für Balancing und KI-Stärkemessung
│   └── Tests/               74 Unit-Tests (XCTest), laufen auf macOS und Linux
├── KaskadeApp/              SwiftUI-App (Ansichten, Controller, Audio, Speicherung)
├── KaskadeUITests/          End-to-End-Tests im iPad-Simulator mit Screenshots
├── Support/Info.plist       Launchscreen-Farbe, Multitasking
├── docs/                    Design, Architektur, Testbericht
└── tools/make_icon.py       erzeugt das App-Icon reproduzierbar
```

## Schichten

| Schicht | Inhalt | Abhängigkeiten |
|---|---|---|
| **Regeln** (`GameState`, `Arena`, `Geometry`) | Bitboard-Zustand, Legalitätsprüfung, Zugausführung, Siegerkennung | keine |
| **KI** (`SearchEngine`, `Evaluator`) | Negamax + Alpha-Beta, iterative Vertiefung, Transpositionstabelle, Zeitlimit | Regeln |
| **Partie** (`Match`, `MatchSnapshot`, `PieceTracker`) | Historie, Rücknahme, Speichern/Laden mit Re-Validierung, stabile Stein-IDs für Animation | Regeln |
| **Inhalte** (`Puzzle`, `Solver`, `Tutorial`) | Rätsel mit exaktem Beweis-Solver, Tutorialskript | Regeln |
| **Fortschritt** (`Profile`, `Settings`, `Achievement`) | XP, Level, Freischaltungen, Statistik, tolerantes Decoding | Partie |
| **App-Modell** (`AppModel`, `GameController`, `Persistence`) | Navigation, Eingabevalidierung, KI-Threading, Sounds, Speicherung | Core |
| **Ansichten** (SwiftUI) | Bildschirme, Brett, Animationen | App-Modell |

Die Oberfläche ruft nie direkt in den Zustand hinein, sondern ausschließlich über `GameController`.
Jede Benutzeraktion wird dort zuerst mit `GameState.check(_:)` geprüft; ungültige Aktionen ändern nichts
und erzeugen nur Feedback (Text, Brett-Wackeln, Ton, Haptik).

## Wichtige Entscheidungen

1. **Bitboards (UInt64).** Ein Zustand ist ein Wertetyp fester Größe ohne Heap-Speicher. Die KI kopiert
   ihn pro Knoten günstig; Vierer-Erkennung braucht vier Shift-Operationen. Bretter bis 64 Bit
   (Spalten × (Reihen+1)) sind möglich – Weite (8×7) nutzt das voll aus.
2. **Fähigkeiten als eigene Aktionen.** Anker und Spalt setzen `awaitingFollowUpDrop`; der Folge-Wurf ist eine
   normale Aktion desselben Spielers. Dadurch bleibt die Regel-API einfach (`play(Move)`), Rücknahme und
   Speichern funktionieren aktion-genau, und die KI sucht Kombinationen ohne Sonderfälle.
3. **Speicherstände als Zugliste.** `MatchSnapshot` speichert Konfiguration + Züge. Beim Laden wird jeder Zug
   erneut validiert; ein manipulierter oder beschädigter Stand wird verworfen statt einen ungültigen Zustand
   zu erzeugen. Dateien werden atomar geschrieben, unlesbare Dateien beiseitegelegt (`.corrupt`).
4. **KI im Hintergrund.** Die Suche läuft in einem `actor AIWorker`. Ein Generationszähler verwirft veraltete
   Ergebnisse (nach Rücknahme, Neustart, Verlassen). Pause hält das Ausführen eines bereits berechneten Zugs an.
5. **Stabile Stein-IDs (`PieceTracker`).** Ein Geysir verschiebt eine ganze Spalte; damit SwiftUI das als
   Bewegung (statt Neuzeichnen) animiert, behält jeder Stein seine ID. IDs sind deterministisch, sodass ein
   Nachspielen nach einer Rücknahme dieselben IDs erzeugt.
6. **Synthetisierte Audiodateien.** Alle Klänge und die Musik werden beim Start per `AVAudioEngine` erzeugt.
   Es gibt keine fremden Audiodateien und damit keine Lizenzfragen. Die Session-Kategorie `.ambient`
   respektiert den Stummschalter.
7. **Datengetriebene Inhalte.** Arenen, Steindesigns, Rätsel und Tutorialschritte sind reine Daten. Neue
   Inhaltspakete brauchen keine Regeländerung.
8. **Keine externen Abhängigkeiten**, keine Netzwerkzugriffe, keine Werbung, keine In-App-Käufe.

## KI-Stufen

| Stufe | Suche | Zeitbudget | Besonderheit |
|---|---|---|---|
| Lehrling | Tiefe 2 | 0,4 s | wählt zufällig unter Zügen bis 45 Punkte unter dem besten; 30 % nur 1 Zug tief; Fähigkeiten selten |
| Stratege | Tiefe 4 | 0,8 s | kleine Streuung (10 Punkte) |
| Meister | Tiefe 7 | 0,9 s | exakt bester Zug |
| Großmeister | iterative Vertiefung bis 24 | 2,0 s | volle Transpositionstabelle |

Fähigkeiten werden bis Halbzug 6 vollständig durchsucht und danach ausgeblendet. Ohne diese
Begrenzung wächst der Verzweigungsgrad auf über 100.

## Erweiterungspunkte

- Neue Arena: einen Eintrag in `Arena.catalog` anlegen. `RulesTests.testAllArenasAreValid` prüft ihn.
- Neues Rätsel: einen Eintrag in `Puzzle.catalog` anlegen. Der Solver-Test beweist automatisch den erzwungenen Gewinn.
- Neues Steindesign: einen Eintrag in `StoneSkin.catalog` anlegen und eine Palette in `SkinPalette.forSkin`.
- Online- oder Game-Center-Modus: `Match` ist vollständig über die Zugliste serialisierbar und eignet sich
  damit direkt als Übertragungsformat.
