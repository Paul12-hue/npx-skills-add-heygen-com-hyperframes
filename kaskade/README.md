# KASKADE

**Vier in einer Reihe, neu erfunden.** KASKADE ist ein natives iPad-Spiel in Swift und SwiftUI. Die
Grundregel kennt jeder: Steine fallen in Spalten, und wer zuerst vier in einer Reihe hat, gewinnt. Dazu
kommen **Kristalle**, die Energie liefern, und drei Fähigkeiten, die das Brett umformen:

| | Kosten | Wirkung |
|---|---|---|
| **Anker** | 2 | Wirf einen neutralen Stein, danach sofort einen normalen. |
| **Geysir** | 2 | Schiebe einen eigenen Stein von unten ein. Die ganze Spalte steigt eine Reihe auf. |
| **Spalt** | 3 | Entferne den obersten Stein einer Spalte, danach wirfst du sofort selbst. |

Regeln, Balancing und Konzeptbewertung stehen in [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md), die
Architektur in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), die Testergebnisse in
[`docs/TEST_REPORT.md`](docs/TEST_REPORT.md).

## Funktionen

- **Spielmodi:** Solo gegen KI (Lehrling, Stratege, Meister, Großmeister), lokales Duell zu zweit (mit
  Tischmodus), Training (Rücknahmen, KI-Hinweise, optionaler KI-Gegner), Rätsel (5 Stellungen, vom
  Solver bewiesen), interaktives Tutorial in 7 Schritten.
- **5 Arenen:** Ursprung, Klassik (ohne Fähigkeiten), Monolith, Weite (8×7), Kristallgrotte. Sie werden
  über das Level freigeschaltet.
- **Fortschritt:** XP und Level, 12 Erfolge, 5 kosmetische Steindesigns, ausführliche Statistik.
- **Komfort:** Rücknahme, Pause, Neustart und Aufgeben (mit Bestätigung). Die Partie wird automatisch
  gespeichert und lässt sich nach einem App-Neustart fortsetzen.
- **iPad-gerecht:** Quer- und Hochformat, Split View, große Touch-Ziele, Landefeld-Vorschau beim Ziehen
  über das Brett, Rückmeldung bei ungültigen Zügen (Text, Wackeln, Ton, Haptik), Safe Areas,
  aufgeschobene Systemgesten am unteren Rand, VoiceOver-Grundunterstützung, Option „Reduzierte Bewegung“.
- **Audio:** synthetisierte Soundeffekte und optionale Ambient-Musik ohne fremde Audiodateien. Der
  Stummschalter wird respektiert.
- **Datenschutz:** Alles bleibt lokal auf dem Gerät. Es gibt kein Konto, kein Netzwerk, keine Werbung und
  keine In-App-Käufe.

## Voraussetzungen

- Mac mit **Xcode 16 oder neuer**. Das Projekt nutzt synchronisierte Ordner (objectVersion 77).
- iPad mit **iPadOS 17 oder neuer**.
- Eine Apple-ID. Die kostenlose Mitgliedschaft reicht für das eigene iPad, die Signatur gilt dann 7 Tage.

## Auf dem iPad installieren

1. Repository auf den Mac klonen und `kaskade/Kaskade.xcodeproj` in Xcode öffnen.
2. Links das Projekt **Kaskade** wählen, dann Target **Kaskade** und den Tab **Signing & Capabilities**:
   - „Automatically manage signing“ aktiv lassen.
   - Unter **Team** die eigene Apple-ID wählen. Falls nötig, vorher unter Xcode › Settings › Accounts anmelden.
   - **Bundle Identifier** auf einen eigenen, eindeutigen Wert ändern, z. B. `de.deinname.kaskade`.
3. iPad per Kabel verbinden (oder im selben WLAN koppeln), entsperren und „Diesem Computer vertrauen“ bestätigen.
4. Auf dem iPad den **Entwicklermodus** einschalten: Einstellungen › Datenschutz & Sicherheit ›
   Entwicklermodus. Danach startet das iPad neu.
5. In Xcode oben das iPad als Ziel wählen und **▶ Run** drücken (⌘R).
6. Beim ersten Start mit einer kostenlosen Apple-ID: auf dem iPad unter Einstellungen › Allgemein ›
   VPN & Geräteverwaltung dem Entwicklerprofil vertrauen, dann die App öffnen.

**Im Simulator:** In Xcode ein iPad-Simulatorgerät wählen, zum Beispiel „iPad Pro 13-inch“, und ⌘R drücken.

**Per TestFlight** (mit kostenpflichtigem Developer Program): Product › Archive, dann im Organizer
„Distribute App“ und „TestFlight & App Store“ wählen. Das iPad installiert die App anschließend über die
TestFlight-App.

## Spielen in 30 Sekunden

1. Im Hauptmenü auf **Tutorial** tippen. Es dauert etwa zwei Minuten.
2. **Neues Spiel**, dann *Solo gegen KI*, dann *Lehrling*, dann **Spiel starten**.
3. Finger über das Brett ziehen: Ein Vorschau-Stein zeigt, wo er landet. Loslassen wirft ihn.
4. Fähigkeit antippen (sie leuchtet), dann die Spalte wählen. Ein erneutes Antippen bricht ab.

## Tests

```bash
# Spiellogik, KI, Rätsel, Fortschritt (macOS oder Linux)
cd kaskade/KaskadeCore && swift test

# Balancing und KI-Stärke messen (Selbstspiel, Release-Build)
swift run -c release KaskadeSim 40 origin 0.3 master master

# App- und UI-Tests im Simulator (macOS)
xcodebuild -project kaskade/Kaskade.xcodeproj -scheme Kaskade \
  -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M4)' test
```

Der Workflow `.github/workflows/kaskade-ios.yml` macht bei jedem Push dasselbe auf einem macOS-Runner und
erzeugt dabei auch Screenshots.

## Veröffentlichung im App Store – was noch fehlt

1. **Apple Developer Program** (99 €/Jahr) beitreten und das Team im Projekt eintragen.
2. **Bundle-ID** festlegen. `com.example.kaskade` ist nur ein Platzhalter. Anschließend in
   **App Store Connect** einen App-Eintrag anlegen: Name, Primärsprache Deutsch, Kategorie Spiele › Brettspiele.
3. **Markenprüfung des Namens:** Vor der Veröffentlichung prüfen, ob „Kaskade“ in den Zielmärkten frei
   ist (DPMA/EUIPO). Bei Bedarf umbenennen.
4. **Store-Material:** iPad-Screenshots in 13 Zoll (2064×2752 bzw. 2752×2064), Beschreibung,
   Schlüsselwörter, Support-URL und **Datenschutzrichtlinien-URL**. Die Richtlinie kann kurz sein, weil die
   App keine Daten erhebt.
5. **App-Datenschutz-Angaben** in App Store Connect: „Keine Daten erfasst“. Ein Privacy Manifest
   (`PrivacyInfo.xcprivacy`) ist für diese App nicht zwingend, weil sie keine Required-Reason-APIs nutzt.
   Vor dem Upload sollte das noch einmal geprüft werden.
6. **Altersfreigabe** über den Fragebogen ausfüllen (voraussichtlich 4+), **Exportkonformität**
   beantworten (keine Verschlüsselung, im Projekt bereits per `ITSAppUsesNonExemptEncryption = NO`
   gesetzt) und den Preis wählen.
7. Auf **echten iPads** testen, mindestens ein kleines Modell (iPad mini) und ein großes. Dazu interne und
   externe TestFlight-Tester einladen.
8. Product › Archive, „Distribute App“ auswählen, Build hochladen, zur Prüfung einreichen.
9. Optional: Lokalisierung (Englisch), Game Center (Erfolge, Ranglisten), weitere Arena-Pakete.
