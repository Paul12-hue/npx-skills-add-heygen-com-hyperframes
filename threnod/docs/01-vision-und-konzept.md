# THRENOD – The Last Song of a Forgotten World

## Game Design Document · Phase 1: Vision und Konzept

**Status:** ✅ Freigegeben

---

## 1. Kernidee

> **The gods are dead. The world is forgetting itself. You are the one it already forgot.**

Vor langer Zeit starben die Götter. Die Welt stimmte ein Klagelied für sie an, den **Threnod**, doch es blieb unvollendet. Seitdem verliert die Welt ihr Gedächtnis. Dieses Vergessen heißt **the Hush**: Dörfer verschwinden, Namen gehen verloren, ganze Landstriche verblassen zu grauem Nebel.

Die Spielfigur ist **„the Unsung“**: ein Mensch, an den sich niemand mehr erinnert. Genau deshalb hört sie als Einzige die Bruchstücke des Threnod.

**Zentrale Frage des Spiels:** Soll man das Lied vollenden, und was kostet das?

## 2. Die fünf Säulen

1. **Every place remembers:** Die Geschichte steckt in der Umgebung und wird nur in Bruchstücken erzählt.
2. **Warmth against the dark:** 60 % düster, 40 % gemütlich.
3. **Every fight is a duel:** Allein, rundenbasiert, gut lesbar, mit Gewicht.
4. **Found, not given:** Verse und Techniken findet man in der Welt.
5. **The world remembers you:** Entscheidungen verändern die Welt dauerhaft.

## 3. Genre und Zielgruppe

- Fantasy-RPG mit Third-Person-Kamera in offenen Regionen. Die rundenbasierten Duelle beginnen ohne Bildwechsel direkt in der Welt.
- Ton: Dark und Gothic Fantasy mit gemütlichen Momenten
- Zielgruppe: 18 bis 45 Jahre, nostalgische RPG-Spieler, Fans von Lore und Atmosphäre, Freunde gemütlicher Spiele
- Alterseinstufung ungefähr 16
- Spielsprache Englisch, ohne Sprachausgabe

## 4. Visuelle Identität: „Vorgerenderte CGI der CD-ROM-Zeit“ *(überarbeitet nach Spieltest)*

Vorbild sind die Dark-Fantasy-Videos des Nutzers (`fantasy/`). Der erste Entwurf mit 32 erdigen Farben wurde verworfen.
- Kräftiges Violett, giftiges Grün, feuriges Orange und Gold vor nächtlichem Himmel mit großem orangem Mond
- Glänzende Oberflächen mit Relief (Bump-Mapping), leuchtende Fenster, Laternen, Pilze und Kristalle (Bloom)
- **Alter-Spiel-Pass** (wie in den Videos): niedrige interne Auflösung (240–380p) mit harten Pixeln, 18 Farbstufen je Kanal mit Bayer-Dithering, leichtes Farbbluten, Scanlines, facettierte Flächen und grobe Texturen
- Figuren: weich modelliert mit freundlichem Gesicht; Dialog-Porträts im Stil der Videos (Canva AI)
- Die Unsung ist **nicht** gruselig: eine sympathische, melancholische Wanderin mit silbernem Haar

## 5. Klang

- Jede Region hat ein eigenes Leitmotiv. Jedes Motiv ist ein **Vers des Threnod**.
- Instrumente: Laute, Drehleier, Chor, Glocken. Stille ist ein bewusstes Mittel.
- Hinweis: Per Code erzeugte Musik klingt reduziert. CC0-Musik kommt nur nach Freigabe dazu.

## 6. Gameplay

**Spielkreislauf:** Erkunden → Entdecken → Duell → Heimkehr → Entscheiden

**Kampf**
- Nahtlose rundenbasierte Duelle direkt in der Welt
- Ein Hinterhalt gibt den ersten Zug
- Gemeinsame Ressource **Breath** für Schläge, Blocken und Gesang
- Die Absichten des Gegners sind sichtbar
- Bosse mit mehreren Phasen und eigener Mechanik

**Begleiter**
- 4 bis 6 Begleiter mit großer Tiefe, ohne Romanzen
- Sie können dich verlassen oder verraten. Sie sterben nur durch Story-Entscheidungen.
- Im Kampf leisten sie einmal pro Kampf **Beistand**
- Söldner sind gegen Gold für einzelne Aufträge anheuerbar und leisten ebenfalls nur Beistand

**Magie: Gesang**
- Verse werden in der Welt gefunden
- Aus 2 bis 4 Versen entstehen Lieder. Lange Lieder dauern mehrere Runden und können unterbrochen werden.
- Verse des Threnod haben Folgen für die Story

**Pfade:** Blade, Bulwark, Shadow, Song, Faith. Sie sind frei kombinierbar. Besondere Techniken gibt es bei Lehrern, in Büchern und an Gräbern.

**Systeme:** Schmieden, Fraktionen mit Ruf, Handel, Sammelobjekte, Schleichen und Diebstahl.
*Nicht im Spiel:* Kochen, Alchemie, Gewichtslimit.

**Gemütliche Momente:** Taverne, eigenes Zuhause, Dorffeste, Lagerfeuer, das Kartenspiel „Nine Candles“

**Welt**
- Regionen mit Übergängen, ohne Questmarker
- Die Karte zeigt nur Entdecktes
- Fortbewegung zu Fuß und auf einem Reittier
- Schnellreise über Glockentürme
- Tag und Nacht, NPC-Tagesabläufe, dauerhafte Folgen

**Schwierigkeit:** Story, Balanced, Harrowing. Neustart am letzten Rastplatz.

## 7. Technik

| Bereich | Entscheidung |
|---|---|
| Plattform | Browser auf iPad (Safari) und PC; nur private Testlinks |
| Zielgerät | iPad A16, Ziel 30 FPS (PC: 60 FPS) |
| Stack | Three.js + TypeScript + Vite |
| Steuerung | Touch, Maus und Tastatur, Bluetooth-Controller |
| Inhalte | Datengetrieben (Quests, Dialoge, Gegner, Items als Daten) |
| Speichern | Lokal im Browser, mit Export und Import |
| Assets | Per Code erzeugt, dazu CC0-Assets nur nach Freigabe; nichts Kostenpflichtiges |
| Tests | Automatisch in einem Browser ohne Bildschirm; der Spieltest findet auf dem iPad statt |
| Ablage | Ordner `threnod/` in diesem Repository |
