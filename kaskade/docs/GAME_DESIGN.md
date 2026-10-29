# KASKADE – Game Design

## 1. Konzeptbewertung

Bewertet wurden sieben Klassiker als Grundlage. Skala 1–5, höher ist besser.

| Konzept | Verständlich | Tiefe | Wiederspielwert | Touch | Mehrspieler-Spaß | Umsetzbar | App-Potenzial | Summe |
|---|---|---|---|---|---|---|---|---|
| **A. Vier-in-einer-Reihe mit Kristall-Energie und drei Fähigkeiten** | 5 | 4 | 4 | 5 | 4 | 5 | 5 | **32** |
| B. Schach mit Feldzonen und Ressourcen | 2 | 5 | 5 | 3 | 4 | 2 | 3 | 24 |
| C. Würfelrennen (Mensch-ärgere-dich-Prinzip) mit Fähigkeiten | 5 | 2 | 3 | 4 | 5 | 4 | 3 | 26 |
| D. Dame mit Verwandlungsfeldern | 4 | 3 | 3 | 4 | 3 | 4 | 3 | 24 |
| E. Domino mit Kettenreaktionen | 4 | 3 | 3 | 3 | 3 | 3 | 3 | 22 |
| F. Verschachteltes Tic-Tac-Toe mit Sperrfeldern | 4 | 3 | 3 | 5 | 3 | 5 | 2 | 25 |
| G. Gebietseroberung (Risiko-Prinzip) im Kleinformat | 2 | 4 | 4 | 3 | 4 | 2 | 3 | 22 |

**Entscheidung: Konzept A.** Das Prinzip „Steine fallen in Spalten, vier in einer Reihe
gewinnen“ kennt jeder sofort. Ein Zug ist ein einziger Fingertipp auf eine Spalte, also
ideal für Touch. Eine Partie dauert 3 bis 8 Minuten. Das Spiel ist vollständig
deterministisch, deshalb lässt sich eine starke Minimax-KI bauen. Gegen Schach sprechen die
lange Einarbeitung und eine sehr teure KI, gegen das Würfelrennen der hohe Zufallsanteil.

## 2. Identität

- **Name:** KASKADE. Steine stürzen wie ein Wasserfall, Fähigkeiten lösen Kettenreaktionen aus.
- **Fraktionen:** *Sonne* (warmes Bernstein, beginnt) gegen *Mond* (kühles Eisblau).
- **Stil:** eine tiefe Nachtschlucht, ein Spielbrett aus dunklem Glas, leuchtende Steine
  und schwebende Kristalle. Die Farben, Formen und Symbole sind eigene Entwürfe. Es gibt
  keine Anlehnung an bestehende Marken.

## 3. Grundregeln

1. Das Brett ist 7 Spalten breit und 6 Reihen hoch, je nach Arena auch anders.
   Steine fallen immer auf den tiefsten freien Platz.
2. Die Sonne beginnt. Danach wird abwechselnd gezogen.
3. **Ziel:** vier eigene Steine in einer Reihe, waagerecht, senkrecht oder diagonal.
4. **Kristalle** schweben in einigen leeren Feldern. Wer ein Kristallfeld zuerst mit einem
   eigenen Stein besetzt, erhält **+1 Energie** (höchstens 3). Ein neutraler Stein zerstört
   den Kristall, ohne dass jemand Energie bekommt.
5. **Fähigkeiten** kosten Energie. Pro Zug darf höchstens eine eingesetzt werden.

| Fähigkeit | Kosten | Wirkung | Zugfolge |
|---|---|---|---|
| **Anker** | 1 | Wirf einen neutralen Stein, der niemandem gehört. | Danach sofort ein normaler Wurf. |
| **Geysir** | 2 | Schiebe einen eigenen Stein **von unten** in eine Spalte. Alle Steine darin steigen eine Reihe auf. | Das ist dein Wurf. |
| **Spalt** | 3 | Entferne den obersten Stein einer Spalte (egal wessen). | Danach sofort ein normaler Wurf. |

### Ablauf eines Zuges
- **Normal:** auf eine Spalte tippen. Der Stein fällt.
- **Fähigkeit:** die Fähigkeit antippen, dann die Spalte antippen. Bei Anker und Spalt
  folgt danach sofort ein normaler Wurf.

### Sieg, Niederlage, Remis
- Wer nach seinem Zug eine Vierer-Reihe besitzt, gewinnt.
- Ein Geysir kann **beiden** Seiten gleichzeitig eine Reihe verschaffen. Dann gewinnt, wer
  gezogen hat („Wer die Kaskade auslöst, gewinnt“). Entsteht durch einen Geysir nur eine
  Reihe des Gegners, verliert der Ziehende.
- Kann der Spieler am Zug keinen legalen Zug machen (Brett voll, kein Spalt möglich),
  endet die Partie remis.
- Jede Partie endet sicher, weil Energie endlich ist und Kristalle verbraucht werden.

## 4. Balancing (Begründung)

- **Anzugsvorteil:** Beim klassischen Prinzip gewinnt der Beginnende bei perfektem Spiel.
  Darum startet der Mond mit **1 Energie**, die Sonne mit 0.
- **Anker** ist kein schwächerer eigener Stein, sondern ein **Paritätswerkzeug**. Der
  neutrale Stein verschiebt, wer in ein Drohfeld spielen muss (Zugzwang). Über ihn hinweg
  lässt sich eine Drohung blockieren, die eine Reihe über dem spielbaren Feld liegt.
  Deshalb ist er billig.
- **Geysir** verändert eine ganze Spalte, damit auch Waagerechte und Diagonalen. Er
  erzeugt die spektakulärsten Wendungen, kann aber auch dem Gegner eine Reihe schenken.
  Das ist ein bewusstes Risiko.
- **Spalt** bricht einen einzelnen Block auf. Er kostet die volle Energie, damit er selten
  und angekündigt ist: Ein voller Energiebalken leuchtet beim Gegner sichtbar auf. So
  entsteht eine Lesbarkeitsregel: *Steht der Gegner auf 3 Energie, reicht ein einzelner
  Block nicht.*
- **Kristalle** liegen symmetrisch in der Brettmitte. Sie belohnen aktive Zentrumskontrolle
  und sind verbraucht, sobald jemand sie besetzt. Insgesamt kommen nur wenige Energiepunkte
  ins Spiel, Fähigkeiten bleiben besondere Momente.
- Die Werte wurden mit KI-gegen-KI-Partien geprüft (siehe `TEST_REPORT.md`).

## 5. Lernkurve

- **Minute 0–1:** Das interaktive Tutorial zeigt Wurf, Vierer-Reihe und Blocken.
- **Minute 1–2:** Kristall einsammeln, dann je ein geführter Einsatz von Anker, Geysir und Spalt.
- In der Arena **Klassik** wird ohne Fähigkeiten gespielt, als Einstieg für Puristen.
- Der Lehrling (leichteste KI) macht menschliche Fehler, damit erste Siege schnell kommen.

## 6. Tiefe für Erfahrene

- Paritäts- und Zugzwangspiel wie im Klassiker, erweitert um den Anker als Paritätswechsler.
- Energie-Ökonomie: Wann lohnt sich ein Kristall? Wann muss man den Gegner von 3 Energie
  fernhalten?
- „Sichere“ Blöcke, also überbaute Steine, gegen den Spalt.
- Geysir-Kombinationen, die mehrere Linien gleichzeitig verschieben.
- **Rätsel**: handgebaute Stellungen, die die KI als „Gewinn in N Zügen“ verifiziert.

## 7. Spielmodi

| Modus | Beschreibung |
|---|---|
| Solo gegen KI | 4 Stufen: Lehrling, Stratege, Meister, Großmeister. Seite frei wählbar. |
| Duell (lokal) | Zwei Spieler an einem iPad, optional im Tischmodus (Gegner-Anzeige um 180° gedreht). |
| Training | Freies Spiel ohne Wertung: beliebig viele Rücknahmen, KI-Hinweis, Seiten beliebig steuern. |
| Rätsel | Stellungen „Gewinne in N Zügen“. Die KI verteidigt optimal. |
| Tutorial | Interaktive, geführte Einführung in 7 Schritten. |

## 8. Fortschritt und Belohnungen

- **XP** für jede gewertete Partie. Höhere KI-Stufen und Siege bringen mehr, Partien mit
  Rücknahme zählen nur halb.
- **Level** schalten **Arenen** frei (Monolith, Weite, Kristallgrotte) und **Steindesigns**
  (rein kosmetisch).
- **Erfolge**: zwölf Herausforderungen, zum Beispiel „Siege per Geysir“, „Großmeister
  bezwungen“ oder „Sieg ohne Fähigkeit in einer Fähigkeits-Arena“.
- **Statistik**: Siege, Niederlagen und Remis je Stufe, Serien, Fähigkeitseinsatz,
  gesammelte Kristalle.
- Es gibt keine Werbung, keine In-App-Käufe und keine Online-Pflicht. Arenen, Designs und
  Rätsel sind datengetrieben aufgebaut. Spätere Erweiterungen wie neue Arena-Pakete lassen
  sich ohne Umbau ergänzen.

## 9. Arenen

| Arena | Größe | Besonderheit | Freischaltung |
|---|---|---|---|
| Ursprung | 7×6 | 4 Kristalle, Standardregeln | Level 1 |
| Klassik | 7×6 | keine Kristalle, keine Fähigkeiten | Level 1 |
| Monolith | 7×6 | drei feste neutrale Steine am Boden, 4 Kristalle | Level 3 |
| Weite | 8×7 | großes Brett, 6 Kristalle, mehr Startenergie | Level 5 |
| Kristallgrotte | 7×6 | 8 Kristalle, energiereich und wild | Level 7 |
